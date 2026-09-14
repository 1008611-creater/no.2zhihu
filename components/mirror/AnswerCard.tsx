"use client";

import { motion } from "motion/react";
import Link from "next/link";
import type { AnswerDraft } from "@/lib/domain/types";

const STATUS_LABEL: Record<AnswerDraft["status"], string> = {
  ai: "AI 生成",
  human: "真人已补充",
  "handed-off": "已搬运回知乎"
};

/**
 * 回答卡片。
 *
 * v1 起要能区分三种回答：首轮作答（round=0）、互相回应（round=1）、真人补充。
 * 互相回应会明确写出「回应谁」，因为「两位答主互相接话」是这个产品最直观的
 * 「他们真的是不同的人」的证据。
 */
export function AnswerCard({ answer, index = 0 }: { answer: AnswerDraft; index?: number }) {
  const isReply = (answer.round ?? 0) > 0;

  return (
    <motion.article
      className="card"
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.34, delay: index * 0.06 }}
    >
      <div className={"accent-bar a-" + answer.accent} />
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 11, flexWrap: "wrap" }}>
        <h3 style={{ marginRight: "auto" }}>{answer.skillName}</h3>
        {isReply && answer.replyToName && (
          <span className="chip chip-orange">回应 {answer.replyToName}</span>
        )}
        <span className={"chip chip-" + answer.accent}>{STATUS_LABEL[answer.status]}</span>
        <span className="chip mono">{answer.generatedBy === "zhida" ? "直答模型" : "仅检索"}</span>
      </div>

      <p className="dim" style={{ marginBottom: 10 }}>AI 分身回答，不代表答主本人参与或认可。</p>
      <p style={{ fontSize: 14.5, color: "var(--text-100)", whiteSpace: "pre-wrap" }}>{answer.body}</p>

      {answer.humanAuthor && (
        <div className="mono" style={{ color: "var(--green-soft)", marginTop: 10 }}>
          补充者：{answer.humanAuthor}
        </div>
      )}

      <hr className="divider" />
      <div className="mono dimmer" style={{ marginBottom: 7 }}>证据 · {answer.evidence.length} 条</div>
      <div style={{ display: "grid", gap: 5 }}>
        {answer.evidence.map((e) => (
          <a key={e.url} href={e.url} target="_blank" rel="noreferrer noopener" className="link" style={{ fontSize: 12.5 }}>
            {e.author} · 赞同 {e.voteUp} · {e.title.slice(0, 40)}
          </a>
        ))}
        {answer.evidence.length === 0 && <span className="dimmer mono">无来源</span>}
      </div>

      <div style={{ marginTop: 14, display: "flex", gap: 8 }}>
        <Link className="btn btn-sm btn-ghost" href={"/answer/" + answer.id}>查看详情与追问</Link>
      </div>
    </motion.article>
  );
}

export default AnswerCard;
