"use client";

import { motion } from "motion/react";
import type { Skill } from "@/lib/domain/types";

/** 分身卡片：展示视角、文风、关键词与真实来源。 */
export function SkillCard({ skill, index = 0 }: { skill: Skill; index?: number }) {
  return (
    <motion.article
      className="card"
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.34, delay: index * 0.06 }}
    >
      <div className={`accent-bar a-${skill.accent}`} />
      <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 9 }}>
        <h3 style={{ marginRight: "auto" }}>{skill.name}</h3>
        <span className={`chip chip-${skill.accent}`}>{Math.round(skill.confidence * 100)}% 证据覆盖</span>
      </div>
      <p className="dim" style={{ fontSize: 13.5, marginBottom: 12 }}>{skill.lens}</p>

      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
        {skill.tone.map((t) => <span key={t} className="chip">{t}</span>)}
      </div>

      <div className="mono dimmer" style={{ marginBottom: 6 }}>
        {skill.sources.length} 条真实来源 · 检索词「{skill.query.slice(0, 22)}」
      </div>

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
          这个视角没有检索到真实来源，已被看山标记为缺口。
        </div>
      )}
    </motion.article>
  );
}

export default SkillCard;
