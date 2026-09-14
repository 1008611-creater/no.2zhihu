"use client";

import { motion } from "motion/react";
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

/** 看山发现的缺口 + 匹配到的真人候选。 */
export function GapCard({ gap, onInvite, index = 0 }: { gap: Gap; onInvite?: (gap: Gap) => void; index?: number }) {
  const filled = Boolean(gap.filledBy);
  return (
    <motion.div
      className={`gap ${filled ? "gap-filled" : ""}`}
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.34, delay: index * 0.08 }}
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
          还没有匹配到合适的真人 —— 这个缺口需要更多人参与才能补上。
        </div>
      )}
    </motion.div>
  );
}

export default GapCard;
