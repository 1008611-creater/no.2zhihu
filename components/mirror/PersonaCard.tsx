"use client";

import { motion } from "motion/react";
import type { PersonaCandidate } from "@/lib/domain/router";
import { DUR, EASE } from "@/lib/motion/tokens";

/**
 * 答主选择卡片（简化版，2026-09-15）。
 *
 * 上一版把四要素全部铺在卡片上（知道什么 / 不装懂什么 / 语癖 / 语料依据 / 字数区间 /
 * 匹配理由），结果是：一屏十来个字块，名字反而不显眼，选人变成读文档。
 *
 * 现在这张卡只回答一件事 —— **这是谁，他大概聊什么**：
 *   名字（大字号、高对比）+ 一句身份 + 两个风格标签 + 选中态。
 * 详细的四要素不进选人步骤，需要时在作答结果里看。
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
      className="card persona-choice"
      data-selected={selected}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: DUR.base, ease: EASE.out, delay: Math.min(index * 0.035, 0.35) }}
    >
      <div className={"accent-bar a-" + c.accent} />

      <div className="persona-choice-name">
        <span>{c.displayName}</span>
        <span className={"chip chip-" + c.accent + " persona-choice-mark"}>
          {selected ? "已选" : "选择"}
        </span>
      </div>

      <p className="persona-choice-headline">{c.headline}</p>

      <div className="persona-choice-tags">
        {c.tone.slice(0, 2).map((t) => (
          <span key={t} className="chip">{t}</span>
        ))}
      </div>
    </motion.button>
  );
}

export default PersonaCard;
