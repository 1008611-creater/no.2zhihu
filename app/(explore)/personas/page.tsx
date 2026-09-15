"use client";

import Link from "next/link";
import { motion } from "motion/react";
import { PERSONAS, corpusLabel } from "@/lib/domain/personas";
import { Kanshan } from "@/components/kanshan/Kanshan";

/**
 * 答主名册。
 *
 * 这是「嵌套架构」的第一层子页面：首页负责提问与演示闭环，
 * 名册页负责把一个抽象产品概念 —— 「分身」—— 落到具体的人身上。
 *
 * 为什么单独成页：评审在首页看到的是「生成的回答」，看不到「人」。
 * 把人集中摊开，才能解释清楚一件事：我们不是让一个模型换几种语气，
 * 而是给每一位答主单独建了一份可追溯的档案。
 *
 * 诚实边界：当前 6 位全部是预置人格（corpus.real=false）。
 * 页面上如实标注，不把「按公开印象撰写」写成「真实语料蒸馏」。
 */
export default function PersonasPage() {
  const distilled = PERSONAS.filter((p) => p.corpus.real).length;

  return (
    <div className="page-enter">
      <section className="hero" style={{ paddingTop: 44 }}>
        <div className="hero-grid">
          <div>
            <p className="eyebrow">Persona roster · 答主名册</p>
            <h1>
              这座虚拟知乎里，
              <br />
              <em>只住着 {PERSONAS.length} 个人。</em>
            </h1>
            <p className="lede">
              他们不是泛化的「视角」，而是具体的知乎答主。每个人都被拆成同样的四件事：
              他知道什么、他怎么看问题、他怎么说话、以及他明确不装懂什么。
              分身回答之所以不像同一个人，就是因为这四个字段各不相同。
            </p>
          </div>
          <div className="hero-char">
            <Kanshan state="greeting" size={196} />
            <div className="hero-char-label mono">KANSHAN · ROSTER</div>
          </div>
        </div>

        <div className="grid grid-3" style={{ marginTop: 26 }}>
          {[
            { n: PERSONAS.length, l: "位答主分身" },
            { n: distilled, l: "位真实语料蒸馏", s: distilled === 0 ? "其余为预置人格" : undefined },
            { n: 4, l: "要素 / 每人" },
          ].map((s) => (
            <div key={s.l} className="stat">
              <div className="stat-n">{s.n}</div>
              <div className="stat-l">
                {s.l}
                {s.s ? " · " + s.s : ""}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="section">
        <div className="section-head">
          <h2>全部答主</h2>
          <p className="dim" style={{ fontSize: 13.5 }}>
            点开任意一位，可以看到他完整的语言档案与蒸馏依据。
          </p>
        </div>

        <div className="grid grid-3">
          {PERSONAS.map((p, i) => (
            <motion.div
              key={p.handle}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ type: "spring", stiffness: 260, damping: 26, delay: i * 0.06 }}
              style={{ display: "flex" }}
            >
              <Link
                href={"/personas/" + p.handle}
                className="card persona-tile"
                style={{ display: "flex", flexDirection: "column", width: "100%" }}
              >
                <div className={"accent-bar a-" + p.accent} />

                <div className="row-between" style={{ alignItems: "baseline", gap: 10 }}>
                  <h3 style={{ margin: 0 }}>{p.displayName}</h3>
                  <span className="persona-mono">@{p.handle}</span>
                </div>

                <p className="dim" style={{ fontSize: 13.5, margin: "8px 0 12px" }}>
                  {p.headline}
                </p>

                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 14 }}>
                  {p.voice.tone.slice(0, 3).map((t) => (
                    <span key={t} className="chip">
                      {t}
                    </span>
                  ))}
                </div>

                <div className="lbl">他知道什么</div>
                <div style={{ display: "grid", gap: 3, marginBottom: 12 }}>
                  {p.knows.slice(0, 2).map((k) => (
                    <div key={k} className="dim" style={{ fontSize: 12.5 }}>
                      · {k}
                    </div>
                  ))}
                </div>

                <div className="lbl">他不装懂什么</div>
                <div style={{ display: "grid", gap: 3, marginBottom: 14 }}>
                  {p.doesNotKnow.slice(0, 1).map((k) => (
                    <div key={k} className="dimmer" style={{ fontSize: 12.5 }}>
                      · {k}
                    </div>
                  ))}
                </div>

                <div className="row-between" style={{ marginTop: "auto" }}>
                  <span className="mono dimmer" style={{ fontSize: 11.5 }}>
                    {corpusLabel(p)}
                  </span>
                  <span className="link mono" style={{ fontSize: 11.5 }}>
                    打开档案 →
                  </span>
                </div>
              </Link>
            </motion.div>
          ))}
        </div>
      </section>

      <section className="section">
        <div className="section-head">
          <h2>每个人格都拆成这四件事</h2>
        </div>
        <div className="grid grid-4">
          {[
            { t: "他知道什么", d: "领域、经历与专业边界。决定这个人有没有资格谈这个问题。" },
            { t: "他怎么看问题", d: "价值判断与常见立场。决定同一个事实，他会得出什么结论。" },
            { t: "他怎么说话", d: "句长、语气、情绪强度与举例方式。决定读起来是不是同一个人。" },
            { t: "他不装懂什么", d: "明确划出不碰的范围。这一条让分身不会越界胡说。" },
          ].map((c, i) => (
            <motion.div
              key={c.t}
              className="card"
              initial={{ opacity: 0, y: 14 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.34, delay: i * 0.05 }}
            >
              <h3 style={{ marginBottom: 8 }}>{c.t}</h3>
              <p className="dim" style={{ fontSize: 13.5 }}>
                {c.d}
              </p>
            </motion.div>
          ))}
        </div>
      </section>

      <section className="section">
        <div className="card" style={{ borderColor: "rgba(255,138,76,0.32)" }}>
          <div className="accent-bar a-orange" />
          <p className="eyebrow">诚实说明</p>
          <p style={{ fontSize: 14, color: "var(--text-300)", lineHeight: 1.85, marginTop: 8 }}>
            当前名册里的 {PERSONAS.length} 位答主是<strong>预置人格</strong>：按公开印象撰写，
            尚未抓取全量回答。卡片上如实标注，不冒充真实语料蒸馏。
            跑通抓取与蒸馏脚本后，对应答主的标注会自动变为
            <span className="mono"> 基于 N 条真实回答蒸馏 </span>，其余字段由真实语料覆盖。
          </p>
          <div style={{ marginTop: 16 }}>
            <Link className="btn btn-sm" href="/about">
              看接口与合规审计
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
