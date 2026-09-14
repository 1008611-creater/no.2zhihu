"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { motion } from "motion/react";
import { useMirror } from "@/lib/store/mirror-store";
import { KanshanStage } from "@/components/kanshan/KanshanStage";
import SkillCard from "@/components/mirror/SkillCard";
import AnswerCard from "@/components/mirror/AnswerCard";
import GapCard from "@/components/mirror/GapCard";
import HandoffPanel from "@/components/mirror/HandoffPanel";
import { FLOW_STATES } from "@/components/kanshan/states";
import { buildMesh } from "@/lib/domain/mesh";
import MeshGraph from "@/components/mesh/MeshGraph";

export default function MirrorPage() {
  const { mirror, ready } = useMirror();
  const [step, setStep] = useState(FLOW_STATES.length);
  const [invited, setInvited] = useState<string | null>(null);

  useEffect(() => {
    // 进入工作台时把流程条走一遍，让评委看清每一步
    setStep(-1);
    const timers = FLOW_STATES.map((_, i) => setTimeout(() => setStep(i), i * 340));
    const done = setTimeout(() => setStep(FLOW_STATES.length), FLOW_STATES.length * 340);
    return () => { timers.forEach(clearTimeout); clearTimeout(done); };
  }, [mirror?.id]);

  const mesh = useMemo(() => (mirror ? buildMesh(mirror) : null), [mirror]);

  if (!ready) {
    return <div className="skeleton" style={{ height: 320, marginTop: 40 }} />;
  }

  if (!mirror) {
    return (
      <section style={{ paddingTop: 56 }}>
        <h1>还没有镜像问题</h1>
        <p className="lede" style={{ marginTop: 14 }}>先去首页输入一个问题，看山会把它拆成多个分身视角。</p>
        <Link className="btn btn-primary" href="/" style={{ marginTop: 20 }}>回到首页</Link>
      </section>
    );
  }

  const filled = mirror.gaps.filter((g) => g.filledBy).length;

  return (
    <>
      <section style={{ paddingTop: 40 }}>
        <p className="eyebrow">Mirror workspace</p>
        <h1 style={{ fontSize: "clamp(24px, 3.2vw, 36px)", maxWidth: "24ch" }}>{mirror.title}</h1>

        <div className="grid grid-4" style={{ marginTop: 22 }}>
          {[
            { n: mirror.skills.length, l: "个 Skill 分身" },
            { n: mirror.answers.length, l: "篇多视角回答" },
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

      <section className="section">
        <div className="section-head">
          <h2>Skill 分身阵容</h2>
          <p className="dim" style={{ fontSize: 13.5 }}>每个分身的视角与文风都来自真实公开回答的蒸馏。</p>
        </div>
        <div className="grid grid-3">
          {mirror.skills.map((s, i) => <SkillCard key={s.id} skill={s} index={i} />)}
        </div>
      </section>

      <section className="section">
        <div className="section-head">
          <h2>多视角回答群组</h2>
          <p className="dim" style={{ fontSize: 13.5 }}>正文只允许引用上面的真实来源。</p>
        </div>
        <div className="grid grid-3">
          {mirror.answers.map((a, i) => <AnswerCard key={a.id} answer={a} index={i} />)}
        </div>
      </section>

      <section className="section">
        <div className="section-head">
          <h2>看山发现的缺口</h2>
          <p className="dim" style={{ fontSize: 13.5 }}>这些地方 AI 答不了，必须由真人补上。</p>
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
              已按公开回答匹配到具体的人。请进入补充页，用「最小填空」或「完整编辑」把这一段补完。
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
    </>
  );
}
