"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { motion } from "motion/react";
import { corpusLabel, personaByHandle } from "@/lib/domain/personas";
import { Kanshan } from "@/components/kanshan/Kanshan";

/**
 * 单份答主档案。
 *
 * 与名册页的分工：名册页回答「有哪些人」，档案页回答「这个人到底是谁」。
 * 四要素在这里展开成完整内容，并附上蒸馏依据 —— 让「像这个人」
 * 这个评价标准可以被评审逐条核对，而不是只能靠感觉。
 *
 * 入口：档案页的 CTA 会把 handle 带回首页（/?persona=xxx），
 * 用户不用在首页重新找一遍这个人。
 */

const SENTENCE_LABEL: Record<string, string> = {
  short: "短句为主",
  medium: "中长句",
  long: "长句",
  mixed: "长短混用",
};

export default function PersonaDetailPage() {
  const params = useParams<{ handle: string }>();
  const persona = params?.handle ? personaByHandle(params.handle) : undefined;

  if (!persona) {
    return (
      <section style={{ paddingTop: 56 }}>
        <p className="eyebrow">Persona file</p>
        <h1>名册里没有这个人</h1>
        <p className="lede" style={{ marginTop: 14 }}>
          这个 handle 不在当前答主名册里。可能是链接写错了，或者名册已经更新。
        </p>
        <Link className="btn btn-primary" href="/personas" style={{ marginTop: 20 }}>
          回答主名册
        </Link>
      </section>
    );
  }

  const p = persona;
  const emotionPct = Math.round(Math.max(0, Math.min(1, p.voice.emotion)) * 100);

  return (
    <div className="page-enter">
      <section style={{ paddingTop: 36 }}>
        <div className="persona-hero">
          <div>
            <p className="eyebrow">Persona file · 答主档案</p>
            <div className="persona-mono" style={{ marginTop: 6 }}>
              @{p.handle}
            </div>
            <h1 style={{ margin: "6px 0 10px" }}>{p.displayName}</h1>
            <p className="lede" style={{ maxWidth: "46ch" }}>
              {p.headline}
            </p>

            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 16 }}>
              {p.voice.tone.map((t) => (
                <span key={t} className={"chip chip-" + p.accent}>
                  {t}
                </span>
              ))}
            </div>

            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 22 }}>
              <Link className="btn btn-primary" href={"/?persona=" + p.handle}>
                让他来答一个问题
              </Link>
              <Link className="btn btn-ghost" href="/personas">
                回答主名册
              </Link>
            </div>
          </div>

          <Kanshan state="idle" size={200} />
        </div>
      </section>

      <section className="section">
        <div className="grid grid-2" style={{ alignItems: "start" }}>
          <motion.div
            className="card"
            initial={{ opacity: 0, y: 14 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ type: "spring", stiffness: 260, damping: 26 }}
          >
            <div className={"accent-bar a-" + p.accent} />
            <div className="lbl">01 · 他知道什么</div>
            <h3 style={{ marginBottom: 10 }}>领域与经历</h3>
            <div style={{ display: "grid", gap: 8 }}>
              {p.knows.map((k) => (
                <div key={k} className="dim" style={{ fontSize: 13.5 }}>
                  · {k}
                </div>
              ))}
            </div>
          </motion.div>

          <motion.div
            className="card"
            initial={{ opacity: 0, y: 14 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ type: "spring", stiffness: 260, damping: 26, delay: 0.06 }}
          >
            <div className={"accent-bar a-" + p.accent} />
            <div className="lbl">02 · 他怎么看问题</div>
            <h3 style={{ marginBottom: 10 }}>立场与判断路径</h3>
            <div style={{ display: "grid", gap: 8 }}>
              {p.stance.map((k) => (
                <div key={k} className="dim" style={{ fontSize: 13.5 }}>
                  · {k}
                </div>
              ))}
            </div>
          </motion.div>

          <motion.div
            className="card"
            initial={{ opacity: 0, y: 14 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ type: "spring", stiffness: 260, damping: 26 }}
          >
            <div className={"accent-bar a-" + p.accent} />
            <div className="lbl">03 · 他怎么说话</div>
            <h3 style={{ marginBottom: 10 }}>语言与节奏</h3>
            <p className="dim" style={{ fontSize: 13.5, lineHeight: 1.9 }}>
              {p.voice.summary}
            </p>

            <hr className="divider" />

            <div className="grid grid-2" style={{ gap: 10 }}>
              <div>
                <div className="lbl">句长</div>
                <div style={{ fontSize: 13 }}>{SENTENCE_LABEL[p.voice.sentenceLength] ?? p.voice.sentenceLength}</div>
              </div>
              <div>
                <div className="lbl">目标字数</div>
                <div className="mono" style={{ fontSize: 13 }}>
                  {p.voice.wordRange[0]}–{p.voice.wordRange[1]} 字
                </div>
              </div>
              <div>
                <div className="lbl">分点习惯</div>
                <div style={{ fontSize: 13 }}>{p.voice.usesLists ? "习惯分点" : "连贯成段，不写小标题"}</div>
              </div>
              <div>
                <div className="lbl">举例方式</div>
                <div className="dim" style={{ fontSize: 12.5 }}>
                  {p.voice.exampleStyle}
                </div>
              </div>
            </div>

            <div style={{ marginTop: 14 }}>
              <div className="row-between" style={{ marginBottom: 5 }}>
                <span className="lbl" style={{ margin: 0 }}>
                  情绪强度
                </span>
                <span className="mono dimmer">{emotionPct}%</span>
              </div>
              <div className="bar">
                <i style={{ width: emotionPct + "%" }} />
              </div>
            </div>
          </motion.div>

          <motion.div
            className="card"
            initial={{ opacity: 0, y: 14 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ type: "spring", stiffness: 260, damping: 26, delay: 0.06 }}
          >
            <div className="accent-bar a-orange" />
            <div className="lbl">04 · 他不装懂什么</div>
            <h3 style={{ marginBottom: 10 }}>明确不碰的范围</h3>
            <div style={{ display: "grid", gap: 8 }}>
              {p.doesNotKnow.map((k) => (
                <div key={k} className="dimmer" style={{ fontSize: 13.5 }}>
                  · {k}
                </div>
              ))}
            </div>
            <p className="mono dimmer" style={{ fontSize: 11.5, marginTop: 14, lineHeight: 1.7 }}>
              这一条不是谦虚，是硬边界：生成时遇到这些领域，分身应当承认不知道，
              而不是编一个听起来合理的答案。
            </p>
          </motion.div>
        </div>
      </section>

      {p.catchphrases.length > 0 && (
        <section className="section">
          <div className="section-head">
            <h2>语癖</h2>
            <p className="dim" style={{ fontSize: 13.5 }}>
              尽量取自这位答主的真实原文，生成时按语境少量使用，不堆砌。
            </p>
          </div>
          <div className="card" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {p.catchphrases.map((c) => (
              <span key={c} className="chip mono">
                {c}
              </span>
            ))}
          </div>
        </section>
      )}

      <section className="section">
        <div className="section-head">
          <h2>蒸馏依据</h2>
        </div>
        <div className="card">
          <div className="row-between" style={{ alignItems: "baseline" }}>
            <span style={{ fontWeight: 700 }}>{corpusLabel(p)}</span>
            <span className={"chip " + (p.corpus.real ? "chip-green" : "chip-orange")}>
              {p.corpus.real ? "真实抓取" : "预置人格"}
            </span>
          </div>

          {p.corpus.real ? (
            <p className="dim" style={{ fontSize: 13.5, marginTop: 10 }}>
              抓取时间：{p.corpus.capturedAt || "—"} · 样本 {p.corpus.sampleSize} 条
            </p>
          ) : (
            <p className="dim" style={{ fontSize: 13.5, marginTop: 10, lineHeight: 1.85 }}>
              这份档案目前按公开印象撰写，<strong>没有</strong>抓取这位答主的全量回答，
              因此不声称「真实蒸馏」。跑通抓取与蒸馏脚本后，本页的样本数与代表性来源会一并补上。
            </p>
          )}

          {p.corpus.sources.length > 0 ? (
            <div style={{ display: "grid", gap: 10, marginTop: 14 }}>
              {p.corpus.sources.map((s) => (
                <a
                  key={s.url}
                  className="card-flat"
                  href={s.url}
                  target="_blank"
                  rel="noreferrer noopener"
                  style={{ display: "block" }}
                >
                  <div style={{ fontWeight: 700, fontSize: 13.5 }}>{s.title}</div>
                  <div className="mono dimmer" style={{ fontSize: 11.5, marginTop: 4 }}>
                    {s.author} · 赞同 {s.voteUp}
                  </div>
                </a>
              ))}
            </div>
          ) : (
            <div className="notice notice-info" style={{ marginTop: 14 }}>
              尚未抓取代表性来源。在此之前，本页不会列出任何「来源」，
              以免把预置内容伪装成真实语料。
            </div>
          )}
        </div>
      </section>

      <section className="section">
        <div className="card" style={{ borderColor: "rgba(77,124,255,0.35)" }}>
          <p className="eyebrow">下一步</p>
          <h3 style={{ marginBottom: 10 }}>让 {p.displayName} 回答一个真实问题</h3>
          <p className="dim" style={{ fontSize: 13.5 }}>
            回到首页后，这位答主会被预选。你可以只让他一个人答，也可以再拉上别人对同一件事发表看法。
          </p>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 16 }}>
            <Link className="btn btn-primary" href={"/?persona=" + p.handle}>
              带他去提问
            </Link>
            <Link className="btn btn-ghost" href="/personas">
              看看别人
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
