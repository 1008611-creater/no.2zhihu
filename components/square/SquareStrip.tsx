"use client";

import { useEffect, useMemo, useRef } from "react";
import Link from "next/link";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import type { SquareLayout, SquareScope, TopicNode } from "@/lib/domain/square-layout";
import { SCOPE_LABELS } from "@/lib/domain/square-layout";

/**
 * 虚拟广场 · 移动端降级 —— 横向滑动的话题街区。
 *
 * 为什么必须在 JS 层分叉，而不是只用 CSS 把画布缩小：
 * 规格原文是「移动端降级为横向滑动的话题街区」。实测过：390×780 的手机上，
 * 22 张卡铺开的广场即使「全景」也只有 18% —— 每张卡 30px，标题糊成灰点，
 * 手指也没法在 390px 宽里做精确的拖拽 + 缩放。硬留画布等于让手机上的人
 * 看一堆读不出的方块。
 *
 * 降级成横向滑动后：一次一屏读一张卡，滑动是系统原生手势（不用自己写
 * touch 逻辑），缩略地图与缩放控制这类「空间导航」控件在窄屏没有意义，
 * 一并去掉（见 frontend-v2.css 的 640px 断点）。
 *
 * 保留的：中央最热那场排在第一位、主题标签、头像、一句回答预览、
 * 点击展开详情 —— 广场的「内容」全部保留，只换掉「空间」这层表达。
 */

export interface SquareStripProps {
  layout: SquareLayout;
  focusedId: string | null;
  onFocus: (node: TopicNode | null) => void;
  onOpen: (node: TopicNode) => void;
  renderDetail: (node: TopicNode) => React.ReactNode;
  /** 当前筛选（规格：全部 / 正在发生 / 等真人回答 / 我的讨论） */
  scope: SquareScope;
  onScope: (s: SquareScope) => void;
  /** 筛选前的总数，用于「共 N 场，其中 M 场符合」的如实提示 */
  totalCount: number;
}

export default function SquareStrip({
  layout,
  focusedId,
  onFocus,
  onOpen,
  renderDetail,
  scope,
  onScope,
  totalCount,
}: SquareStripProps) {
  const trackRef = useRef<HTMLDivElement | null>(null);
  const reduced = useReducedMotion();

  /**
   * 顺序：最热的排第一（layout.nodes[0] 就是中央那场），
   * 我自己的讨论紧跟其后 —— 手机上「先看到什么」比「空间位置」重要。
   */
  const ordered = useMemo(() => {
    const mine = layout.nodes.filter((n) => n.mine);
    const rest = layout.nodes.filter((n) => !n.mine);
    return [...mine, ...rest];
  }, [layout.nodes]);

  const focused = useMemo(
    () => (focusedId ? ordered.find((n) => n.id === focusedId) ?? null : null),
    [focusedId, ordered],
  );

  /** 聚焦某张卡时把它滚进视野中间，否则详情展开后用户找不到自己在看哪张。 */
  useEffect(() => {
    if (!focusedId) return;
    const el = trackRef.current?.querySelector<HTMLElement>(`[data-strip-card="${focusedId}"]`);
    el?.scrollIntoView({
      behavior: reduced ? "auto" : "smooth",
      inline: "center",
      block: "nearest",
    });
  }, [focusedId, reduced]);

  return (
    <div className="sqs-root">
      <div className="sqs-top">
        此刻，广场上有 <b>{ordered.length}</b> 场讨论正在发生
      </div>

      {/* 筛选：小屏上横向滚动本来就要靠滑，筛选条做成一行可横滑的 chip，
          与列表同向，不会引入第二种手势。 */}
      <div className="sqs-filters" role="tablist" aria-label="广场筛选">
        {SCOPE_LABELS.map((s) => (
          <button
            key={s.key}
            role="tab"
            aria-selected={scope === s.key}
            className={"sq-filter" + (scope === s.key ? " sq-filter-on" : "")}
            onClick={() => onScope(s.key)}
          >
            {s.label}
          </button>
        ))}
      </div>
      {scope !== "all" && totalCount > ordered.length && (
        <div className="sqs-note">
          共 {totalCount} 场，其中 {ordered.length} 场符合
        </div>
      )}

      <div className="sqs-track" ref={trackRef}>
        {ordered.map((n) => (
          <button
            key={n.id}
            type="button"
            data-strip-card={n.id}
            className={"sqs-card" + (n.mine ? " sqs-card-mine" : "") + (focusedId === n.id ? " sqs-card-on" : "")}
            onClick={() => onFocus(focusedId === n.id ? null : n)}
            aria-pressed={focusedId === n.id}
          >
            <span className={"sqs-bar a-" + n.theme.accent} />
            <span className="sqs-meta">
              {n.mine && <span className="sqs-mine-tag">我的</span>}
              <span className="sqs-theme">
                <span className={"sq-cluster-dot a-" + n.theme.accent} />
                {n.theme.label}
              </span>
              <span className="sqs-status">{n.statusLabel}</span>
            </span>

            <span className="sqs-title">{n.title}</span>

            {n.preview && <span className="sqs-preview">{n.preview}</span>}

            <span className="sqs-foot">
              <span className="sqs-avatars">
                {n.avatarNames.map((name, i) => (
                  <span key={name + i} className="sq-avatar" title={name}>
                    {name.slice(0, 1)}
                  </span>
                ))}
              </span>
              <span className="sqs-count">{n.answerCount} 位分身</span>
            </span>
          </button>
        ))}

        {/* 滑到末尾给一个「换个题目」的出口，避免横向列表变成死胡同 */}
        <Link className="sqs-card sqs-card-cta" href="/">
          <span className="sqs-title">广场上没有你想问的？</span>
          <span className="sqs-preview">去首页问一个新的，它会出现在这里。</span>
          <span className="sqs-cta">去提问 →</span>
        </Link>
      </div>

      <AnimatePresence>
        {focused && (
          <motion.div
            key={focused.id}
            className="sqs-detail"
            initial={reduced ? { opacity: 0 } : { opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduced ? { opacity: 0 } : { opacity: 0, y: 16 }}
            transition={reduced ? { duration: 0.12 } : { type: "spring", stiffness: 280, damping: 30 }}
          >
            <div className="sqs-detail-head">
              <div className="sqs-detail-theme">
                <span className={"sq-cluster-dot a-" + focused.theme.accent} />
                {focused.theme.label}
                <span className="dim"> · {focused.statusLabel}</span>
              </div>
              <h2 className="sqs-detail-title">{focused.title}</h2>
              {focused.avatarNames.length > 0 && (
                <div className="sqs-detail-avatars">
                  {focused.avatarNames.map((name, i) => (
                    <span key={name + i} className="sq-avatar sq-avatar-lg" title={name}>
                      {name.slice(0, 1)}
                    </span>
                  ))}
                  <span className="dim" style={{ fontSize: 12.5, marginLeft: 8 }}>
                    {focused.answerCount} 位分身参与
                  </span>
                </div>
              )}
            </div>
            <div className="sqs-detail-body">{renderDetail(focused)}</div>
            <div className="sqs-detail-actions">
              <button className="btn btn-primary" onClick={() => onOpen(focused)}>
                载入工作台看完整讨论
              </button>
              <button className="btn btn-ghost" onClick={() => onFocus(null)}>
                收起
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
