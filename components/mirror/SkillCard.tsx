"use client";

import Link from "next/link";
import { motion } from "motion/react";
import type { Skill } from "@/lib/domain/types";
import { CARD_SPRING, SHIFT, STAGGER } from "@/lib/motion/tokens";

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
      initial={{ opacity: 0, y: SHIFT.md }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ ...CARD_SPRING, delay: index * STAGGER }}
    >
      <div className={"accent-bar a-" + skill.accent} />
      <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 9 }}>
        <h3 style={{ marginRight: "auto" }}>{skill.name}</h3>
        {/* 只有真实抓取到语料时才标依据；预置人格不再打任何标签（2026-09-15 删）。 */}
        {p?.corpus.real && <span className={"chip chip-" + skill.accent}>基于公开片段提取</span>}
        {!p && <span className={"chip chip-" + skill.accent}>{Math.round(skill.confidence * 100)}% 证据覆盖</span>}
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

          <div className="mono dimmer" style={{ marginBottom: 8 }}>
            {/* 只有真实抓取时才谈样本；预置人格不再自述来源（2026-09-15 删）。 */}
            {p.corpus.real && (
              <>{`实际使用 ${p.corpus.sampleSize} 条公开片段；样本覆盖不代表人格准确率 · `}</>
            )}
            {p.voice.wordRange[0]}–{p.voice.wordRange[1]} 字
          </div>

          {p.corpus.note && <p role="status" className="notice notice-warn">{p.corpus.note}</p>}
          <details style={{ marginBottom: 12 }}>
            <summary>人格依据 · 为什么这样表达</summary>
            {p.corpus.capturedAt && <p className="dim">采集时间：{p.corpus.capturedAt.slice(0, 19).replace("T", " ")} UTC</p>}
            {p.corpus.sources.map((s) => <a key={s.url} className="link" style={{ display: "block", padding: "8px 0" }} href={s.url} target="_blank" rel="noreferrer noopener">{s.author} · {s.title}</a>)}
            {!p.corpus.sources.length && <p className="dim">尚无可核对的人格来源。</p>}
          </details>
          {p.corpus.status !== "unavailable" && !p.corpus.capturedAt && <Link
            className="link mono"
            href={"/personas/" + p.handle}
            style={{ fontSize: 11.5, display: "inline-block", marginBottom: 10 }}
          >
            查看完整人格档案 →
          </Link>}
        </>
      )}

      {!p && (
        <div className="mono dimmer" style={{ marginBottom: 6 }}>
          检索词「{skill.query.slice(0, 22)}」
        </div>
      )}
    </motion.article>
  );
}

export default SkillCard;
