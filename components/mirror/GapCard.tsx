"use client";

import Link from "next/link";
import { motion } from "motion/react";
import { useReducedMotion } from "@/lib/motion/useReducedMotion";
import { GAP_SPRING, GAP_PAUSE, STAGGER } from "@/lib/motion/tokens";
import type { Gap } from "@/lib/domain/types";

const KIND_LABEL: Record<Gap["kind"], string> = {
  experience: "经验缺口",
  data: "数据缺口",
  counter: "反方缺口",
  locale: "地域缺口",
  recent: "时效缺口",
  method: "方法缺口",
  condition: "条件缺口",
  entity: "偏题缺口"
};

/**
 * 看山发现的缺口 + 匹配到的真人候选。
 *
 * `fillHref` 是给「没有匹配到真人」那条路径用的出口 —— 见下方 `candidates.length === 0`
 * 分支的注释：过去这里只留一句「需要更多人参与才能补上」，却不给任何可以点的东西，
 * 于是产品叙事里的第 ⑨ 步（真人接管）在**最需要它的时候**断了。
 */
export function GapCard({
  gap,
  onInvite,
  fillHref,
  index = 0,
}: {
  gap: Gap;
  onInvite?: (gap: Gap) => void;
  /** 缺口的补充入口（通常是 `/fill`）。不传则该分支只作说明、不给出口。 */
  fillHref?: string;
  index?: number;
}) {
  const filled = Boolean(gap.filledBy);
  const reduced = useReducedMotion();
  return (
    <motion.div
      className={`gap ${filled ? "gap-filled" : ""}`}
      initial={reduced ? false : { opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      transition={reduced ? { duration: 0 } : { ...GAP_SPRING, delay: GAP_PAUSE + index * STAGGER }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 7, flexWrap: "wrap" }}>
        <span className={`chip ${filled ? "chip-green" : "chip-orange"}`}>{KIND_LABEL[gap.kind]}</span>
        <span className="mono dimmer">严重度 {Math.round(gap.severity * 100)}%</span>
        {filled && <span className="chip chip-green">已由 {gap.filledBy} 补充</span>}
      </div>

      <h3 style={{ fontSize: 15, marginBottom: 6 }}>{gap.label}</h3>
      <p className="dim" style={{ fontSize: 13.5, marginBottom: 8 }}>{gap.reason}</p>
      <p className="mono dimmer" style={{ marginBottom: 12 }}>需要：{gap.needProfile}</p>

      {gap.candidates.length > 0 && (
        <div style={{ display: "grid", gap: 7 }}>
          {gap.candidates.map((c) => (
            <div
              key={c.id}
              className="card-flat"
              style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", flexWrap: "wrap" }}
            >
              <span className={`chip chip-${c.accent}`}>{c.score}</span>
              <div style={{ marginRight: "auto", minWidth: 160 }}>
                <div style={{ fontWeight: 700, fontSize: 13.5 }}>{c.name}</div>
                <div className="dimmer mono" style={{ fontSize: 11 }}>{c.matchReason}</div>
              </div>
              {!filled && onInvite && (
                <button className="btn btn-sm" onClick={() => onInvite({ ...gap, candidates: [c] })}>邀请补充</button>
              )}
            </div>
          ))}
        </div>
      )}

      {gap.candidates.length === 0 && (
        <div className="notice" style={{ fontSize: 12 }}>
          <p style={{ marginBottom: gap.filledBy || !fillHref ? 0 : 10 }}>
            还没有匹配到合适的真人 —— 这个缺口需要更多人参与才能补上。
          </p>
          {/*
            ⚠️ 这个分支过去**只说明、不给出口**：文案写着「需要更多人参与」，
            却没有任何可点的东西，而 /fill（「补上 AI 答不了的那一段」）本来就是
            为这件事存在的、且完全可用。结果是产品闭环的第 ⑨ 步在最需要它的时候断掉。
            /fill 页自己的注释也写着「入口只有两个：工作台的缺口卡片 + 回答页的我来接管」——
            而后一个入口当时并不存在。
            这里补的就是工作台这一侧：没有候选人时，人自己就是候选人。
          */}
          {!gap.filledBy && fillHref && (
            <Link className="btn btn-sm btn-primary" href={fillHref}>
              我来补上这一段 →
            </Link>
          )}
        </div>
      )}
    </motion.div>
  );
}

export default GapCard;
