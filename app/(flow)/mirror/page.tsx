"use client";

import { useInviteUrl } from '@/lib/motion/useInviteUrl';

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { motion } from "motion/react";
import { useMirror } from "@/lib/store/mirror-store";
import { KanshanStage } from "@/components/kanshan/KanshanStage";
import AnswerCard from "@/components/mirror/AnswerCard";
import DebatePanel from "@/components/mirror/DebatePanel";
import GapCard from "@/components/mirror/GapCard";
import HandoffPanel from "@/components/mirror/HandoffPanel";
import InviteDrawer, { type InviteOutcome } from "@/components/mirror/InviteDrawer";
import { FLOW_STATES } from "@/components/kanshan/states";
import { buildMesh } from "@/lib/domain/mesh";
import { personaCandidates } from "@/lib/domain/router";
import { PERSONAS, corpusLabel } from "@/lib/domain/personas";
import { PUBLIC_FIGURES, PUBLIC_FIGURE_LABEL } from "@/lib/domain/publicFigures";
import MeshGraph from "@/components/mesh/MeshGraph";

/**
 * 镜像工作台。
 *
 * 与首页共用同一份 localStorage 会话数据。首页负责「提问 + 选答主」，
 * 工作台负责「读回答 + 继续邀请 + 互相回应 + 搬运」。
 *
 * 回答区分两轮：round=0 是各自首轮作答，round=1 是互相回应。
 * 两轮分开渲染，评委一眼能看出「这几个人在互相接话」。
 */
export default function MirrorPage() {
  const { mirror, ready, appendInvite, appendReplies } = useMirror();
  const [step, setStep] = useState(FLOW_STATES.length);
  const [invited, setInvited] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useInviteUrl();
  const [inviteNote, setInviteNote] = useState<string | null>(null);

  useEffect(() => {
    // 进入工作台时把流程条走一遍，让评委看清每一步
    setStep(-1);
    const timers = FLOW_STATES.map((_, i) => setTimeout(() => setStep(i), i * 340));
    const done = setTimeout(() => setStep(FLOW_STATES.length), FLOW_STATES.length * 340);
    return () => { timers.forEach(clearTimeout); clearTimeout(done); };
  }, [mirror?.id]);

  /**
   * 从首页生成完跳过来时带 #answers。
   *
   * 浏览器原生锚点跳转在这一页不可靠：首屏要先等 ready 才渲染出结果区，
   * 锚点在 DOM 出现之前就已经尝试过滚动了。所以这里自己补一次。
   */
  useEffect(() => {
    if (!ready || !mirror) return;
    if (window.location.hash !== "#answers") return;
    const id = requestAnimationFrame(() => {
      document.getElementById("answers")?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
    return () => cancelAnimationFrame(id);
  }, [ready, mirror]);

  const mesh = useMemo(() => (mirror ? buildMesh(mirror) : null), [mirror]);

  const presentHandles = useMemo(
    () => (mirror ? mirror.skills.map((s) => s.persona?.handle).filter((h): h is string => !!h) : []),
    [mirror],
  );

  if (!ready) {
    return <div className="skeleton" style={{ height: 320, marginTop: 40 }} />;
  }

  // 「分身发现」是这个 Tab 的核心，与是否生成过镜像问题无关 —— 先让人看到这里住着谁。
  if (!mirror) {
    return (
      <div className="page-enter">
        <DiscoverSection />
        <section className="section">
          <div className="notice">
            还没有镜像问题。点上面任意一位分身，直接带着他去提问；也可以回首页自己输入一个问题。
          </div>
        </section>
      </div>
    );
  }

  const filled = mirror.gaps.filter((g) => g.filledBy).length;
  const firstRound = mirror.answers.filter((a) => (a.round ?? 0) === 0);
  const replies = mirror.answers.filter((a) => (a.round ?? 0) > 0);

  function handleInvited(outcome: InviteOutcome) {
    appendInvite(outcome.skill, outcome.answer);
    setDrawerOpen(false);
    if (outcome.mode === "distilled" && outcome.note) setInviteNote(outcome.note);
  }

  return (
    <>
      <DiscoverSection />

      <section className="section">
        <p className="eyebrow">Mirror workspace · 本场结果</p>
        <h1 style={{ fontSize: "clamp(24px, 3.2vw, 36px)", maxWidth: "24ch" }}>{mirror.title}</h1>

        <div className="grid grid-4" style={{ marginTop: 22 }}>
          {[
            { n: mirror.skills.length, l: "位答主分身" },
            { n: mirror.answers.length, l: "篇回答" },
            { n: mirror.gaps.length, l: "个缺口", s: filled > 0 ? `已补 ${filled}` : undefined },
            { n: mirror.skills.reduce((a, s) => a + s.sources.length, 0), l: "条真实知乎来源" }
          ].map((s) => (
            <div key={s.l} className="stat">
              <div className="stat-n">{s.n}</div>
              <div className="stat-l">{s.l}{s.s ? ` · ${s.s}` : ""}</div>
            </div>
          ))}
        </div>

        <div className="grid grid-2" style={{ marginTop: 20, alignItems: "start" }}>
          <div className="card">
            <p className="eyebrow">Human Router</p>
            <h3 style={{ marginBottom: 10 }}>{mirror.routing.summary}</h3>
            <div style={{ display: "grid", gap: 8 }}>
              {mirror.routing.picks.map((p) => {
                const skill = mirror.skills.find((s) => s.id === p.skillId);
                return (
                  <div key={p.skillId} className="card-flat" style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                    <span className={`chip chip-${skill?.accent ?? "blue"}`}>{p.score}</span>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 13.5 }}>{skill?.name ?? p.skillId}</div>
                      <div className="dim" style={{ fontSize: 12.5 }}>{p.reason}</div>
                    </div>
                  </div>
                );
              })}
            </div>
            <hr className="divider" />
            <div className="mono dimmer">检索词：{mirror.routing.queries.join(" ｜ ")}</div>
          </div>

          <KanshanStage step={step} running={step < FLOW_STATES.length} size={168} />
        </div>
      </section>

      <section className="section" id="answers">
        <div className="section-head">
          <h2>首轮作答</h2>
          <p className="dim" style={{ fontSize: 13.5 }}>每位答主各写一篇，正文只使用他自己对应的真实公开来源。</p>
        </div>
        <div className="grid grid-3">
          {firstRound.map((a, i) => <AnswerCard key={a.id} answer={a} index={i} />)}
        </div>
      </section>

      {replies.length > 0 && (
        <section className="section">
          <div className="section-head">
            <h2>互相回应</h2>
            <p className="dim" style={{ fontSize: 13.5 }}>一轮，不循环。他们接的是对方已经说过的话。</p>
          </div>
          <div className="grid grid-3">
            {replies.map((a, i) => <AnswerCard key={a.id} answer={a} index={i} />)}
          </div>
        </section>
      )}

      <section className="section">
        <div style={{ display: "grid", gap: 12 }}>
          <DebatePanel
            question={mirror.title}
            answers={mirror.answers}
            onReplies={(r) => appendReplies(r)}
          />
          {inviteNote && <div className="notice notice-info">{inviteNote}</div>}
          <button className="btn btn-primary" onClick={() => setDrawerOpen(true)}>
            + 邀请一个分身回答
          </button>
        </div>
      </section>

      <section className="section">
        <div className="section-head">
          <h2>看山发现的缺口</h2>
          <p className="dim" style={{ fontSize: 13.5 }}>这些地方分身答不了，必须由真人补上。</p>
        </div>
        <div style={{ display: "grid", gap: 12 }}>
          {mirror.gaps.map((g, i) => (
            <GapCard
              key={g.id}
              gap={g}
              index={i}
              onInvite={(gap) => setInvited(gap.candidates[0]?.id ?? null)}
            />
          ))}
          {mirror.gaps.length === 0 && (
            <div className="notice notice-info">这一轮没有发现明显缺口，可以直接搬运。</div>
          )}
        </div>
      </section>

      {invited && (
        <motion.section
          className="section"
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <div className="card" style={{ borderColor: "rgba(77,124,255,0.4)" }}>
            <p className="eyebrow">Human invite</p>
            <h2>真人邀请已生成</h2>
            <p className="lede" style={{ marginTop: 12 }}>
              这个缺口 AI 补不了。进入补充页，用「最小填空」或「完整编辑」把这一段补完，
              看山会把这一段接到 Human Mesh 上。
            </p>
            <div style={{ marginTop: 16, display: "flex", gap: 10, flexWrap: "wrap" }}>
              <Link className="btn btn-primary" href="/fill">进入真人补充页</Link>
              <button className="btn btn-ghost" onClick={() => setInvited(null)}>稍后再说</button>
            </div>
          </div>
        </motion.section>
      )}

      <section className="section">
        <HandoffPanel />
      </section>

      {mesh && (
        <section className="section">
          <div className="section-head">
            <h2>Human Mesh 实时更新</h2>
            <Link className="link mono" href="/mesh">查看完整关系图 →</Link>
          </div>
          <MeshGraph graph={mesh} height={380} />
        </section>
      )}

      <InviteDrawer
        open={drawerOpen}
        question={mirror.title}
        candidates={personaCandidates(mirror.title)}
        presentHandles={presentHandles}
        onClose={() => setDrawerOpen(false)}
        onInvited={handleInvited}
      />
    </>
  );
}

/**
 * 分身发现 —— 这个 Tab 的核心。
 *
 * 旧版一进来就是「本场会话的工作台数据」，没生成过镜像问题时甚至只剩一句提示，
 * 完全看不到这座虚拟知乎里到底住着谁。现在把「人」提到最前面：
 * 答主名册 + 公共人物分身，点任意一位直接带他进入提问流程。
 */
function DiscoverSection() {
  return (
    <section style={{ paddingTop: 32 }}>
      <Link className="link mono" href="/" style={{ fontSize: 12 }}>
        ← 返回首页
      </Link>
      <p className="eyebrow" style={{ marginTop: 14 }}>Discover · 分身发现</p>
      <h1 style={{ fontSize: "clamp(24px, 3.2vw, 36px)", maxWidth: "26ch" }}>
        这里住着 {PERSONAS.length} 位知乎答主，
        <br />
        和 {PUBLIC_FIGURES.length} 位公共人物的思维分身。
      </h1>
      <p className="lede" style={{ marginTop: 14, maxWidth: "62ch" }}>
        每一位都不是「换一种语气的同一个模型」：他知道什么、怎么看问题、怎么说话、
        明确不装懂什么，这四件事都不一样。点一位，直接带着他去提问。
      </p>

      <div className="grid grid-3" style={{ marginTop: 24 }}>
        {PERSONAS.map((p, i) => (
          <motion.div
            key={p.handle}
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: Math.min(i * 0.04, 0.4) }}
            style={{ display: "flex" }}
          >
            <Link
              href={"/?persona=" + p.handle}
              className="card persona-tile"
              style={{ display: "flex", flexDirection: "column", width: "100%" }}
            >
              <div className={"accent-bar a-" + p.accent} />
              <div className="row-between" style={{ alignItems: "baseline", gap: 10 }}>
                <h3 style={{ margin: 0, fontSize: 16 }}>{p.displayName}</h3>
                <span className="persona-mono">@{p.handle}</span>
              </div>
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
              <div className="row-between" style={{ marginTop: "auto" }}>
                <span className="mono dimmer" style={{ fontSize: 11.5 }}>
                  {corpusLabel(p)}
                </span>
                <span className="link mono" style={{ fontSize: 11.5 }}>
                  带他去提问 →
                </span>
              </div>
            </Link>
          </motion.div>
        ))}
      </div>

      <div className="section-head" style={{ marginTop: 34 }}>
        <div>
          <h2>公共人物 · 思维分身</h2>
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
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: Math.min(i * 0.04, 0.4) }}
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
