"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import type {
  SquareLayout,
  SquareScope,
  TopicNode,
  Viewport,
} from "@/lib/domain/square-layout";
import {
  SCOPE_LABELS,
  clampScale,
  fitViewport,
  focusViewport,
  homeViewport,
  myLocationNode,
  toWorld,
  zoomAt,
} from "@/lib/domain/square-layout";

/**
 * 虚拟广场 · 无限画布。
 *
 * 规格（老大给的，2026-09-15）：
 *   · 按住空白处拖动 → 平移；滚轮 → 缩放；**禁止页面上下滚动**
 *   · 中央是当前最活跃的话题，卡片最大，周围显示三个答主头像
 *   · 其他话题按主题松散聚集，大小随热度，差异克制
 *   · 悬停：卡片轻微升起、头像依次浮现、显示一句回答预览
 *   · 点击：镜头平滑聚焦并放大，原地展开讨论详情；关闭后缩回
 *   · 新话题从边缘缓慢进入；正在回答的话题带很轻的呼吸光点
 *   · 左下角缩略地图；右下角「回到我的位置」+「发现一场讨论」
 *   · 顶部一句「此刻，广场上有 N 场讨论正在发生」+ 筛选项
 *
 * 实现优先级（老大明确）：
 *   ① 拖拽 ② 缩放 ③ 节点聚焦 ④ 头像展开 —— 这四个先做扎实。
 *   ⑤ 缩略地图、⑥ 复杂关系聚类放后续（这里给的是克制版，够用不外溢）。
 *
 * 技术要点：
 *   · 用一个 `transform: translate(x,y) scale(s)` 的容器承载所有卡片，
 *     而不是给每个节点单独算屏幕坐标 —— 后者在缩放时会有累积误差。
 *   · 拖动用 Pointer Events（不是 mouse/touch 各写一套），并 setPointerCapture，
 *     这样手指滑出元素也不会丢事件。
 *   · 滚轮必须 `passive: false` 才能 preventDefault，否则页面还是会滚 ——
 *     而「禁止页面上下滚动」是规格里的硬要求。
 *   · 缩放锚定鼠标位置（zoomAt），否则体感「不跟手」。
 */

export interface SquareCanvasProps {
  layout: SquareLayout;
  /** 当前聚焦的节点 id；null = 广场全景 */
  focusedId: string | null;
  onFocus: (node: TopicNode | null) => void;
  /** 点击「载入工作台」 */
  onOpen: (node: TopicNode) => void;
  /** 发现一场讨论：随机挑一个节点聚焦 */
  onRandom?: () => void;
  /** 是否有话题正在生成（用于呼吸光点） */
  pendingIds?: string[];
  /** 渲染详情面板 */
  renderDetail: (node: TopicNode) => React.ReactNode;
  /** 当前筛选（规格：全部 / 正在发生 / 等真人回答 / 我的讨论） */
  scope: SquareScope;
  onScope: (s: SquareScope) => void;
  /** 筛选前的总数，用于「筛掉了几场」的如实提示 */
  totalCount: number;
}

const DRAG_THRESHOLD = 4; // 像素：小于这个距离算「点击」，防止拖完误触聚焦

export default function SquareCanvas({
  layout,
  focusedId,
  onFocus,
  onOpen,
  onRandom,
  pendingIds = [],
  renderDetail,
  scope,
  onScope,
  totalCount,
}: SquareCanvasProps) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [viewport, setViewport] = useState<Viewport>({ x: 0, y: 0, scale: 1 });
  const [size, setSize] = useState({ w: 1200, h: 760 });
  const [hovered, setHovered] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  /**
   * 用户是否主动切到了「全景」。
   *
   * 为什么需要这个状态：关闭详情时（focusedId → null）默认要「缩回广场」，
   * 但「广场」有两个合理含义 —— 家视角（站在最热那场附近）和全景（看全部街区）。
   * 用户点过「全景」后，他心里的「缩回」就是全景；没点过就是家视角。
   * 不记这个状态的话，点完全景、随便点开一张卡再关掉，视角会莫名跳回家，
   * 用户会觉得「我明明刚拉到全景，怎么又跑回来了」。
   */
  const [panorama, setPanorama] = useState(false);

  const drag = useRef({
    active: false,
    moved: false,
    startX: 0,
    startY: 0,
    originX: 0,
    originY: 0,
    pointerId: -1,
  });

  const reduced = useReducedMotion();

  /* ------------------------------ 视口尺寸 ------------------------------ */

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const update = () => {
      const r = el.getBoundingClientRect();
      setSize({ w: Math.max(r.width, 320), h: Math.max(r.height, 320) });
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  /* ------------------------------ 初始取景 ------------------------------ */

  /**
   * 首次挂载 / 布局变化时落到「家视角」。
   *
   * 为什么不是 fitViewport：22 场讨论铺开后包围盒约 2000px，1440 视口下
   * fit 只能到 40%，标题糊成 8px 读不了 —— 那不是广场，是看不懂的地图。
   * 家视角 = 对准最热那场 + 0.88 的可读缩放，一眼能读中央话题、
   * 余光看到周围街区。想看全貌用「全景」按钮。
   *
   * 为什么放在 size 就绪之后而不是 mount 时：mount 那一刻容器尺寸还是 0，
   * 按 0 宽高算出来的取景会把内容全推到屏幕外，看起来像「一片空白」。
   */
  useEffect(() => {
    if (ready) return;
    if (size.w <= 320 || size.h <= 320) return;
    if (layout.nodes.length === 0) return;
    setViewport(homeViewport(layout, size.w, size.h));
    setReady(true);
  }, [ready, size, layout]);

  /* ------------------------------ 聚焦 ------------------------------ */

  useEffect(() => {
    if (!ready) return;
    if (!focusedId) {
      // 缩回广场。有「全景」意图就回全景，否则回家视角 ——
      // 见 panorama 状态的注释。
      setViewport(
        panorama
          ? fitViewport(layout.bounds, size.w, size.h)
          : homeViewport(layout, size.w, size.h),
      );
      return;
    }
    const node = layout.nodes.find((n) => n.id === focusedId);
    if (!node) return;
    setViewport(focusViewport(node, size.w, size.h));
  }, [focusedId, ready, size, layout, panorama]);

  /* ------------------------------ 拖拽 ------------------------------ */

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      // 只有空白处能开始拖动画布；卡片上的交互不触发。
      const target = e.target as HTMLElement;
      if (target.closest("[data-topic-card]") || target.closest("[data-no-pan]")) return;
      drag.current = {
        active: true,
        moved: false,
        startX: e.clientX,
        startY: e.clientY,
        originX: viewport.x,
        originY: viewport.y,
        pointerId: e.pointerId,
      };
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    },
    [viewport.x, viewport.y],
  );

  const onPointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d.active) return;
    const dx = e.clientX - d.startX;
    const dy = e.clientY - d.startY;
    if (!d.moved && Math.abs(dx) + Math.abs(dy) < DRAG_THRESHOLD) return;
    d.moved = true;
    setViewport((v) => ({ ...v, x: d.originX + dx, y: d.originY + dy }));
  }, []);

  const endDrag = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const d = drag.current;
      if (!d.active) return;
      d.active = false;
      try {
        (e.currentTarget as HTMLElement).releasePointerCapture(d.pointerId);
      } catch {
        /* 指针可能已被系统回收，忽略 */
      }
      // 拖完（有明显位移）就当作平移手势，不触发「点空白处关闭详情」。
      if (d.moved) return;
      // 点击空白：关闭详情，缩回广场。
      if (focusedId) onFocus(null);
    },
    [focusedId, onFocus],
  );

  /* ------------------------------ 滚轮缩放 ------------------------------ */

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;

    const onWheel = (e: WheelEvent) => {
      // 规格硬要求：滚轮用于缩放，页面不滚。必须 preventDefault，
      // 而浏览器默认把 wheel 监听当 passive → 不生效，所以显式 passive:false。
      e.preventDefault();

      // 触控板双指滚动（deltaX/deltaY 都很小且连续）与鼠标滚轮（deltaY 大）
      // 要分别处理：前者更适合当成平移，后者才是缩放。混在一起会让
      // Mac 用户「想滚一下结果缩得飞起」。
      const isTrackpadPan =
        Math.abs(e.deltaX) > Math.abs(e.deltaY) * 0.8 && Math.abs(e.deltaY) < 12;

      if (isTrackpadPan && !e.ctrlKey) {
        setViewport((v) => ({ ...v, x: v.x - e.deltaX, y: v.y - e.deltaY }));
        return;
      }

      const rect = el.getBoundingClientRect();
      const px = e.clientX - rect.left;
      const py = e.clientY - rect.top;
      // 指数缩放：不同设备 deltaY 量级差别很大，线性缩放会「一下缩到底」。
      const factor = Math.exp(-e.deltaY * 0.0016);
      setViewport((v) => zoomAt(v, px, py, factor));
    };

    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  /* ------------------------------ 双击放大 ------------------------------ */

  const onDoubleClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const target = e.target as HTMLElement;
      if (target.closest("[data-topic-card]")) return;
      const rect = wrapRef.current?.getBoundingClientRect();
      if (!rect) return;
      const px = e.clientX - rect.left;
      const py = e.clientY - rect.top;
      setViewport((v) => zoomAt(v, px, py, 1.6));
    },
    [],
  );

  /* ------------------------------ 回到我的位置 / 全景 ------------------------------ */

  const goMine = useCallback(() => {
    const node = myLocationNode(layout);
    if (!node) return;
    setPanorama(false);
    onFocus(node);
  }, [layout, onFocus]);

  /** 看全景：显式拉远看所有街区，并记住这个意图（见 panorama 状态）。 */
  const goPanorama = useCallback(() => {
    setPanorama(true);
    setViewport(fitViewport(layout.bounds, size.w, size.h));
    onFocus(null);
  }, [layout.bounds, size.w, size.h, onFocus]);

  /** 点卡片：退出全景意图，正常聚焦。 */
  const selectNode = useCallback(
    (node: TopicNode) => {
      setPanorama(false);
      onFocus(node);
    },
    [onFocus],
  );

  const scalePct = Math.round(viewport.scale * 100);

  const focused = useMemo(
    () => (focusedId ? layout.nodes.find((n) => n.id === focusedId) ?? null : null),
    [focusedId, layout.nodes],
  );

  return (
    <div className="sq-root">
      {/* ---------------- 画布 ---------------- */}
      <div
        ref={wrapRef}
        className="sq-canvas"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onDoubleClick={onDoubleClick}
        style={{
          cursor: drag.current.active ? "grabbing" : focusedId ? "default" : "grab",
          touchAction: "none", // 移动端：禁止浏览器接管手势，交给我们的 pan/zoom
        }}
      >
        <div
          className="sq-world"
          style={{
            transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.scale})`,
            // 拖动/聚焦时不要 transition —— 那会让手指拖影；聚焦靠 motion 的
            // 弹簧单独做（见下方 focus 分支），所以这里只在「非拖动」时给短过渡。
            transition: drag.current.active
              ? "none"
              : reduced
                ? "none"
                : "transform 420ms cubic-bezier(0.22, 1, 0.36, 1)",
          }}
        >
          {/* 关系线：若隐若现，形成局部街区（不画成规整流程图） */}
          <svg className="sq-links" aria-hidden>
            {layout.links.map((l, i) => {
              const a =
                l.from.startsWith("@")
                  ? layout.clusters.find((c) => "@" + c.theme.key === l.from)
                  : layout.nodes.find((n) => n.id === l.from);
              const b = layout.nodes.find((n) => n.id === l.to);
              if (!a || !b) return null;
              const ax = a.x;
              const ay = a.y;
              // 二次贝塞尔：控制点垂直偏移，让线是「弧」而不是直线 ——
              // 直线会读成流程图，弧线才像街区之间的小路。
              const mx = (ax + b.x) / 2;
              const my = (ay + b.y) / 2;
              const dx = b.x - ax;
              const dy = b.y - ay;
              const len = Math.hypot(dx, dy) || 1;
              const bend = 34;
              const cx = mx + (-dy / len) * bend;
              const cy = my + (dx / len) * bend;
              return (
                <path
                  key={l.from + "->" + l.to + i}
                  d={`M ${ax} ${ay} Q ${cx} ${cy} ${b.x} ${b.y}`}
                  className="sq-link"
                  style={{ opacity: 0.055 + l.strength * 0.075 }}
                />
              );
            })}
          </svg>

          {/* 主题分区标签：给「街区」一个可读的归属 */}
          {layout.clusters.map((c) => (
            <div
              key={c.theme.key}
              className="sq-cluster"
              style={{
                transform: `translate(${c.x}px, ${c.y}px) translate(-50%, -50%)`,
              }}
            >
              <span className={"sq-cluster-dot a-" + c.theme.accent} />
              <span className="sq-cluster-label">{c.theme.label}</span>
              <span className="sq-cluster-count">{c.count}</span>
            </div>
          ))}

          {/* 话题卡 */}
          {layout.nodes.map((n) => (
            <TopicCard
              key={n.id}
              node={n}
              hovered={hovered === n.id}
              focused={focusedId === n.id}
              dimmed={!!focusedId && focusedId !== n.id}
              pending={pendingIds.includes(n.id)}
              reduced={!!reduced}
              onHover={setHovered}
              onSelect={() => selectNode(n)}
            />
          ))}
        </div>

        {/* 顶部一句话 + 筛选（规格：只保留这一句，不要巨大的静态标题） */}
        <div className="sq-topbar" data-no-pan>
          <span className="sq-count">
            此刻，广场上有 <b>{layout.nodes.length}</b> 场讨论正在发生
          </span>
          <div className="sq-filters" role="tablist" aria-label="广场筛选">
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
            {/* 筛掉了多少如实说 —— 否则用户会以为广场上就只剩这几场 */}
            {scope !== "all" && totalCount > layout.nodes.length && (
              <span className="sq-filter-note">
                共 {totalCount} 场，其中 {layout.nodes.length} 场符合
              </span>
            )}
          </div>
        </div>

        {/* 左下角缩略地图（克制版：位置图 + 当前视口框） */}
        <MiniMap layout={layout} viewport={viewport} size={size} onJump={setViewport} />

        {/* 右下角控制 */}
        <div className="sq-controls" data-no-pan>
          <button className="sq-btn" onClick={goMine} title="回到我的位置">
            <span aria-hidden>◎</span> 我的位置
          </button>
          <button className="sq-btn" onClick={onRandom ?? goPanorama} title="随机逛一场">
            <span aria-hidden>⌾</span> 发现一场讨论
          </button>
          <button className="sq-btn sq-btn-ghost" onClick={goPanorama} title="看全景">
            全景
          </button>
          <span className="sq-zoom mono">{scalePct}%</span>
        </div>
      </div>

      {/* ---------------- 原地展开的详情 ---------------- */}
      <AnimatePresence>
        {focused && (
          <motion.aside
            key={focused.id}
            className="sq-detail"
            initial={reduced ? { opacity: 0 } : { opacity: 0, y: 24, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduced ? { opacity: 0 } : { opacity: 0, y: 18, scale: 0.98 }}
            transition={
              reduced ? { duration: 0.12 } : { type: "spring", stiffness: 260, damping: 30 }
            }
          >
            <div className="sq-detail-head">
              <div style={{ minWidth: 0 }}>
                <div className="sq-detail-theme">
                  <span className={"sq-cluster-dot a-" + focused.theme.accent} />
                  {focused.theme.label}
                  <span className="dim"> · {focused.statusLabel}</span>
                </div>
                <h2 className="no-tail sq-detail-title">{focused.title}</h2>
              </div>
              <button
                className="sq-close"
                onClick={() => onFocus(null)}
                aria-label="关闭详情，回到广场"
              >
                ×
              </button>
            </div>

            {focused.avatarNames.length > 0 && (
              <div className="sq-detail-avatars">
                {focused.avatarNames.map((n, i) => (
                  <motion.span
                    key={n + i}
                    className="sq-avatar sq-avatar-lg"
                    initial={reduced ? {} : { opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.04 * i, duration: 0.24 }}
                    title={n}
                  >
                    {n.slice(0, 1)}
                  </motion.span>
                ))}
                <span className="dim" style={{ fontSize: 12.5, marginLeft: 8 }}>
                  {focused.answerCount} 位分身参与
                </span>
              </div>
            )}

            <div className="sq-detail-body">{renderDetail(focused)}</div>

            <div className="sq-detail-actions">
              <button className="btn btn-primary" onClick={() => onOpen(focused)}>
                载入工作台看完整讨论
              </button>
              <button className="btn btn-ghost" onClick={() => onFocus(null)}>
                回到广场
              </button>
            </div>
          </motion.aside>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ------------------------------ 话题卡 ------------------------------ */

function TopicCard({
  node,
  hovered,
  focused,
  dimmed,
  pending,
  reduced,
  onHover,
  onSelect,
}: {
  node: TopicNode;
  hovered: boolean;
  focused: boolean;
  dimmed: boolean;
  pending: boolean;
  reduced: boolean;
  onHover: (id: string | null) => void;
  onSelect: () => void;
}) {
  // 头像依次浮现：悬停后才展开，每个延迟 60ms，形成「陆续出现」的观感。
  const showAvatars = hovered || focused;

  return (
    <div
      data-topic-card
      className={
        "sq-card" +
        (node.mine ? " sq-card-mine" : "") +
        (focused ? " sq-card-focused" : "") +
        (dimmed ? " sq-card-dimmed" : "")
      }
      style={{
        width: node.size,
        height: node.size,
        transform: `translate(${node.x - node.size / 2}px, ${node.y - node.size / 2}px)`,
      }}
      onPointerEnter={() => onHover(node.id)}
      onPointerLeave={() => onHover(null)}
      onClick={(e) => {
        e.stopPropagation();
        onSelect();
      }}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect();
        }
      }}
      aria-label={node.title + " · " + node.statusLabel}
    >
      <motion.div
        className="sq-card-inner"
        animate={
          reduced
            ? {}
            : {
                // 「轻微升起」：只抬 6px，不夸张 —— 规格要求动效自然缓慢。
                y: hovered && !focused ? -6 : 0,
                scale: hovered && !focused ? 1.025 : 1,
              }
        }
        transition={{ type: "spring", stiffness: 300, damping: 28 }}
      >
        <span className={"sq-card-bar a-" + node.theme.accent} />

        {/* 呼吸光点：正在回答的话题 */}
        {pending && !reduced && (
          <motion.span
            className="sq-breathe"
            animate={{ opacity: [0.25, 0.7, 0.25], scale: [1, 1.5, 1] }}
            transition={{ duration: 3.4, repeat: Infinity, ease: "easeInOut" }}
          />
        )}
        {pending && reduced && <span className="sq-breathe sq-breathe-static" />}

        <div className="sq-card-body">
          <div className="sq-card-meta">
            {node.mine && <span className="sq-card-mine-tag">我的</span>}
            <span className="sq-card-status">{node.statusLabel}</span>
          </div>

          <div className="sq-card-title" style={{ fontSize: cardTitleSize(node.size) }}>
            {node.title}
          </div>

          {/* 回答预览：悬停/聚焦时出现 —— 但卡片小的时候放不下，靠 CSS 截断 */}
          <AnimatePresence>
            {showAvatars && node.preview && (
              <motion.div
                className="sq-card-preview"
                initial={reduced ? { opacity: 0 } : { opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.22 }}
              >
                {node.preview}
              </motion.div>
            )}
          </AnimatePresence>

          {/* 答主头像：依次浮现 */}
          <div className="sq-card-avatars">
            <AnimatePresence>
              {showAvatars &&
                node.avatarNames.map((n, i) => (
                  <motion.span
                    key={n + i}
                    className="sq-avatar"
                    initial={reduced ? { opacity: 0 } : { opacity: 0, x: -10, scale: 0.85 }}
                    animate={{ opacity: 1, x: 0, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.85 }}
                    transition={{ delay: reduced ? 0 : 0.06 * i, duration: 0.26 }}
                    title={n}
                  >
                    {n.slice(0, 1)}
                  </motion.span>
                ))}
            </AnimatePresence>
            {showAvatars && node.answerCount > node.avatarNames.length && (
              <motion.span
                className="sq-avatar sq-avatar-more"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: reduced ? 0 : 0.06 * node.avatarNames.length }}
              >
                +{node.answerCount - node.avatarNames.length}
              </motion.span>
            )}
          </div>
        </div>
      </motion.div>
    </div>
  );
}

/** 卡片越大字号越大；小卡片必须缩字，否则标题会溢出来。 */
function cardTitleSize(size: number): number {
  if (size >= 280) return 20;
  if (size >= 220) return 17;
  if (size >= 180) return 15;
  return 13.5;
}

/* ------------------------------ 缩略地图 ------------------------------ */

/**
 * 左下角的广场地图。
 *
 * 规格里说「可以放到后续」，但一个极简版（只有点位 + 当前视口框）
 * 成本很低，对「我在广场的哪里」这个空间感帮助很大，所以给一个克制版。
 * 不做交互式拖拽 —— 那会与主画布的拖拽手势冲突。
 */
function MiniMap({
  layout,
  viewport,
  size,
  onJump,
}: {
  layout: SquareLayout;
  viewport: Viewport;
  size: { w: number; h: number };
  onJump: (v: Viewport) => void;
}) {
  const W = 152;
  const H = 100;
  const b = layout.bounds;
  const bw = Math.max(b.maxX - b.minX, 1);
  const bh = Math.max(b.maxY - b.minY, 1);
  const s = Math.min(W / bw, H / bh) * 0.9;

  const toMini = (x: number, y: number) => ({
    x: W / 2 + (x - (b.minX + b.maxX) / 2) * s,
    y: H / 2 + (y - (b.minY + b.maxY) / 2) * s,
  });

  // 当前视口在画布坐标里覆盖的矩形。
  const tl = toWorld(0, 0, viewport);
  const br = toWorld(size.w, size.h, viewport);
  const p1 = toMini(tl.x, tl.y);
  const p2 = toMini(br.x, br.y);

  const onClick = (e: React.MouseEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const mx = ((e.clientX - r.left) / r.width) * W;
    const my = ((e.clientY - r.top) / r.height) * H;
    // 反算：点到的小地图坐标 → 画布坐标 → 居中到该点的视口。
    const wx = (mx - W / 2) / s + (b.minX + b.maxX) / 2;
    const wy = (my - H / 2) / s + (b.minY + b.maxY) / 2;
    onJump({
      scale: viewport.scale,
      x: size.w / 2 - wx * viewport.scale,
      y: size.h / 2 - wy * viewport.scale,
    });
  };

  return (
    <div className="sq-minimap" data-no-pan>
      <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} onClick={onClick} role="img" aria-label="广场地图">
        <rect x={0.5} y={0.5} width={W - 1} height={H - 1} rx={6} className="sq-minimap-bg" />
        {layout.clusters.map((c) => {
          const p = toMini(c.x, c.y);
          return <circle key={c.theme.key} cx={p.x} cy={p.y} r={13} className="sq-minimap-cluster" />;
        })}
        {layout.nodes.map((n) => {
          const p = toMini(n.x, n.y);
          const r = 1.6 + (n.size / 320) * 2.4;
          return (
            <circle
              key={n.id}
              cx={p.x}
              cy={p.y}
              r={r}
              className={"sq-minimap-dot" + (n.mine ? " mine" : "")}
            />
          );
        })}
        <rect
          x={Math.min(p1.x, p2.x)}
          y={Math.min(p1.y, p2.y)}
          width={Math.max(Math.abs(p2.x - p1.x), 3)}
          height={Math.max(Math.abs(p2.y - p1.y), 3)}
          rx={2}
          className="sq-minimap-view"
        />
      </svg>
    </div>
  );
}

/* ------------------------------ 供外部用的工具 ------------------------------ */

export { clampScale };
