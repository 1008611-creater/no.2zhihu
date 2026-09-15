"use client";

import { motion } from "motion/react";
import Link from "next/link";
import type { AnswerDraft } from "@/lib/domain/types";
import { CARD_SPRING, SHIFT, STAGGER } from "@/lib/motion/tokens";

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
  const unsupported = answer.claimCheck?.unsupported ?? [];

  return (
    <motion.article
      className="card"
      initial={{ opacity: 0, y: SHIFT.md }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ ...CARD_SPRING, delay: index * STAGGER }}
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

      {/* 无据断言：提示词禁不了的事，靠确定性核对兜住，并如实标出来而不是悄悄删。
          这既是 AGENTS.md §1.2「不编造知乎数据」的落地，也是本产品叙事的直接证据。 */}
      {unsupported.length > 0 && (
        <div className="notice notice-warn" style={{ marginTop: 12 }}>
          <strong>⚠️ 有 {unsupported.length} 处说法没有对应的知乎证据</strong>
          <div className="mono" style={{ marginTop: 6 }}>
            {unsupported.join(" · ")}
          </div>
          <div style={{ marginTop: 6 }}>
            AI 分身可能会编数字或出处。这几处请以真人核对为准 —— 这也正是需要真人补位的地方。
          </div>
        </div>
      )}

      {answer.humanAuthor && (
        <div className="mono" style={{ color: "var(--green-soft)", marginTop: 10 }}>
          补充者：{answer.humanAuthor}
        </div>
      )}

      <div style={{ marginTop: 16, display: "flex", gap: 8 }}>
        <Link className="btn btn-sm btn-ghost" href={"/answer/" + answer.id}>查看详情与追问</Link>
      </div>
    </motion.article>
  );
}

export default AnswerCard;
