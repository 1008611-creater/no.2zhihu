"use client";

import Link from "next/link";
import { motion } from "motion/react";
import { PERSONAS, corpusLabel } from "@/lib/domain/personas";
import { PUBLIC_FIGURES, PUBLIC_FIGURE_LABEL } from "@/lib/domain/publicFigures";
import PersonaPopover from "@/components/mirror/PersonaPopover";
import { DUR, EASE, SHIFT } from "@/lib/motion/tokens";

/**
 * 分身名册 —— 「分身发现」这条主线的主体。
 *
 * 2026-09-15 两条主线重构：这段内容原先长在 `/mirror` 的顶部（DiscoverSection）。
 * 问题是 `/mirror` 是「提问流程的第二站」，用户点完「查看回答」进来，第一眼却是
 * 一份全量答主名册 —— 两条主线在同一屏里互相打断。现在名册整体搬到 `/discover`，
 * 由独立的 Tab 承载；`/mirror` 只剩这一场的结果。
 *
 * 「答主档案」与「公共人物」放在同一页：两者都是「这里住着谁」，
 * 拆成两页会让用户来回跳，也容易两份名单各自过期。
 */
export default function PersonaRoster() {
  const realCorpus = PERSONAS.filter((p) => p.corpus?.real).length;

  return (
    <>
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
            {/* 外层是 div 而不是 Link：卡片里有两个动作（看档案 / 带他去提问），
                整块可点会让「查看详情」永远被跳转吃掉。改由内层两个链接各自承担。 */}
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
                {/* 只有真实抓取到语料时才给依据。没抓到时整块不渲染 —— 既不写
                    「依据公开资料撰写」这类自我否定，也不留一段占位空白。 */}
                {p.corpus.real && (
                  <span className="mono dimmer" style={{ fontSize: 11.5 }}>
                    {corpusLabel(p)}
                  </span>
                )}
                <Link
                  href={"/?persona=" + p.handle}
                  className="link mono"
                  style={{ fontSize: 11.5, marginLeft: "auto" }}
                >
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
    </>
  );
}
