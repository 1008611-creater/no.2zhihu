"use client";

import Link from "next/link";
import { motion } from "motion/react";
import { PERSONAS, corpusLabel } from "@/lib/domain/personas";
import { PUBLIC_FIGURES, PUBLIC_FIGURE_LABEL } from "@/lib/domain/publicFigures";
import PersonaPopover from "@/components/mirror/PersonaPopover";
import { DUR, EASE, SHIFT } from "@/lib/motion/tokens";

/**
 * 分身发现 —— 独立 tab，回答「这座虚拟知乎里住着谁」。
 *
 * 2026-09-15 从 /mirror 里拆出来（原先它和「本场结果」挤在同一个 tab）：
 * 名册的职责是「看人」，与有没有生成过镜像问题无关；本场结果的职责是
 * 「看答案」，只在生成之后存在。两者放在一起时，新用户只看到一句提示、
 * 老用户要先划过一整页名册，两边都不好用。现在这里只讲人，一个 tab 一个职责。
 *
 * 卡片上两个动作各自独立（看档案 / 带他去提问），因此外层是 div 不是 Link ——
 * 整块可点会让「查看详情」永远被跳转吃掉。
 */
export default function PersonaDirectory() {
  const realCorpus = PERSONAS.filter((p) => p.corpus?.real).length;

  return (
    <section style={{ paddingTop: 32 }}>
      <p className="eyebrow">Discover · 分身发现</p>
      <h1 className="no-tail" style={{ fontSize: "clamp(24px, 3.2vw, 36px)", maxWidth: "26ch" }}>
        这里住着 {PERSONAS.length} 位知乎答主
        <br />
        和 {PUBLIC_FIGURES.length} 位公共人物的分身
      </h1>

      <div className="grid grid-3" style={{ marginTop: 24 }}>
        {[
          { n: PERSONAS.length, l: "位答主分身" },
          { n: realCorpus, l: "位基于真实语料" },
          { n: PUBLIC_FIGURES.length, l: "位公共人物" },
        ].map((s) => (
          <div key={s.l} className="stat">
            <div className="stat-n">{s.n}</div>
            <div className="stat-l">{s.l}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-3" style={{ marginTop: 20 }}>
        {PERSONAS.map((p, i) => (
          <motion.div
            key={p.handle}
            initial={{ opacity: 0, y: SHIFT.md }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: DUR.slow, ease: EASE.out, delay: Math.min(i * 0.04, 0.4) }}
            style={{ display: "flex" }}
          >
            <div
              className="card persona-tile"
              style={{ display: "flex", flexDirection: "column", width: "100%" }}
            >
              <div className={"accent-bar a-" + p.accent} />
              <div className="row-between" style={{ alignItems: "baseline", gap: 10 }}>
                <h3 style={{ margin: 0, fontSize: 16 }}>{p.displayName}</h3>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                  <span className="persona-mono">@{p.handle}</span>
                  <PersonaPopover persona={p} />
                </span>
              </div>
              <Link
                href={"/personas/" + p.handle}
                className="persona-tile-main"
                style={{ display: "block" }}
              >
                <p className="dim" style={{ fontSize: 13, margin: "8px 0 10px" }}>
                  {p.headline}
                </p>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
                  {p.voice.tone.slice(0, 3).map((t) => (
                    <span key={t} className="chip">
                      {t}
                    </span>
                  ))}
                </div>
              </Link>
              <div className="row-between" style={{ marginTop: "auto" }}>
                {/* corpusLabel 在未抓取语料时返回空串 —— 此时整块不渲染，不留一段空白。 */}
                {corpusLabel(p) ? (
                  <span className="mono dimmer" style={{ fontSize: 11.5 }}>
                    {corpusLabel(p)}
                  </span>
                ) : (
                  <span />
                )}
                <Link href={"/?persona=" + p.handle} className="link mono" style={{ fontSize: 11.5 }}>
                  带他去提问 →
                </Link>
              </div>
            </div>
          </motion.div>
        ))}
      </div>

      <div className="section-head" style={{ marginTop: 34 }}>
        <div>
          <h2 className="no-tail">每个人格都拆成这四件事</h2>
        </div>
      </div>
      <div className="grid grid-4">
        {[
          { k: "knows", l: "知道什么", d: "领域与事实边界" },
          { k: "stance", l: "怎么看问题", d: "立场与判断倾向" },
          { k: "voice", l: "怎么说话", d: "句式、节奏与口头禅" },
          { k: "doesNotKnow", l: "不装懂什么", d: "明确拒答与交还给真人" },
        ].map((c) => (
          <div key={c.k} className="card-flat">
            <div style={{ fontWeight: 700, fontSize: 14 }}>{c.l}</div>
            <div className="dim" style={{ fontSize: 12.5, marginTop: 5 }}>
              {c.d}
            </div>
          </div>
        ))}
      </div>

      <div className="section-head" style={{ marginTop: 34 }}>
        <div>
          <h2 className="no-tail">公共人物 · 思维分身</h2>
        </div>
        <span className="mono dimmer" style={{ marginLeft: "auto" }}>
          {PUBLIC_FIGURE_LABEL}
        </span>
      </div>

      <div className="grid grid-3">
        {PUBLIC_FIGURES.map((f, i) => (
          <motion.div
            key={f.id}
            className="card"
            initial={{ opacity: 0, y: SHIFT.md }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: DUR.slow, ease: EASE.out, delay: Math.min(i * 0.04, 0.4) }}
          >
            <div className={"accent-bar a-" + f.accent} />
            <div
              className="row-between"
              style={{ alignItems: "baseline", gap: 10, marginBottom: 10 }}
            >
              <h3 style={{ margin: 0, fontSize: 16 }}>{f.name}</h3>
              <span className="mono dimmer" style={{ fontSize: 11 }}>
                研究草案
              </span>
            </div>
            <div style={{ display: "grid", gap: 5 }}>
              {f.capabilities.map((c) => (
                <div key={c.id} className="dim" style={{ fontSize: 12.5 }}>
                  · {c.name}
                </div>
              ))}
            </div>
          </motion.div>
        ))}
      </div>

      <p className="dim" style={{ fontSize: 12.5, marginTop: 14 }}>
        公共人物分身的推理路径来自公开资料，正在逐项核验 —— 核验通过的能力才会进入作答链路。
        这里如实标注，不把「按公开资料推演」写成「本人原话」。
      </p>
    </section>
  );
}
