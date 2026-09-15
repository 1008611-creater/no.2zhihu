"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import HeroTitle from '@/components/ui/HeroTitle';
import { useInviteUrl } from '@/lib/motion/useInviteUrl';
import { AnimatePresence, motion } from "motion/react";

import { Kanshan } from "@/components/kanshan/Kanshan";
import { KanshanStage } from "@/components/kanshan/KanshanStage";
import { FLOW_STATES, flowStateAt } from "@/components/kanshan/states";
import MeshGraph from "@/components/mesh/MeshGraph";
import AnswerCard from "@/components/mirror/AnswerCard";
import DebatePanel from "@/components/mirror/DebatePanel";
import GapCard from "@/components/mirror/GapCard";
import HandoffPanel from "@/components/mirror/HandoffPanel";
import InviteDrawer, { type InviteOutcome } from "@/components/mirror/InviteDrawer";
import PersonaPicker from "@/components/mirror/PersonaPicker";
import SkillCard from "@/components/mirror/SkillCard";
import { buildMesh } from "@/lib/domain/mesh";
import { personaCandidates, type PersonaCandidate } from "@/lib/domain/router";
import { useMirror } from "@/lib/store/mirror-store";

/**
 * 首页 = 完整闭环的演示面。
 *
 * v1 主叙事（2026-09-14 重构）：不是「抽象视角」，而是「具体知乎答主的分身」。
 * 提问 → 选答主 → 每位答主按自己的领域/立场/说话方式作答 → 看缺口 →
 * 继续邀请新答主 → 真人补充 → 搬运回知乎。
 *
 * 四步状态机（phase）：
 *   ask   —— 输入问题
 *   pick  —— 选答主（默认勾选推荐 3 位，也可以一个都不选让看山推荐）
 *   run   —— 生成中
 *   done  —— 结果（mirror 已落库）
 */

const EXAMPLES = [
  "30 岁从大厂转行做独立开发，值得吗？",
  "孩子近视了，要不要立刻配离焦镜？",
  "小城市开一家咖啡店，真实成本和风险是什么？",
];

const MIN_QUESTION = 4;
const DEFAULT_PICKS = 3;

type Phase = "ask" | "pick" | "run" | "done";

export default function Home() {
  const { mirror, setMirror, ready, appendInvite, appendReplies } = useMirror();

  const [question, setQuestion] = useState("");
  // 从答主档案页「带他去提问」过来时带 ?persona=handle，用于预选这位答主。
  const [preferred, setPreferred] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>("ask");
  const [selected, setSelected] = useState<string[]>([]);
  const [running, setRunning] = useState(false);
  const [step, setStep] = useState(-1);
  const [error, setError] = useState<string | null>(null);
  const [invited, setInvited] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useInviteUrl();
  const [inviteNote, setInviteNote] = useState<string | null>(null);

  const resultRef = useRef<HTMLDivElement | null>(null);
  const timers = useRef<Array<ReturnType<typeof setTimeout>>>([]);

  const clearTimers = useCallback(() => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  }, []);

  // 从虚拟广场点热榜条目过来时带 ?q=，直接填进输入框，省一步操作。
  // 从答主档案页过来时带 ?persona=handle，记下这位答主，进选人步骤时优先选中。
  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    const q = sp.get("q");
    if (q) setQuestion(q);
    const p = sp.get("persona");
    if (p) setPreferred(p);
  }, []);

  useEffect(() => clearTimers, [clearTimers]);

  /** 问题 → 候选答主。纯函数，零额度，随输入即时更新。 */
  const candidates: PersonaCandidate[] = useMemo(
    () => (question.trim().length >= MIN_QUESTION ? personaCandidates(question) : []),
    [question],
  );

  /** 把流程条按节奏推进一步，让评委看清看山每一步在做什么。 */
  const playFlow = useCallback(
    (onDone: () => void) => {
      clearTimers();
      setStep(-1);
      FLOW_STATES.forEach((_, i) => {
        timers.current.push(setTimeout(() => setStep(i), i * 380));
      });
      timers.current.push(
        setTimeout(() => {
          setStep(FLOW_STATES.length);
          onDone();
        }, FLOW_STATES.length * 380),
      );
    },
    [clearTimers],
  );

  /** 第一步：输入问题 → 进入选答主。 */
  const goPick = useCallback(() => {
    const q = question.trim();
    if (q.length < MIN_QUESTION) {
      setError("问题太短了，请再具体一点。");
      return;
    }
    setError(null);
    // 默认勾选推荐的前 3 位 —— 用户想直接开始就点确认，想换人就点卡片。
    const ranked = personaCandidates(q).map((c) => c.handle);
    // 从档案页带过来的答主排在第一位，保证「带他去提问」真的带上他。
    const withPreferred =
      preferred && ranked.includes(preferred)
        ? [preferred, ...ranked.filter((h) => h !== preferred)]
        : ranked;
    setSelected(withPreferred.slice(0, Math.max(DEFAULT_PICKS, preferred ? 1 : 0)));
    setPhase("pick");
  }, [question, preferred]);

  const toggle = useCallback((handle: string) => {
    setSelected((cur) =>
      cur.includes(handle) ? cur.filter((h) => h !== handle) : [...cur, handle],
    );
  }, []);

  /** 第二步：确认答主 → 真正调用生成。 */
  const run = useCallback(
    async (handles: string[]) => {
      const q = question.trim();
      if (q.length < MIN_QUESTION) return;

      setError(null);
      setMirror(null);
      setInvited(null);
      setInviteNote(null);
      setPhase("run");
      setRunning(true);
      setStep(-1);

      const flowDone = new Promise<void>((resolve) => playFlow(resolve));

      try {
        const res = await fetch("/api/mirror", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ question: q, handles, evidencePerSkill: 3 }),
        });
        const data = await res.json();

        if (!data.ok) {
          clearTimers();
          setError(data.error ?? "生成失败，请稍后重试。");
          setStep(-1);
          setPhase("pick");
          return;
        }

        setMirror(data.mirror);
        await flowDone;
        setPhase("done");
        resultRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      } catch {
        clearTimers();
        setError("网络连接失败，请检查后重试。");
        setStep(-1);
        setPhase("pick");
      } finally {
        setRunning(false);
      }
    },
    [clearTimers, playFlow, question, setMirror],
  );

  /** 继续邀请的回调：把新答主与回答追加进当前镜像问题，不重跑旧的。 */
  const handleInvited = useCallback(
    (outcome: InviteOutcome) => {
      appendInvite(outcome.skill, outcome.answer);
      setDrawerOpen(false);
      if (outcome.mode === "distilled" && outcome.note) {
        setInviteNote(outcome.note);
      }
    },
    [appendInvite],
  );

  const mesh = useMemo(() => (mirror ? buildMesh(mirror) : null), [mirror]);

  const stats = useMemo(() => {
    if (!mirror) return [];
    const sources = mirror.skills.reduce((a, s) => a + s.sources.length, 0);
    const filled = mirror.gaps.filter((g) => g.filledBy).length;
    return [
      { n: mirror.skills.length, l: "位答主分身" },
      { n: sources, l: "条真实知乎来源" },
      { n: mirror.gaps.length, l: "个缺口", s: filled > 0 ? `已补 ${filled}` : undefined },
      { n: mirror.answers.filter((a) => a.generatedBy === "zhida").length, l: "篇直答生成" },
    ];
  }, [mirror]);

  const presentHandles = useMemo(
    () => (mirror ? mirror.skills.map((s) => s.persona?.handle).filter((h): h is string => !!h) : []),
    [mirror],
  );

  return (
    <div className="home">
      {/* ------------------------------ 首屏 ------------------------------ */}
      <section className="hero">
        <div className="hero-grid">
          <div>
            <p className="eyebrow">HUMAN MESH · 0 级入口</p>
            <HeroTitle />
            <p className="lede">
              输入问题，指定你想听谁回答 —— 哪怕他从没答过这个问题。看山会按这位答主的
              领域、立场和说话方式生成一份分身回答，再指出
              <strong>这几位都没答上的那一块</strong>，交给真实的人。
            </p>
          </div>
          <div className="hero-char">
            <Kanshan state={flowStateAt(step)} size={208} followPointer />
            <div className="hero-char-label mono">KANSHAN · HOST</div>
          </div>
        </div>

        <div className="composer">
          <textarea
            className="field"
            value={question}
            onChange={(e) => {
              setQuestion(e.target.value);
              if (phase === "pick" || phase === "done") setPhase("ask");
            }}
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === "Enter") goPick();
            }}
            placeholder="输入一个你真正想问的问题，或粘贴知乎问题链接…"
            rows={3}
            aria-label="你的问题"
          />
          <div className="composebar">
            <span className="dim mono">
              支持知乎链接 · 结果缓存 30 分钟 · 重复演示不重复消耗额度
            </span>
            <button
              className="btn btn-primary"
              onClick={goPick}
              disabled={running || question.trim().length < MIN_QUESTION}
            >
              {phase === "pick" ? "重新选择答主 →" : "选择答主 →"}
            </button>
          </div>
          <div className="examples">
            {EXAMPLES.map((ex) => (
              <button key={ex} className="chip" onClick={() => setQuestion(ex)}>
                {ex}
              </button>
            ))}
          </div>
        </div>

        {error && (
          <div className="notice notice-warn" style={{ marginTop: 16 }}>
            {error}
          </div>
        )}
      </section>

      {/* ------------------------------ 选择答主 ------------------------------ */}
      <AnimatePresence>
        {phase === "pick" && (
          <motion.section
            className="section"
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.35 }}
          >
            <div className="section-head">
              <div>
                <p className="eyebrow">Step 1 · 选答主</p>
                <h2>你想听谁回答这个问题？</h2>
              </div>
              <p className="dim" style={{ fontSize: 13.5, maxWidth: 400 }}>
                选一位、几位，或者一位都不选。每位答主都有自己的领域、立场和说话方式 ——
                换一个人，回答就该是另一个人的样子。
              </p>
            </div>

            <PersonaPicker candidates={candidates} selected={selected} onToggle={toggle} />

            <div
              className="card-flat"
              style={{ marginTop: 18, display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}
            >
              <div style={{ marginRight: "auto" }}>
                <div style={{ fontWeight: 700, fontSize: 13.5 }}>
                  {selected.length > 0 ? `已选 ${selected.length} 位答主` : "未指定答主"}
                </div>
                <div className="dim" style={{ fontSize: 12.5 }}>
                  {selected.length > 0
                    ? "他们会各自取证据、各自作答；单次最多 4 位，控制额度消耗。"
                    : "看山会按问题类型自动推荐 3 位答主。"}
                </div>
              </div>
              <button
                className="btn btn-primary"
                onClick={() => run(selected)}
                disabled={running}
              >
                {running ? "看山正在召集…" : selected.length > 0 ? "让这些答主作答 →" : "让看山推荐并作答 →"}
              </button>
            </div>
          </motion.section>
        )}
      </AnimatePresence>

      {/* ------------------------------ 主持舞台 ------------------------------ */}
      <AnimatePresence>
        {(phase === "run" || (phase === "done" && mirror)) && (
          <motion.section
            className="section"
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.4 }}
          >
            <div className="grid grid-2" style={{ alignItems: "start" }}>
              <div className="card">
                <p className="eyebrow">Human Router · 看山在挑人</p>
                {mirror ? (
                  <>
                    <h3 style={{ marginBottom: 12 }}>{mirror.routing.summary}</h3>
                    <div style={{ display: "grid", gap: 8 }}>
                      {mirror.routing.picks.map((p) => {
                        const skill = mirror.skills.find((s) => s.id === p.skillId);
                        return (
                          <div key={p.skillId} className="card-flat">
                            <div className="row-between">
                              <strong style={{ fontSize: 13.5 }}>{skill?.name ?? p.skillId}</strong>
                              <span className={`chip chip-${skill?.accent ?? "blue"}`}>{p.score}</span>
                            </div>
                            <div className="dim" style={{ fontSize: 12.5, marginTop: 5 }}>
                              {p.reason}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    <hr className="divider" />
                    <div className="mono dimmer">
                      检索词：{mirror.routing.queries.join(" ｜ ")}
                    </div>
                  </>
                ) : (
                  <div className="skeleton" style={{ height: 180 }} />
                )}
              </div>

              <KanshanStage step={step} running={running} size={176} />
            </div>

            {mirror && (
              <div className="grid grid-4" style={{ marginTop: 18 }}>
                {stats.map((s) => (
                  <div key={s.l} className="stat">
                    <div className="stat-n">{s.n}</div>
                    <div className="stat-l">
                      {s.l}
                      {s.s ? ` · ${s.s}` : ""}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </motion.section>
        )}
      </AnimatePresence>

      {/* ------------------------------ 结果 ------------------------------ */}
      {phase === "done" && mirror && (
        <div ref={resultRef}>
          <section className="section">
            <div className="section-head">
              <div>
                <p className="eyebrow">答主阵容</p>
                <h2>每位都是一个具体的人，不是换一种语气</h2>
              </div>
              <p className="dim" style={{ fontSize: 13.5, maxWidth: 400 }}>
                领域、立场、说话方式和「不装懂边界」都来自这位答主的公开表达。
                正文只允许引用他对应的真实来源。
              </p>
            </div>
            <div className="grid grid-3">
              {mirror.skills.map((s, i) => (
                <SkillCard key={s.id} skill={s} index={i} />
              ))}
            </div>
          </section>

          <section className="section">
            <div className="section-head">
              <div>
                <p className="eyebrow">分身回答群组</p>
                <h2>遮住名字，也应该看得出不是同一个人写的</h2>
              </div>
              <Link className="link mono" href="/mirror">
                打开完整工作台 →
              </Link>
            </div>
            <div className="grid grid-3">
              {mirror.answers.map((a, i) => (
                <AnswerCard key={a.id} answer={a} index={i} />
              ))}
            </div>

            <div style={{ marginTop: 18, display: "grid", gap: 12 }}>
              <DebatePanel
                question={mirror.title}
                answers={mirror.answers}
                onReplies={(replies) => {
                  appendReplies(replies);
                }}
              />
              {inviteNote && <div className="notice notice-info">{inviteNote}</div>}
              <button className="btn btn-primary" onClick={() => setDrawerOpen(true)}>
                + 邀请一个分身回答
              </button>
            </div>
          </section>

          <section className="section" id="gaps">
            <div className="section-head">
              <div>
                <p className="eyebrow">★ 这一步只有把多个分身放在一起才能做到</p>
                <h2>
                  {mirror.gaps.length > 0
                    ? `他们共同没回答的 ${mirror.gaps.length} 块`
                    : "这组回答没有发现明显缺口"}
                </h2>
              </div>
            </div>

            {mirror.gaps.length === 0 ? (
              <div className="notice notice-info">
                如实报告：本次检索到的回答覆盖了主要视角，没有识别出结构性缺口。
              </div>
            ) : (
              <div style={{ display: "grid", gap: 12 }}>
                {mirror.gaps.map((g, i) => (
                  <GapCard
                    key={g.id}
                    gap={g}
                    index={i}
                    onInvite={(gap) => setInvited(gap.candidates[0]?.id ?? null)}
                  />
                ))}
              </div>
            )}
          </section>

          <AnimatePresence>
            {invited && (
              <motion.section
                className="section"
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
              >
                <div className="card" style={{ borderColor: "rgba(77,124,255,0.4)" }}>
                  <p className="eyebrow">Human invite</p>
                  <h2>已按公开回答匹配到具体的人</h2>
                  <p className="lede" style={{ marginTop: 12 }}>
                    这个缺口 AI 补不了。去补充页用「最小填空」或「完整编辑」把它补完，
                    看山会把这一段接到 Human Mesh 上。
                  </p>
                  <div style={{ marginTop: 16, display: "flex", gap: 10, flexWrap: "wrap" }}>
                    <Link className="btn btn-primary" href="/fill">
                      进入真人补充页
                    </Link>
                    <button className="btn btn-ghost" onClick={() => setInvited(null)}>
                      稍后再说
                    </button>
                  </div>
                </div>
              </motion.section>
            )}
          </AnimatePresence>

          <section className="section">
            <HandoffPanel />
          </section>

          {mesh && (
            <section className="section">
              <div className="section-head">
                <div>
                  <p className="eyebrow">Human Mesh</p>
                  <h2>每一次回答，都会留下一条可接管的关系</h2>
                </div>
                <Link className="link mono" href="/mesh">
                  查看完整关系图 →
                </Link>
              </div>
              <MeshGraph graph={mesh} height={380} />
            </section>
          )}
        </div>
      )}

      {/* ------------------------------ 未开始时的说明 ------------------------------ */}
      {phase === "ask" && !mirror && !running && (
        <section className="section">
          <div className="section-head">
            <div>
              <p className="eyebrow">HUMAN MESH / 你的知识网络</p>
              <h2>
                每一次回答，都会留下
                <br />
                一条可接管的关系。
              </h2>
            </div>
            <p className="lede" style={{ maxWidth: 400 }}>
              查看答主分身参与过的问题、证据和文风。当虚拟回答遇到真实世界的判断，邀请你接管。
            </p>
          </div>
          <div className="notice">提出第一个问题后，这里会生成真实的知识关系图。当前尚无关系数据。</div>
          {ready && (
            <div style={{ marginTop: 18, display: "flex", gap: 10, flexWrap: "wrap" }}>
              <Link className="btn btn-ghost" href="/square">
                看知乎此刻在热什么
              </Link>
              <Link className="btn btn-ghost" href="/about">
                这份作品的技术说明
              </Link>
            </div>
          )}
        </section>
      )}

      <InviteDrawer
        open={drawerOpen}
        question={mirror?.title ?? question}
        candidates={mirror ? personaCandidates(mirror.title) : candidates}
        presentHandles={presentHandles}
        onClose={() => setDrawerOpen(false)}
        onInvited={handleInvited}
      />

      <footer className="footer">
        <span>二号知乎 · 知乎黑客松 2026</span>
        <span className="dimmer">内容来源与作者信息始终保留</span>
      </footer>
    </div>
  );
}
