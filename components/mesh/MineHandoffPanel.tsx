"use client";

import { useState } from "react";
import Link from "next/link";
import { zhihuQuestionUrl } from "@/lib/domain/handoff";
import { useMirror } from "@/lib/store/mirror-store";
import type { AnswerDraft, MirrorQuestion } from "@/lib/domain/types";

/**
 * 把我自己分身的回答搬回真实知乎。
 *
 * 为什么和 HandoffPanel 分开：HandoffPanel 搬的是「有人类补充之后」的整篇稿，
 * 它的前置条件是「已经有真人补过缺口」——没补过时按钮是禁用的。
 * 但最常见的场景恰恰相反：分身刚答完，用户就想把这几篇带走。
 * 所以这个面板只做那件事：只取分身自己产出的回答，不含别人的内容。
 *
 * 平台没有发布接口（docs/zhihu-api 全部为只读），所以流程诚实地止步于
 * 「复制正文 + 打开知乎」，最后由用户自己点发布。
 *
 * 与 HandoffPanel 的另一处区别：这里不调 /api/handoff 换编辑器深链，
 * 而是直接打开来源问题页 —— 分身回答对应的是「问题」而不是某篇待补充的缺口，
 * 落到问题页让用户自己选在哪篇下回答，比假装知道编辑器地址更诚实。
 */

export default function MineHandoffPanel({
  mirror,
  answers
}: {
  mirror: MirrorQuestion;
  answers: AnswerDraft[];
}) {
  const { markHandoffOpened, confirmHandoff } = useMirror();
  const [copied, setCopied] = useState<string | null>(null);

  const state = mirror.handoff?.status ?? "not-ready";

  /** 只保留分身写的：真人补充段（status === "human"）不属于「我的分身」。 */
  const mine = answers.filter((a) => a.status !== "human");

  /**
   * 知乎链接才能反推出问题页；用户手输的问题没有来源 URL，
   * 这时不编一个假的地址，而是如实降级成「只复制正文」。
   */
  const questionUrl = mirror.sourceUrl ? zhihuQuestionUrl(mirror.sourceUrl) : null;

  /**
   * 正文与预览用**同一个字符串**。
   *
   * 之前的写法让「复制正文」和「预览」给的是两份不同内容（一份带落款一份不带），
   * 用户没法判断自己到底会粘出什么。现在两者完全一致，落款也一并带上 ——
   * 落款是合规要求（保留来源 + 声明 AI 整理），不该在复制时被偷偷去掉。
   */
  const body = mine
    .map((a) => `## ${a.skillName}\n\n${a.body.trim()}`)
    .join("\n\n---\n\n");

  /** 来源归属：分身回答里检索到的真实知乎来源，按票数排序去重。 */
  const sources = (() => {
    const seen = new Set<string>();
    const out: Array<{ title: string; author: string; url: string; voteUp: number }> = [];
    for (const a of mine) {
      for (const e of a.evidence ?? []) {
        if (!e.url || seen.has(e.url)) continue;
        seen.add(e.url);
        out.push({ title: e.title, author: e.author, url: e.url, voteUp: e.voteUp });
      }
    }
    return out.sort((x, y) => y.voteUp - x.voteUp);
  })();

  const composed = (() => {
    const parts = [body];
    if (sources.length > 0) {
      parts.push(
        `---\n本回答由「二号知乎」整理，证据来自以下知乎回答：\n` +
          sources.map((s) => `· 《${s.title}》 — ${s.author}\n  ${s.url}`).join("\n")
      );
    } else {
      parts.push("---\n本回答由「二号知乎」整理。本次未检索到可引用的知乎来源。");
    }
    parts.push("（本文由 AI 基于上述知乎公开回答整理，未经本人发布到知乎。发布前请自行核对内容。）");
    return parts.filter(Boolean).join("\n\n");
  })();

  async function copyText(text: string, label: string) {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // 剪贴板 API 在非 HTTPS 或旧浏览器上会抛错，退回 execCommand。
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand("copy"); } finally { document.body.removeChild(ta); }
    }
    setCopied(label);
    window.setTimeout(() => setCopied(null), 2200);
  }

  /**
   * 复制后打开知乎。
   *
   * 顺序很重要：先 await 复制、再开新标签。若反过来，浏览器会把
   * window.open 当成非用户手势弹出的窗口而拦截。
   */
  async function copyAndOpen() {
    await copyText(composed, "open");
    if (questionUrl) markHandoffOpened(questionUrl);
    window.open(questionUrl ?? "https://www.zhihu.com/", "_blank", "noopener,noreferrer");
  }

  const confirmed = state === "confirmed";

  return (
    <section className="section" id="handoff-mine">
      <div className="card">
        <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", marginBottom: 14 }}>
          <h2 style={{ marginRight: "auto" }}>把我的分身搬回知乎</h2>
          <span className={"chip " + (confirmed ? "chip-green" : state === "opened" ? "chip-blue" : "")}>
            {confirmed ? "已发布" : state === "opened" ? "已打开知乎" : "可以搬运"}
          </span>
        </div>

        {mine.length === 0 ? (
          <div className="notice">这场还没有分身的回答可以搬运。</div>
        ) : (
          <>
            <p className="dim" style={{ fontSize: 13.5, marginBottom: 16 }}>
              共 {mine.length} 篇分身回答，合计 {body.length} 字
              {sources.length > 0 ? `，带 ${sources.length} 条知乎来源归属` : ""}。
              知乎开放平台没有发布接口（接口全部为只读），所以这里帮你把正文拼好，你到知乎里点发布。
            </p>

            <div className="feedback-actions">
              <button className="btn btn-ghost" onClick={() => copyText(composed, "body")}>
                {copied === "body" ? "已复制正文" : "只复制正文"}
              </button>
              <button className="btn btn-primary" onClick={copyAndOpen}>
                {copied === "open"
                  ? "已复制，去粘贴"
                  : questionUrl
                    ? "复制并打开知乎问题页"
                    : "复制并打开知乎"}
              </button>
              <button className="btn btn-ghost" onClick={() => confirmHandoff()} disabled={confirmed}>
                {confirmed ? "已标记为已发布" : "我已在知乎发布"}
              </button>
            </div>

            {questionUrl ? (
              <p className="dimmer mono" style={{ fontSize: 11.5, marginTop: 12 }}>
                目标问题：<a href={questionUrl} target="_blank" rel="noopener noreferrer">{questionUrl}</a>
              </p>
            ) : (
              <p className="dimmer mono" style={{ fontSize: 11.5, marginTop: 12 }}>
                这个问题是你手输的，没有对应的知乎链接，所以只帮你复制正文，不猜一个地址给你。
              </p>
            )}

            <details className="evidence-details">
              <summary className="mono dim">预览要搬运的正文（与实际复制内容一致）</summary>
              <div style={{ whiteSpace: "pre-wrap", fontSize: 13, lineHeight: 1.75, marginTop: 12 }}>
                {composed}
              </div>
            </details>
          </>
        )}

        <p className="dimmer" style={{ fontSize: 12, marginTop: 14 }}>
          分身跑完的每一篇，都会在这个页面上等着你决定要不要搬回去。
          <Link className="link" href="/mirror" style={{ marginLeft: 6 }}>回到工作台 →</Link>
        </p>
      </div>
    </section>
  );
}
