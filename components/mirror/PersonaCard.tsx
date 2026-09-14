"use client";

import { motion } from "motion/react";
import type { PersonaCandidate } from "@/lib/domain/router";

/**
 * 答主人格卡片。
 *
 * 这是 v1 的主叙事载体：卡片上写的不是「一个视角」，而是「一个具体的人」——
 * 他知道什么、怎么看问题、怎么说话、以及他明确不装懂什么。
 *
 * 四个区域与 Persona 四要素一一对应，评委不需要读文档就能看懂这张卡片的含义。
 * 选中态做成整卡可点，而不是一个小复选框 —— 演示时更顺手。
 */
export function PersonaCard({
  candidate,
  selected,
  onToggle,
  index = 0,
}: {
  candidate: PersonaCandidate;
  selected: boolean;
  onToggle: (handle: string) => void;
  index?: number;
}) {
  const c = candidate;
  return (
    <motion.button
      type="button"
      onClick={() => onToggle(c.handle)}
      aria-pressed={selected}
      className="card"
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: Math.min(index * 0.05, 0.4) }}
      style={{
        textAlign: "left",
        cursor: "pointer",
        borderColor: selected ? "rgba(77,124,255,0.55)" : undefined,
        boxShadow: selected ? "0 0 0 1px rgba(77,124,255,0.35) inset" : undefined,
      }}
    >
      <div className={"accent-bar a-" + c.accent} />

      <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 6 }}>
        <h3 style={{ marginRight: "auto" }}>{c.displayName}</h3>
        <span className={"chip chip-" + c.accent}>{selected ? "已选" : "选择"}</span>
      </div>

      <p className="dim" style={{ fontSize: 13.5, marginBottom: 10 }}>{c.headline}</p>

      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
        {c.tone.slice(0, 4).map((t) => (
          <span key={t} className="chip">{t}</span>
        ))}
      </div>

      <div className="lbl">他知道什么</div>
      <div style={{ display: "grid", gap: 3, marginBottom: 11 }}>
        {c.knows.slice(0, 2).map((k) => (
          <div key={k} className="dim" style={{ fontSize: 12.5 }}>· {k}</div>
        ))}
      </div>

      <div className="lbl">他不装懂什么</div>
      <div style={{ display: "grid", gap: 3, marginBottom: 11 }}>
        {c.doesNotKnow.slice(0, 2).map((k) => (
          <div key={k} className="dimmer" style={{ fontSize: 12.5 }}>· {k}</div>
        ))}
      </div>

      {c.catchphrases.length > 0 && (
        <>
          <div className="lbl">语癖</div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 11 }}>
            {c.catchphrases.slice(0, 3).map((p) => (
              <span key={p} className="chip mono">{p}</span>
            ))}
          </div>
        </>
      )}

      <div className="row-between" style={{ marginTop: 4 }}>
        <span className="mono dimmer" style={{ fontSize: 11.5 }}>{c.corpusLabel}</span>
        <span className="mono dimmer" style={{ fontSize: 11.5 }}>{c.wordRange[0]}–{c.wordRange[1]} 字</span>
      </div>

      {c.reasons.length > 0 && !c.weakMatch && (
        <div className="mono" style={{ marginTop: 9, fontSize: 11.5, color: "var(--blue-soft)" }}>
          匹配理由：{c.reasons.join("；")}
        </div>
      )}
    </motion.button>
  );
}

export default PersonaCard;
