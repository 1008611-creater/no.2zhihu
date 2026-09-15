"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { KanshanStage } from "@/components/kanshan/KanshanStage";
import { useMirror } from "@/lib/store/mirror-store";
import type { HotItem } from "@/lib/zhihu/types";

/**
 * 虚拟广场：看山主持的问题流。
 *
 * 上半部分是评委可以现场验证的真实数据 —— 知乎热榜（额度 100/天，
 * 服务端缓存 10 分钟）。下半部分是本次会话里已经生成的镜像问题。
 */

type Filter = "all" | "hot" | "mirror";

export default function SquarePage() {
  const { history, setMirror } = useMirror();
  const [hot, setHot] = useState<HotItem[] | null>(null);
  const [hotError, setHotError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [step, setStep] = useState(-1);

  useEffect(() => {
    let alive = true;
    fetch("/api/zhihu/hot?limit=20")
      .then((r) => r.json())
      .then((d) => {
        if (!alive) return;
        if (d.ok) setHot(d.data.Items ?? []);
        else setHotError(d.error ?? "热榜不可用");
      })
      .catch(() => alive && setHotError("热榜不可用"));
    return () => { alive = false; };
  }, []);

  const runKanshan = useCallback(() => {
    setStep(-1);
    const timers = [0, 1, 2, 3].map((i) => setTimeout(() => setStep(i), i * 380));
    const done = setTimeout(() => setStep(4), 4 * 380);
    return () => { timers.forEach(clearTimeout); clearTimeout(done); };
  }, []);

  const showHot = filter === "all" || filter === "hot";
  const showMirror = filter === "all" || filter === "mirror";

  const stats = useMemo(() => [
    { n: history.length, l: "本场镜像问题" },
    { n: history.reduce((a, m) => a + m.skills.length, 0), l: "参与的分身" },
    { n: history.reduce((a, m) => a + m.answers.length, 0), l: "生成的回答" },
    { n: history.reduce((a, m) => a + m.gaps.length, 0), l: "待补的缺口" }
  ], [history]);

  return (
    <>
      <section style={{ paddingTop: 44 }}>
        <p className="eyebrow">Virtual square · 看山主持</p>
        <h1 style={{ maxWidth: "22ch" }}>虚拟广场</h1>
        <p className="lede" style={{ marginTop: 16 }}>
          这里同时挂着两样东西：知乎此刻真实在热的问题，和这场演示里已经生成的镜像问题。
          点热榜任意一条，看山会把它变成一个新的镜像问题。
        </p>

        <div className="grid grid-4" style={{ marginTop: 24 }}>
          {stats.map((s) => (
            <div key={s.l} className="stat">
              <div className="stat-n">{s.n}</div>
              <div className="stat-l">{s.l}</div>
            </div>
          ))}
        </div>

        <div className="grid grid-2" style={{ marginTop: 20, alignItems: "start" }}>
          <div className="card">
            <p className="eyebrow">Kanshan · host</p>
            <h3 style={{ marginBottom: 10 }}>看山在广场上做什么</h3>
            <ul className="dim" style={{ margin: 0, paddingLeft: 18, fontSize: 13.5, lineHeight: 1.9 }}>
              <li>把热榜上的真实问题接进来，作为新的镜像问题候选。</li>
              <li>为每个问题挑 3–6 个 Skill 分身，而不是让同一个模型换语气。</li>
              <li>标出这组回答共同缺失的那一块，再去找写过相关内容的人。</li>
            </ul>
            <div style={{ marginTop: 16, display: "flex", gap: 10, flexWrap: "wrap" }}>
              <button className="btn btn-sm" onClick={runKanshan}>让看山走一遍流程</button>
              <Link className="btn btn-sm btn-ghost" href="/">自己提一个问题</Link>
            </div>
          </div>
          <KanshanStage step={step} running={step >= 0 && step < 4} size={158} />
        </div>
      </section>

      <section className="section">
        <div className="section-head">
          <h2>广场问题流</h2>
          <div style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
            {([["all", "全部"], ["hot", "知乎热榜"], ["mirror", "本场镜像"]] as const).map(([k, l]) => (
              <button
                key={k}
                className="chip"
                style={{ cursor: "pointer", ...(filter === k ? { borderColor: "var(--blue)", color: "var(--blue-soft)" } : {}) }}
                onClick={() => setFilter(k)}
              >
                {l}
              </button>
            ))}
          </div>
        </div>

        {showMirror && history.length > 0 && (
          <div className="grid grid-3" style={{ marginBottom: 22 }}>
            <AnimatePresence>
              {history.map((m, i) => (
                <motion.div
                  key={m.id}
                  className="card"
                  initial={{ opacity: 0, y: 14 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.32, delay: i * 0.05 }}
                >
                  <div className="accent-bar a-blue" />
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 9 }}>
                    <span className="chip chip-blue">{m.routing.intent}</span>
                    <span className="chip mono">{m.skills.length} 分身</span>
                    <span className="chip mono">{m.gaps.length} 缺口</span>
                  </div>
                  <h3 style={{ fontSize: 15.5, marginBottom: 8 }}>{m.title}</h3>
                  <div className="dim" style={{ fontSize: 13, marginBottom: 14 }}>{m.routing.summary}</div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button className="btn btn-sm" onClick={() => setMirror(m)}>载入工作台</button>
                    <Link className="btn btn-sm btn-ghost" href="/mirror">查看</Link>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}

        {showMirror && history.length === 0 && (
          <div className="notice" style={{ marginBottom: 22 }}>
            这场还没有生成过镜像问题。去首页提一个，或直接点下面的热榜条目。
          </div>
        )}

        {showHot && (
          <>
            <div className="section-head">
              <h3>知乎热榜（真实接口）</h3>
              <span className="mono dimmer" style={{ marginLeft: "auto" }}>额度 100/天 · 缓存 10 分钟</span>
            </div>

            {hotError && <div className="notice notice-warn">热榜暂时不可用：{hotError}</div>}
            {!hot && !hotError && (
              <div className="grid grid-2">
                {[0, 1, 2, 3].map((i) => <div key={i} className="skeleton" style={{ height: 86 }} />)}
              </div>
            )}

            {hot && (
              <div className="grid grid-2">
                {hot.map((item, i) => (
                  <motion.div
                    key={item.Url || i}
                    className="card-flat"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.28, delay: Math.min(i * 0.03, 0.5) }}
                    style={{ display: "flex", gap: 12, alignItems: "flex-start" }}
                  >
                    <span className="chip mono">{i + 1}</span>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 6 }}>{item.Title}</div>
                      {item.Summary && (
                        <div className="dimmer" style={{ fontSize: 12.5, marginBottom: 8 }}>
                          {String(item.Summary).slice(0, 90)}
                        </div>
                      )}
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        <a className="link mono" href={item.Url} target="_blank" rel="noreferrer noopener">去知乎看</a>
                        <Link className="link mono" href={"/?q=" + encodeURIComponent(item.Title)}>做成镜像问题 →</Link>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>
            )}
          </>
        )}
      </section>
    </>
  );
}
