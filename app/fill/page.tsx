"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { useMirror } from "@/lib/store/mirror-store";
import { KanshanStage } from "@/components/kanshan/KanshanStage";

/**
 * 真人补充页。
 *
 * 两种模式对应两类真人：
 *   - 最小填空：只补一句最关键的事实（最新价格、上个月排期、只有内部人知道的坑），
 *     降低参与门槛，让「顺手补一句」成立。
 *   - 完整编辑：直接在 AI 草稿上改写成自己的版本，适合愿意写长文的答主。
 *
 * 提交后立刻回写回答、缺口、Mesh 与贡献值，全部走同一份领域模型。
 */

const QUICK_TEMPLATES = [
  "补充一个最新数字：",
  "纠正一处事实：",
  "补一个只有内部人知道的坑：",
  "给一个反例："
];

export default function FillPage() {
  const { mirror, ready, applyHumanEdit } = useMirror();
  const [mode, setMode] = useState<"quick" | "full">("quick");
  const [author, setAuthor] = useState("");
  const [targetId, setTargetId] = useState<string | null>(null);
  const [quickText, setQuickText] = useState("");
  const [fullText, setFullText] = useState("");
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const activeId = targetId ?? mirror?.answers.find((a) => a.status === "ai")?.id ?? mirror?.answers[0]?.id ?? null;
  const target = useMemo(() => mirror?.answers.find((a) => a.id === activeId) ?? null, [mirror, activeId]);
  const openGap = useMemo(() => mirror?.gaps.find((g) => !g.filledBy) ?? null, [mirror]);

  if (!ready) return <div className="skeleton" style={{ height: 340, marginTop: 44 }} />;

  if (!mirror || !target) {
    return (
      <section style={{ paddingTop: 56 }}>
        <p className="eyebrow">Human fill</p>
        <h1>还没有需要补充的内容</h1>
        <p className="lede" style={{ marginTop: 14 }}>
          真人补充发生在镜像问题生成之后。先去首页提一个问题，看山会标出需要真人的那一段。
        </p>
        <Link className="btn btn-primary" href="/" style={{ marginTop: 20 }}>去首页提一个问题</Link>
      </section>
    );
  }

  const submit = () => {
    setError(null);
    const name = author.trim() || "一位知乎用户";
    const body =
      mode === "quick"
        ? target.body + "\n\n【真人补充 · " + name + "】\n" + quickText.trim()
        : fullText.trim();

    if (body.trim().length < 8) {
      setError("内容太短了，至少写 8 个字，让这一段真的有用。");
      return;
    }

    applyHumanEdit(target.id, body, name);
    setDone(name);
    setQuickText("");
  };

  if (done) {
    return (
      <motion.section
        style={{ paddingTop: 56 }}
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <p className="eyebrow">Mesh updated</p>
        <h1>补充已写入</h1>
        <p className="lede" style={{ marginTop: 14 }}>
          {done} 补完了「{target.skillName}」这一段。回答状态已变为「真人已补充」，
          缺口标记为已填，Human Mesh 长出新的边，贡献值 +8。
        </p>
        <div className="grid grid-3" style={{ marginTop: 24 }}>
          <Link className="btn btn-primary" href="/mirror">回工作台看搬运</Link>
          <Link className="btn" href="/mesh">查看 Mesh 变化</Link>
          <Link className="btn btn-ghost" href="/feed">分身动态</Link>
        </div>
        <div style={{ marginTop: 26, maxWidth: 420 }}>
          <KanshanStage step={8} running={false} size={170} />
        </div>
      </motion.section>
    );
  }

  return (
    <>
      <section style={{ paddingTop: 44 }}>
        <p className="eyebrow">Human fill</p>
        <h1 style={{ maxWidth: "22ch" }}>补上 AI 答不了的那一段</h1>
        <p className="lede" style={{ marginTop: 16 }}>
          你不需要重写整篇。只要补上 AI 拿不到的那一块 —— 一个最新数字、一处被忽略的成本、
          一个只有亲历者知道的细节。
        </p>
      </section>

      {openGap && (
        <section className="section">
          <div className="gap">
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
              <span className="chip chip-orange">看山标出的缺口</span>
              <span className="mono dimmer">严重度 {Math.round(openGap.severity * 100)}%</span>
            </div>
            <h3 style={{ fontSize: 15, marginBottom: 6 }}>{openGap.label}</h3>
            <p className="dim" style={{ fontSize: 13.5, marginBottom: 6 }}>{openGap.reason}</p>
            <p className="mono dimmer">需要：{openGap.needProfile}</p>
          </div>
        </section>
      )}

      <section className="section">
        <div className="section-head">
          <h2>你要补充哪一篇</h2>
        </div>
        <div style={{ display: "grid", gap: 8 }}>
          {mirror.answers.map((a) => (
            <button
              key={a.id}
              className="card-flat"
              style={{
                textAlign: "left", cursor: "pointer", font: "inherit", color: "inherit",
                ...(a.id === activeId ? { borderColor: "var(--blue)", boxShadow: "0 0 0 1px rgba(77,124,255,0.35)" } : {})
              }}
              onClick={() => setTargetId(a.id)}
            >
              <div style={{ display: "flex", gap: 9, alignItems: "center", marginBottom: 6, flexWrap: "wrap" }}>
                <strong style={{ fontSize: 14 }}>{a.skillName}</strong>
                <span className={"chip chip-" + a.accent}>{a.status === "ai" ? "AI 生成" : a.humanAuthor ? "真人已补充" : "已搬运"}</span>
                <span className="mono dimmer" style={{ marginLeft: "auto" }}>{a.body.length} 字</span>
              </div>
              <div className="dim" style={{ fontSize: 13 }}>
                {a.body.slice(0, 110)}{a.body.length > 110 ? "…" : ""}
              </div>
            </button>
          ))}
        </div>
      </section>

      <section className="section">
        <div className="section-head">
          <h2>怎么写</h2>
          <div style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
            <button
              className="chip"
              style={{ cursor: "pointer", ...(mode === "quick" ? { borderColor: "var(--green)", color: "var(--green-soft)" } : {}) }}
              onClick={() => setMode("quick")}
            >
              最小填空
            </button>
            <button
              className="chip"
              style={{ cursor: "pointer", ...(mode === "full" ? { borderColor: "var(--green)", color: "var(--green-soft)" } : {}) }}
              onClick={() => { setMode("full"); if (!fullText) setFullText(target.body); }}
            >
              完整编辑
            </button>
          </div>
        </div>

        <div className="card" style={{ display: "grid", gap: 14 }}>
          <div>
            <label className="lbl" htmlFor="who">你的署名（会显示为补充者）</label>
            <input
              id="who"
              className="field"
              placeholder="例如：在杭州做跨境电商三年"
              value={author}
              onChange={(e) => setAuthor(e.target.value)}
              maxLength={40}
            />
          </div>

          <AnimatePresence mode="wait">
            {mode === "quick" ? (
              <motion.div key="quick" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}>
                <label className="lbl" htmlFor="quick">只补最关键的一句或几句</label>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 9 }}>
                  {QUICK_TEMPLATES.map((t) => (
                    <button key={t} className="chip" style={{ cursor: "pointer" }} onClick={() => setQuickText((v) => t + v)}>
                      {t}
                    </button>
                  ))}
                </div>
                <textarea
                  id="quick"
                  className="field"
                  rows={4}
                  placeholder="例如：这个价格上个月刚涨了 12%，因为……"
                  value={quickText}
                  onChange={(e) => setQuickText(e.target.value)}
                />
                <p className="dimmer mono" style={{ marginTop: 8 }}>
                  会被追加到原文末尾，标注为「真人补充 · 你的署名」，不改动 AI 已经写对的部分。
                </p>
              </motion.div>
            ) : (
              <motion.div key="full" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}>
                <label className="lbl" htmlFor="full">在草稿上直接改写</label>
                <textarea
                  id="full"
                  className="field"
                  rows={12}
                  value={fullText}
                  onChange={(e) => setFullText(e.target.value)}
                />
                <p className="dimmer mono" style={{ marginTop: 8 }}>
                  已预填 AI 草稿。你可以整段重写，最终展示的就是你的版本。
                </p>
              </motion.div>
            )}
          </AnimatePresence>

          {error && <div className="notice notice-warn">{error}</div>}

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button className="btn btn-primary" onClick={submit}>提交补充</button>
            <Link className="btn btn-ghost" href="/mirror">先不补，回工作台</Link>
          </div>
        </div>
      </section>
    </>
  );
}
