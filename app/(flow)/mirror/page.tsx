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
import { personaCandidates } from "@/lib/domain/router";
import { splitSources } from "@/lib/domain/evidence";
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
  /*
   * 3.5：记下「被邀请的那位」的名字 —— 邀请卡片要显示他。
   *
   * ⚠️ 2026-09-17 审计修正：这里原本存的是 `{ id, name }`，注释还写着
   * 「搬运区域还要按他定位」—— 但那个 `id` **从没被读过**（`HandoffPanel` 的
   * `inviteAnswerId` 参数没有任何调用点传值，已删）。只留名字，不留一个
   * 看着有用、实际没人用的字段。
   */
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

  const presentHandles = useMemo(
    () => (mirror ? mirror.skills.map((s) => s.persona?.handle).filter((h): h is string => !!h) : []),
    [mirror],
  );

  if (!ready) {
    return <div className="skeleton" style={{ height: 320, marginTop: 40 }} />;
  }

  // 没有当前会话时，这一页的职责就是把人送回第 1 步 —— 不在这里铺名册，
  // 也不放通往「分身发现」的链接（提问/回答流程中不该跳去浏览名册），
  // 更不假装有结果可看。
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
          </p>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 20 }}>
            <Link className="btn btn-primary" href="/">去提出一个问题 →</Link>
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

        {/**
         * 「N 条真实知乎来源」只数**可核对**的（作者名与链接齐全），与回答页、
         * 右栏广播同一口径 —— 见 lib/domain/evidence.ts 的 splitSources。
         * 过去这里写的是 skills.reduce(sources.length)，把署名/链接缺失的条目也数进去，
         * 于是顶栏可能比回答页真正列得出的多（实测全库 195 条里有 5 条未取回署名）。
         */}
        <div className="grid grid-4" style={{ marginTop: 22 }}>
          {[
            { n: mirror.skills.length, l: "位答主分身" },
            { n: mirror.answers.length, l: "篇回答" },
            { n: mirror.gaps.length, l: "个缺口", s: filled > 0 ? `已补 ${filled}` : undefined },
            {
              n: mirror.answers.reduce((a, x) => a + splitSources(x.evidence).displayable.length, 0),
              l: "条真实知乎来源",
            },
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
              onInvite={(gap) => {
                setInvited(gap.candidates[0]?.name ?? null);
              }}
              /*
               * 「没有匹配到真人」时也要有一条真实的路可走。
               * 过去这里不给出口，于是缺口卡片最需要人参与的那一档反而是死胡同 ——
               * 而 /fill 正是为此存在的，且完全可用。
               *
               * 待补的那一篇优先选**状态仍是 ai** 的第一条：那是还没被真人碰过的，
               * 补它信息增量最大；都补过了就退回第一条（让链接始终可用，不指向空）。
               */
              fillHref={
                "/fill?answerId=" +
                encodeURIComponent(
                  (mirror.answers.find((a) => a.status === "ai") ?? mirror.answers[0])?.id ?? "",
                )
              }
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
              {invited} 这个缺口 AI 补不了。先在下面的搬运区域复制一段邀请文案，
              发给他本人；他补完的那一段会并进这一场的最终稿。
            </p>
            <div style={{ marginTop: 16, display: "flex", gap: 10, flexWrap: "wrap" }}>
              {/*
                3.5：「邀请补充」入口应进入**当前这一场**的搬运区域。
                所以主入口指向 #handoff（搬运面板上的锚点），不再跳到 /fill ——
                /fill 是「真人当面补」的另一条路，保留为次要入口（已通过验收，见 #79）。

                ⚠️ 2026-09-17 审计修正：这里原先还写「并把被邀请的这位传过去，
                让搬运区域默认就准备好他的邀请文案」—— 那句话**没有实现**：
                `HandoffPanel` 的 `inviteAnswerId` 参数没有任何调用点传值（已删）。
                原因是缺口候选（检索到的真人作者）与分身回答（AI 稿）不是同一类对象、
                id 也不同源，要真正「按人定位」得先定产品口径（见 docs/backlog.md A3）。
                在口径定下来之前，不留「看着已接线」的死参数。
              */}
              <a className="btn btn-primary" href="#handoff">去搬运区域复制邀请文案</a>
              <Link className="btn btn-ghost" href="/fill">我自己替他补充</Link>
              <button className="btn btn-ghost" onClick={() => setInvited(null)}>稍后再说</button>
            </div>
          </div>
        </motion.section>
      )}

      <section className="section">
        <HandoffPanel />
      </section>

      {/*
        2026-09-17：这里原先是「这场生成出来的关系」—— 本场关系图，owner 判「一直没太做好」，
        已整体下线。留下的两个后遗症都在这条提交里一并收掉，否则文案会撒谎：
          1. `/fill` 提交成功页那句「会多出节点和边」的承诺，和指向 `/mirror#mesh` 的深链
             —— 删图之后没有任何一张图会因补一段真人而变化（`/me` 那张只看关键词共现）；
          2. 看山流程第 8 步那句「关系图会跟着变」的 caption。
        守卫见 `scripts/check-square-crowd.mjs` 的 ⑥。
        搬运入口不在这里 —— 上面 `HandoffPanel` 就是，不需要借关系图再挂一条。
      */}

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
