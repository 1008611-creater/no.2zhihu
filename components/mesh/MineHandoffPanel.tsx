"use client";

import { useMemo, useState } from "react";
import { zhihuQuestionUrl } from "@/lib/domain/handoff";
import { useMirror } from "@/lib/store/mirror-store";
import type { AnswerDraft, MirrorQuestion } from "@/lib/domain/types";

/**
 * 把我的分身回答搬回真实知乎 —— 「我的 Mesh」里的收尾动作。
 *
 * 为什么这个面板在我 Mesh 页而不是作答流程里：
 * 搬运是「回头处理产出」的动作，不是「回答问题」流程的一步。放在工作台末尾时，
 * 用户刚看完首轮作答就撞上一个发布面板，既打断阅读，又容易以为必须立刻发布。
 * 收进我的 Mesh 之后，语义变成「我攒下的分身回答在这里，想起来再发」——
 * 而且这里天然能看到**跨全部历史问题**的产出，而不是只有当前这一场。
 *
 * 平台没有发布接口（docs/zhihu-api 全部为只读），所以流程诚实地止步于
 * 「复制正文 + 打开知乎问题页」，最后由用户自己点发布。不假装能代发。
 */

interface Item {
  mirror: MirrorQuestion;
  answers: AnswerDraft[];
  body: string;
  composed: string;
  sources: number;
  questionUrl: string | null;
}

/** 把一场镜像问题整理成可搬运的一条。正文与预览共用同一字符串。 */
function toItem(mirror: MirrorQuestion): Item | null {
  // 只取分身自己写的、且还没搬走的：
  //   · human —— 真人补充段，不属于「我的分身」；
  //   · handed-off —— 已确认搬运过，不该再出现在待搬运清单里。
  // 这两个条件必须与 /mesh 页头「N 篇还没搬回知乎」的统计**完全一致**，
  // 否则会出现「统计说 0 篇待搬运、清单里却还立着一张卡片」的自相矛盾。
  const answers = mirror.answers.filter(
    (a) => a.status !== "human" && a.status !== "handed-off",
  );
  if (answers.length === 0) return null;

  const body = answers.map((a) => `## ${a.skillName}\n\n${a.body.trim()}`).join("\n\n---\n\n");

  // 来源归属：分身回答里检索到的真实知乎来源，按票数排序去重。
  const seen = new Set<string>();
  const sources = ([] as Array<{ title: string; author: string; url: string; voteUp: number }>)
    .concat(
      ...answers.map((a) =>
        (a.evidence ?? [])
          .filter((e) => !!e.url && !seen.has(e.url) && (seen.add(e.url), true))
          .map((e) => ({ title: e.title, author: e.author, url: e.url, voteUp: e.voteUp })),
      ),
    )
    .sort((x, y) => y.voteUp - x.voteUp);

  const parts = [body];
  if (sources.length > 0) {
    parts.push(
      `---\n本回答由「二号知乎」整理，证据来自以下知乎回答：\n` +
        sources.map((s) => `· 《${s.title}》 — ${s.author}\n  ${s.url}`).join("\n"),
    );
  } else {
    parts.push("---\n本回答由「二号知乎」整理。本次未检索到可引用的知乎来源。");
  }
  parts.push("（本文由 AI 基于上述知乎公开回答整理，未经本人发布到知乎。发布前请自行核对内容。）");

  return {
    mirror,
    answers,
    body,
    composed: parts.join("\n\n"),
    sources: sources.length,
    // 用户手输的问题没有来源 URL —— 不编一个假地址，如实降级为「只复制正文」。
    questionUrl: mirror.sourceUrl ? zhihuQuestionUrl(mirror.sourceUrl) : null,
  };
}

/** 剪贴板 API 在非 HTTPS / 旧浏览器上会抛错，退回 execCommand。 */
async function writeClipboard(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    try {
      document.execCommand("copy");
    } finally {
      document.body.removeChild(ta);
    }
  }
}

export default function MineHandoffPanel({
  mirror,
  answers,
  history,
}: {
  /** 当前聚焦的那一场（可选，只为兼容旧调用点）。 */
  mirror?: MirrorQuestion;
  answers?: AnswerDraft[];
  /** 本机全部镜像问题 —— 搬运清单覆盖「我的分身答过的所有问题」。 */
  history?: MirrorQuestion[];
}) {
  const { markHandoffOpenedFor, confirmHandoffFor } = useMirror();
  const [copied, setCopied] = useState<string | null>(null);

  /** 清单来源：优先用全量 history；只有单场数据时退回单场。 */
  const pool = useMemo(() => {
    const list = history && history.length > 0 ? history : mirror ? [mirror] : [];
    const seen = new Set<string>();
    return list.filter((m) => (seen.has(m.id) ? false : (seen.add(m.id), true)));
  }, [history, mirror]);

  const items = useMemo(() => pool.map(toItem).filter((x): x is Item => x !== null), [pool]);

  const totals = useMemo(
    () => ({
      answers: items.reduce((n, i) => n + i.answers.length, 0),
      chars: items.reduce((n, i) => n + i.body.length, 0),
      sources: items.reduce((n, i) => n + i.sources, 0),
      published: items.filter((i) => i.mirror.handoff?.status === "confirmed").length,
    }),
    [items],
  );

  async function copyText(text: string, label: string) {
    await writeClipboard(text);
    setCopied(label);
    window.setTimeout(() => setCopied(null), 2200);
  }

  /**
   * 「复制正文并打开知乎」：这就是「一键」的全部内容 —— 发布动作由人完成。
   *
   * 顺序必须是**先开窗口、再 await 复制**。
   * 原因：window.open 依赖浏览器的 transient user activation（约 5 秒），而 await 会
   * 让出这次手势。剪贴板写入本身是毫秒级，但一旦碰上首次授权弹窗、或用户在弹窗上
   * 停留几秒，手势窗口就过期了 —— 此时 window.open 会被当作弹窗直接拦掉，
   * 用户看到的现象是「点了按钮没反应」。先开窗口时手势一定还在；
   * 写剪贴板不需要窗口焦点，放到后面做没有副作用。
   */
  async function copyAndOpen(item: Item) {
    window.open(item.questionUrl ?? "https://www.zhihu.com/", "_blank", "noopener,noreferrer");
    if (item.questionUrl) markHandoffOpenedFor(item.mirror.id, item.questionUrl);
    await copyText(item.composed, "open:" + item.mirror.id);
  }

  return (
    <section className="section" id="handoff-mine">
      <div className="section-head">
        <div>
          <h2 className="no-tail">把我的分身搬回知乎</h2>
          <p className="dim" style={{ fontSize: 13.5, marginTop: 8, maxWidth: "62ch" }}>
            分身答过的每一个问题都攒在这里，你决定要不要搬回去。
            知乎开放平台没有发布接口（接口全部为只读），所以这里帮你把正文和来源归属拼好，
            你到知乎里点发布。
          </p>
        </div>
        <span className="mono dimmer" style={{ marginLeft: "auto" }}>
          {items.length} 个问题 · {totals.answers} 篇 · {totals.chars} 字
          {totals.sources > 0 ? ` · ${totals.sources} 条来源归属` : ""}
        </span>
      </div>

      {items.length === 0 ? (
        <div className="notice">还没有分身回答过的问题。去提一个问题，你的分身跑完就会攒在这里。</div>
      ) : (
        <div style={{ display: "grid", gap: 14 }}>
          {items.map((item) => {
            const confirmed = item.mirror.handoff?.status === "confirmed";
            const opened = item.mirror.handoff?.status === "opened";
            const isOpenCopied = copied === "open:" + item.mirror.id;
            return (
              <div key={item.mirror.id} className="card-flat">
                <div
                  style={{ display: "flex", gap: 12, alignItems: "baseline", flexWrap: "wrap", marginBottom: 10 }}
                >
                  <strong style={{ fontSize: 15, marginRight: "auto" }}>{item.mirror.title}</strong>
                  <span className={"chip " + (confirmed ? "chip-green" : opened ? "chip-blue" : "")}>
                    {confirmed ? "已发布" : opened ? "已打开知乎" : "可以搬运"}
                  </span>
                </div>

                <div className="dimmer mono" style={{ fontSize: 11.5, marginBottom: 12 }}>
                  {item.answers.length} 篇分身回答 · {item.body.length} 字
                  {item.sources > 0 ? ` · ${item.sources} 条知乎来源归属` : ""}
                  {" · "}
                  {item.answers.map((a) => a.skillName).join(" ｜ ")}
                </div>

                <div className="feedback-actions">
                  <button className="btn btn-ghost btn-sm" onClick={() => copyText(item.composed, "body:" + item.mirror.id)}>
                    {copied === "body:" + item.mirror.id ? "已复制正文" : "只复制正文"}
                  </button>
                  <button className="btn btn-primary btn-sm" onClick={() => copyAndOpen(item)}>
                    {isOpenCopied
                      ? "已复制，去粘贴"
                      : item.questionUrl
                        ? "复制正文并打开知乎问题页"
                        : "复制正文并打开知乎"}
                  </button>
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={() => confirmHandoffFor(item.mirror.id)}
                    disabled={confirmed}
                  >
                    {confirmed ? "已标记为已发布" : "我已在知乎发布"}
                  </button>
                  {item.questionUrl && (
                    <a
                      className="link mono"
                      style={{ fontSize: 12, alignSelf: "center" }}
                      href={item.questionUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      问题原址
                    </a>
                  )}
                </div>

                {!item.questionUrl && (
                  <p className="dimmer mono" style={{ fontSize: 11.5, marginTop: 10 }}>
                    这个问题是你手输的，没有对应的知乎链接，所以只帮你复制正文，不猜一个地址给你。
                  </p>
                )}

                <details className="evidence-details">
                  <summary className="mono dim">预览要搬运的正文（与实际复制内容一致）</summary>
                  <div style={{ whiteSpace: "pre-wrap", fontSize: 13, lineHeight: 1.75, marginTop: 12 }}>
                    {item.composed}
                  </div>
                </details>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
