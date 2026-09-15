"use client";

import { useState } from "react";
import { motion } from "motion/react";

import type { AnswerDraft } from "@/lib/domain/types";

/**
 * 一轮互相回应。
 *
 * 上限 2 次直答：1 次识别冲突，1 次让双方各写一段回应。
 * 只跑一轮，不循环 —— 这个产品要的是「他们真的不是同一个人」的证据，
 * 不是无限辩论。识别不出冲突时如实返回空结果，不强行制造对立。
 *
 * ⚠️ 下面三个常数与 `/api/mirror/debate` 的 zod 上限**必须成对**。
 * 客户端先裁，是为了让「一场讨论里回答特别多/特别长」这种正常情况
 * 不会换回一个 400（服务端那道拦截仍然留着，两道都留）。
 */
const MAX_ENTRIES = 24;
const MAX_BODY = 8000;
/**
 * 这一步串行跑两次直答，实测 30–120 秒。
 *
 * 不加超时的话，请求一旦卡住，按钮会永远停在「正在识别冲突…」——
 * 用户只能得出「点了没用」的结论。加了之后至少能如实说「等太久了，再试一次」。
 */
const TIMEOUT_MS = 120_000;

export function DebatePanel({
  question,
  answers,
  onReplies,
  disabled,
}: {
  question: string;
  answers: AnswerDraft[];
  onReplies: (replies: AnswerDraft[]) => void;
  disabled?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const firstRound = answers.filter((a) => (a.round ?? 0) === 0 && a.body.trim().length > 0);
  const canRun = firstRound.length >= 2 && !busy && !disabled;

  async function run() {
    setBusy(true);
    setError(null);
    setNote(null);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const res = await fetch("/api/mirror/debate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question,
          entries: firstRound.slice(0, MAX_ENTRIES).map((a) => ({
            id: a.id,
            name: a.skillName,
            handle: a.handle,
            body: a.body.slice(0, MAX_BODY),
          })),
        }),
        signal: controller.signal,
      });
      const data = await res.json();
      if (!data.ok) {
        setError(data.error ?? "互相回应生成失败，请稍后重试。");
        return;
      }
      const replies = (data.replies ?? []) as AnswerDraft[];
      if (replies.length === 0) {
        setNote(data.note ?? "这一轮没有识别出足够尖锐的观点冲突。");
        return;
      }
      setNote(data.note ?? null);
      onReplies(replies);
    } catch (e) {
      setError(
        (e as { name?: string })?.name === "AbortError"
          ? "等了 2 分钟还没有结果。这一步要跑两次直答，通常 30–60 秒，可以再点一次试试。"
          : "网络连接失败，请检查后重试。",
      );
    } finally {
      clearTimeout(timer);
      setBusy(false);
    }
  }

  return (
    <div className="card-flat">
      <div className="row-between" style={{ flexWrap: "wrap", gap: 12 }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 13.5, marginBottom: 3 }}>让两位答主互相回应</div>
          <div className="dim" style={{ fontSize: 12.5 }}>
            找出这组回答里分歧最尖锐的一对，让他们各回一段。只跑一轮，最多消耗 2 次直答。
          </div>
        </div>
        <button className="btn btn-sm btn-ghost" onClick={run} disabled={!canRun}>
          {busy ? "正在生成回应…（约 30–60 秒）" : "开始一轮互相回应 →"}
        </button>
      </div>

      {/* 解释「为什么点了要等」。
          缺了这一段，界面上只有按钮文案在变、几十秒没有任何别的反馈，
          读起来就像卡死 —— 「点了没反应/报错」的体感有一半来自这里。 */}
      {busy && (
        <div className="mono dimmer" style={{ fontSize: 11.5, marginTop: 10 }}>
          先识别分歧最尖锐的一对，再让双方各写一段 —— 两次直答串行，请先别关页面。
        </div>
      )}

      {note && <div className="notice notice-info" style={{ marginTop: 12 }}>{note}</div>}
      {error && <div className="notice notice-warn" style={{ marginTop: 12 }}>{error}</div>}
      {firstRound.length < 2 && (
        <div className="notice" style={{ marginTop: 12 }}>至少要有两位答主回答过，才谈得上互相回应。</div>
      )}
    </div>
  );
}

export default DebatePanel;
