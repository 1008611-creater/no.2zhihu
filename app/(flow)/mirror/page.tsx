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
import MeshGraph from "@/components/mesh/MeshGraph";
import { SHIFT } from "@/lib/motion/tokens";

/**
 * 邀请回答问题 —— 主流程的第 2 步，也是唯一的「看答案」页。
 *
 * 与首页共用同一份 localStorage 会话数据。首页负责「提出问题 + 选答主」，
 * 这里负责「读回答 + 邀请更多分身作答 + 盘点缺口」。
 *
 * 回答区分两轮：round=0 是各自首轮作答，round=1 是互相回应。
 * 两轮分开渲染，一眼能看出「这几个人在互相接话」。
 *
 * 2026-09-15：原先挤在这一页的「分身发现」名册已拆到独立 tab /personas。
 * 那一块与「有没有生成过镜像问题」无关，混在这里会让新用户只看到一句提示、
 * 老用户先划过一整页名册 —— 现在这一页只服务一个问题：这场答得怎么样。
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

  // 没有当前会话时，这一页的职责就是把人送回第 1 步 —— 不在这里铺名册
  // （名册已归 /personas），也不假装有结果可看。
  if (!mirror) {
    return (
      <div className="page-enter">
        <section style={{ paddingTop: 44 }}>
          <p className="eyebrow">Mirror workspace · 邀请回答</p>
          <h1 className="no-tail" style={{ maxWidth: "22ch" }}>
            这里还没有正在进行的问答
          </h1>
          <p className="lede" style={{ marginTop: 14 }}>
            先提出一个问题，选好答主，他们的分身答完就会出现在这里。
            想看这座虚拟知乎里有哪些分身，去「分身发现」。
          </p>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 20 }}>
            <Link className="btn btn-primary" href="/">去提出一个问题 →</Link>
            <Link className="btn btn-ghost" href="/personas">先看看有哪些分身</Link>
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
      <section className="section">
        <p className="eyebrow">Mirror workspace · 本场结果</p>
        <h1 className="no-tail" style={{ fontSize: "clamp(24px, 3.2vw, 36px)", maxWidth: "24ch" }}>{mirror.title}</h1>

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
                    <span className={`chip chip-${skill?.accent ?? "blue"}`}>
                      {p.score > 0 ? p.score : "视角"}
                    </span>
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
          <h2 className="no-tail">首轮作答</h2>
        </div>
        <div className="grid grid-3">
          {firstRound.map((a, i) => <AnswerCard key={a.id} answer={a} index={i} />)}
        </div>
      </section>

      {replies.length > 0 && (
        <section className="section">
          <div className="section-head">
            <h2 className="no-tail">互相回应</h2>
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
          <h2 className="no-tail">看山发现的缺口</h2>
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
          initial={{ opacity: 0, y: SHIFT.md }}
          animate={{ opacity: 1, y: 0 }}
        >
          <div className="card" style={{ borderColor: "rgba(77,124,255,0.4)" }}>
            <p className="eyebrow">Human invite</p>
            <h2 className="no-tail">真人邀请已生成</h2>
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
            <h2 className="no-tail">这场生成出来的关系</h2>
            {/*
              搬运入口统一收在「我的 Mesh」—— 搬运是收尾动作，不是作答流程的一步。
              这里只留一条去路，不再把整个搬运面板塞进作答流程下方。
            */}
            <Link className="link mono" href="/mesh">去我的 Mesh 一键搬回知乎 →</Link>
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
