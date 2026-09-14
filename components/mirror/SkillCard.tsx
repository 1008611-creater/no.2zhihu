"use client";

import { motion } from "motion/react";
import type { Skill } from "@/lib/domain/types";

/**
 * 分身卡片。
 *
 * v1 起有两种形态，用同一张卡片承载：
 *   - 答主型（有 persona）：展示四要素里可上卡的部分 —— 领域、语气、语癖、
 *     不装懂边界、蒸馏依据条数。这是主叙事。
 *   - 视角型（supplementary）：保留旧的视角 / 文风 / 关键词展示，作为补充层。
 */
export function SkillCard({ skill, index = 0 }: { skill: Skill; index?: number }) {
  const p = skill.persona;

  return (
    <motion.article
      className="card"
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.34, delay: index * 0.06 }}
    >
      <div className={"accent-bar a-" + skill.accent} />
      <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 9 }}>
        <h3 style={{ marginRight: "auto" }}>{skill.name}</h3>
        <span className={"chip chip-" + skill.accent}>
          {p ? (p.corpus.real ? "真实蒸馏" : "预置人格") : Math.round(skill.confidence * 100) + "% 证据覆盖"}
        </span>
      </div>
      <p className="dim" style={{ fontSize: 13.5, marginBottom: 12 }}>{skill.lens}</p>

      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
        {skill.tone.map((t) => (
          <span key={t} className="chip">{t}</span>
        ))}
      </div>

      {p && (
        <>
          <div className="lbl">他不装懂什么</div>
          <div style={{ display: "grid", gap: 3, marginBottom: 11 }}>
            {p.doesNotKnow.slice(0, 3).map((k) => (
              <div key={k} className="dimmer" style={{ fontSize: 12.5 }}>· {k}</div>
            ))}
          </div>

          {p.catchphrases.length > 0 && (
            <>
              <div className="lbl">语癖</div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 11 }}>
                {p.catchphrases.slice(0, 4).map((x) => (
                  <span key={x} className="chip mono">{x}</span>
                ))}
              </div>
            </>
          )}

          <div className="mono dimmer" style={{ marginBottom: 6 }}>
            {p.corpus.real
              ? "基于 " + p.corpus.sampleSize + " 条真实回答蒸馏"
              : "预置人格 · 未抓取全量回答"}
            {" · "}
            {p.voice.wordRange[0]}–{p.voice.wordRange[1]} 字
          </div>
        </>
      )}

      {!p && (
        <div className="mono dimmer" style={{ marginBottom: 6 }}>
          {skill.sources.length} 条真实来源 · 检索词「{skill.query.slice(0, 22)}」
        </div>
      )}

      {skill.sources.slice(0, 2).map((s) => (
        <a
          key={s.url}
          href={s.url}
          target="_blank"
          rel="noreferrer noopener"
          className="link"
          style={{ display: "block", fontSize: 12.5, marginBottom: 4, lineHeight: 1.5 }}
        >
          {s.author}：{s.title.slice(0, 34)}
        </a>
      ))}
      {skill.sources.length === 0 && (
        <div className="notice notice-warn" style={{ fontSize: 12 }}>
          这一位没有检索到真实来源，正文可能缺少可核对的依据。
        </div>
      )}
    </motion.article>
  );
}

export default SkillCard;
