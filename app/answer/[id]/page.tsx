"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { motion } from "motion/react";
import { useMirror } from "@/lib/store/mirror-store";

/**
 * 单篇回答详情。
 *
 * 一篇回答要能被追责，就必须把它的来路摊开：谁写的、什么时候写的、
 * 用了哪些真实来源、直答有没有参与。评委可以逐条点开来源核对。
 * 「追问」调用知乎直答，「接管」把人送去真人补充页 —— 两者都不改数据源。
 */

interface Turn {
  q: string;
  a: string | null;
  error?: string;
}

export default function AnswerDetailPage() {
  const params = useParams<{ id: string }>();
  const { mirror, ready } = useMirror();
  const [turns, setTurns] = useState<Turn[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);

  const answer = useMemo(
    () => mirror?.answers.find((a) => a.id === params?.id) ?? null,
    [mirror, params?.id]
  );
  const skill = useMemo(
    () => (answer ? mirror?.skills.find((s) => s.id === answer.skillId) ?? null : null),
    [mirror, answer]
  );

  if (!ready) return <div className="skeleton" style={{ height: 340, marginTop: 44 }} />;

  if (!mirror || !answer) {
    return (
      <section style={{ paddingTop: 56 }}>
        <p className="eyebrow">Answer</p>
        <h1>找不到这篇回答</h1>
        <p className="lede" style={{ marginTop: 14 }}>
          回答只存在于当前这场会话里。刷新或换设备后需要重新生成一次镜像问题。
        </p>
        <Link className="btn btn-primary" href="/mirror" style={{ marginTop: 20 }}>回工作台</Link>
      </section>
    );
  }

  const ask = async () => {
    const q = draft.trim();
    if (q.length < 2 || busy) return;
    setBusy(true);
    setDraft("");
    setTurns((t) => [...t, { q, a: null }]);

    try {
      const res = await fetch("/api/zhihu/zhida", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [
            {
              role: "system",
              content:
                "你在帮用户追问一篇已经写好的回答。只用下面这篇回答和它的证据回答，" +
                "信息不足就直说「这一点需要真人补充」。中文，120 字以内，不要客套。"
            },
            {
              role: "user",
              content:
                "【回答·" + answer.skillName + "】\n" + answer.body +
                "\n\n【证据】\n" + answer.evidence.map((e, i) => "[" + (i + 1) + "] " + e.author + "：" + e.excerpt).join("\n") +
                "\n\n【追问】" + q
            }
          ]
        })
      });
      const data = await res.json();
      setTurns((t) =>
        t.map((x, i) =>
          i === t.length - 1
            ? data.ok
              ? { q, a: data.text }
              : { q, a: null, error: data.error ?? "直答暂时不可用" }
            : x
        )
      );
    } catch {
      setTurns((t) => t.map((x, i) => (i === t.length - 1 ? { q, a: null, error: "网络错误，请稍后重试" } : x)));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <section style={{ paddingTop: 44 }}>
        <Link className="link mono" href="/mirror">← 回镜像工作台</Link>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", margin: "18px 0 12px" }}>
          <span className={"chip chip-" + answer.accent}>{answer.skillName}</span>
          <span className={"chip " + (answer.status === "human" ? "chip-green" : "")}>
            {answer.status === "ai" ? "AI 生成" : answer.status === "human" ? "真人已补充" : "已搬运回知乎"}
          </span>
          <span className="chip mono">{answer.generatedBy === "zhida" ? "直答模型生成" : "仅检索，未生成"}</span>
          <span className="mono dimmer" style={{ alignSelf: "center" }}>
            {new Date(answer.createdAt).toLocaleString("zh-CN")}
          </span>
        </div>

        <h1 style={{ fontSize: "clamp(24px, 3.4vw, 40px)", maxWidth: "26ch" }}>{mirror.title}</h1>
      </section>

      <section className="section">
        <div className="grid grid-2" style={{ alignItems: "start" }}>
          <div className="card">
            <div className={"accent-bar a-" + answer.accent} />
            <p style={{ fontSize: 15, whiteSpace: "pre-wrap", color: "var(--text-100)" }}>{answer.body}</p>
            {answer.humanAuthor && (
              <div className="mono" style={{ color: "var(--green-soft)", marginTop: 12 }}>
                补充者：{answer.humanAuthor}
              </div>
            )}
          </div>

          <div style={{ display: "grid", gap: 16 }}>
            {skill && (
              <div className="card">
                <p className="eyebrow">这个分身是谁</p>
                <h3 style={{ marginBottom: 8 }}>{skill.name}</h3>
                <p className="dim" style={{ fontSize: 13.5, marginBottom: 12 }}>{skill.lens}</p>
                <div className="mono dimmer" style={{ marginBottom: 8 }}>文风标签</div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 14 }}>
                  {skill.tone.map((t) => <span key={t} className="chip">{t}</span>)}
                </div>
                <div className="mono dimmer" style={{ marginBottom: 6 }}>关键词</div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {skill.keywords.map((k) => <span key={k} className="chip chip-violet">{k}</span>)}
                </div>
                <hr className="divider" />
                <div className="mono dimmer">证据覆盖 {Math.round(skill.confidence * 100)}% · 检索词「{skill.query}」</div>
              </div>
            )}

            <div className="card">
              <p className="eyebrow">来源与证据</p>
              <h3 style={{ marginBottom: 12 }}>{answer.evidence.length} 条真实知乎来源</h3>
              <div style={{ display: "grid", gap: 10 }}>
                {answer.evidence.map((e, i) => (
                  <a
                    key={e.url + i}
                    href={e.url}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="card-flat"
                    style={{ display: "block", textDecoration: "none", color: "inherit" }}
                  >
                    <div style={{ display: "flex", gap: 8, marginBottom: 6, flexWrap: "wrap" }}>
                      <span className="chip mono">[{i + 1}]</span>
                      <span className="chip chip-blue">{e.author}</span>
                      <span className="chip mono">赞同 {e.voteUp}</span>
                    </div>
                    <div style={{ fontWeight: 700, fontSize: 13.5, marginBottom: 5 }}>{e.title}</div>
                    <div className="dimmer" style={{ fontSize: 12.5 }}>{e.excerpt.slice(0, 140)}…</div>
                  </a>
                ))}
                {answer.evidence.length === 0 && (
                  <div className="notice notice-warn">
                    这篇回答没有任何真实来源 —— 看山已把它标记为缺口，等待真人补上。
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="section-head">
          <h2>追问</h2>
          <span className="mono dimmer" style={{ marginLeft: "auto" }}>知乎直答 · 额度 100/天 · 缓存 30 分钟</span>
        </div>

        <div className="card" style={{ display: "grid", gap: 14 }}>
          <div style={{ display: "grid", gap: 10 }}>
            {turns.map((t, i) => (
              <motion.div key={i} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} style={{ display: "grid", gap: 8 }}>
                <div className="card-flat" style={{ borderColor: "rgba(77,124,255,0.3)" }}>
                  <span className="mono dimmer">你问：</span> {t.q}
                </div>
                {t.a && (
                  <div className="card-flat">
                    <span className="mono dimmer">直答：</span> {t.a}
                  </div>
                )}
                {!t.a && !t.error && <div className="notice">直答思考中…</div>}
                {t.error && <div className="notice notice-warn">{t.error}</div>}
              </motion.div>
            ))}
            {turns.length === 0 && (
              <div className="notice">
                试着追问一个 AI 可能答不上来的点，例如「上个月的价格是多少」——
                答不上来正好证明这里需要真人。
              </div>
            )}
          </div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <input
              className="field"
              style={{ flex: 1, minWidth: 220 }}
              placeholder="追问这篇回答…"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") ask(); }}
              disabled={busy}
            />
            <button className="btn btn-primary" onClick={ask} disabled={busy || draft.trim().length < 2}>
              {busy ? "追问中…" : "追问"}
            </button>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="card" style={{ display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap" }}>
          <div style={{ marginRight: "auto" }}>
            <h3 style={{ marginBottom: 6 }}>接管这一篇</h3>
            <p className="dim" style={{ fontSize: 13.5 }}>
              你是这个领域的人？直接进入真人补充页，用最小填空或完整编辑把这一段改成你的版本。
            </p>
          </div>
          <Link className="btn btn-primary" href="/fill">我来接管</Link>
          <Link className="btn btn-ghost" href="/mirror">回工作台</Link>
        </div>
      </section>
    </>
  );
}
