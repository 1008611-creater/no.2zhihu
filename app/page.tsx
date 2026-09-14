"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";

import { Kanshan } from "@/components/kanshan/Kanshan";
import { KanshanStage } from "@/components/kanshan/KanshanStage";
import { FLOW_STATES, flowStateAt } from "@/components/kanshan/states";
import MeshGraph from "@/components/mesh/MeshGraph";
import AnswerCard from "@/components/mirror/AnswerCard";
import GapCard from "@/components/mirror/GapCard";
import HandoffPanel from "@/components/mirror/HandoffPanel";
import SkillCard from "@/components/mirror/SkillCard";
import { buildMesh } from "@/lib/domain/mesh";
import { useMirror } from "@/lib/store/mirror-store";

/**
 * 首页 = 完整闭环的演示面。
 *
 * 评审只需要在这一页走一遍，就能看到产品全部关键动作：
 *   提一个问题 → 看山召集分身 → 取真实证据 → 生成多视角 → 指出共同缺口
 *   → 交给真人 → 搬运回知乎 → Human Mesh 长出新的边。
 *
 * 实现约定：结果统一落在 MirrorProvider（localStorage 持久化），
 * 所以 /mirror、/square、/mesh、/fill 打开时看到的是同一次会话的同一份数据。
 */

const EXAMPLES = [
  "30 岁从大厂转行做独立开发，值得吗？",
  "孩子近视了，要不要立刻配离焦镜？",
  "小城市开一家咖啡店，真实成本和风险是什么？",
];

const MIN_QUESTION = 4;

export default function Home() {
  const { mirror, setMirror, ready } = useMirror();

  const [question, setQuestion] = useState("");
  const [running, setRunning] = useState(false);
  const [step, setStep] = useState(-1);
  const [error, setError] = useState<string | null>(null);
  const [invited, setInvited] = useState<string | null>(null);

  const resultRef = useRef<HTMLDivElement | null>(null);
  const timers = useRef<Array<ReturnType<typeof setTimeout>>>([]);

  const clearTimers = useCallback(() => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  }, []);

  // 从虚拟广场点热榜条目过来时带 ?q=，直接填进输入框，省一步操作。
  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get("q");
    if (q) setQuestion(q);
  }, []);

  useEffect(() => clearTimers, [clearTimers]);

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

  const run = useCallback(
    async (raw: string) => {
      const q = raw.trim();
      if (q.length < MIN_QUESTION) {
        setError("问题太短了，请再具体一点。");
        return;
      }

      setError(null);
      setMirror(null);
      setInvited(null);
      setRunning(true);
      setStep(-1);

      // 立刻开始播流程条：真实请求在后台并行，避免用户对着静止页面等。
      const flowDone = new Promise<void>((resolve) => playFlow(resolve));

      try {
        const res = await fetch("/api/mirror", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ question: q, evidencePerSkill: 3 }),
        });
        const data = await res.json();

        if (!data.ok) {
          clearTimers();
          setError(data.error ?? "生成失败，请稍后重试。");
          setStep(-1);
          return;
        }

        setMirror(data.mirror);
        await flowDone;
        resultRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      } catch {
        clearTimers();
        setError("网络连接失败，请检查后重试。");
        setStep(-1);
      } finally {
        setRunning(false);
      }
    },
    [clearTimers, playFlow, setMirror],
  );

  const mesh = useMemo(() => (mirror ? buildMesh(mirror) : null), [mirror]);

  const stats = useMemo(() => {
    if (!mirror) return [];
    const sources = mirror.skills.reduce((a, s) => a + s.sources.length, 0);
    const filled = mirror.gaps.filter((g) => g.filledBy).length;
    return [
      { n: mirror.skills.length, l: "个 Skill 分身" },
      { n: sources, l: "条真实知乎来源" },
      { n: mirror.gaps.length, l: "个缺口", s: filled > 0 ? `已补 ${filled}` : undefined },
      { n: mirror.answers.filter((a) => a.generatedBy === "zhida").length, l: "篇直答生成" },
    ];
  }, [mirror]);

  return (
    <div className="home">
      {/* ------------------------------ 首屏 ------------------------------ */}
      <section className="hero">
        <div className="hero-grid">
          <div>
            <p className="eyebrow">HUMAN MESH · 0 级入口</p>
            <h1>
              让每个问题
              <br />
              <em>先在另一个知乎里发生。</em>
            </h1>
            <p className="lede">
              看山会召集一群由知乎真实回答蒸馏出的分身来回答你的问题，然后指出他们
              <strong>共同没有回答的那一块</strong>，再把那一块交给真实的人。
            </p>
          </div>
          <div className="hero-char">
            <Kanshan
              state={flowStateAt(step)}
              size={208}
              followPointer
            />
            <div className="hero-char-label mono">KANSHAN · HOST</div>
          </div>
        </div>

        <div className="composer">
          <textarea
            className="field"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === "Enter") run(question);
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
              onClick={() => run(question)}
              disabled={running || question.trim().length < MIN_QUESTION}
            >
              {running ? "看山正在召集…" : "召集分身 →"}
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

      {/* ------------------------------ 主持舞台 ------------------------------ */}
      <AnimatePresence>
        {(running || mirror) && (
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
      {mirror && (
        <div ref={resultRef}>
          <section className="section">
            <div className="section-head">
              <div>
                <p className="eyebrow">Skill 分身阵容</p>
                <h2>每个分身是一个视角，不是换一种语气</h2>
              </div>
              <p className="dim" style={{ fontSize: 13.5, maxWidth: 380 }}>
                视角、文风与关键词都来自知乎真实公开回答的蒸馏，卡片上的来源可以逐条点开核对。
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
                <p className="eyebrow">多视角回答群组</p>
                <h2>正文只允许引用上面的真实来源</h2>
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
          </section>

          <section className="section" id="gaps">
            <div className="section-head">
              <div>
                <p className="eyebrow">★ 这一步只有把多个视角放在一起才能做到</p>
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
      {!mirror && !running && (
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
            <p className="lede" style={{ maxWidth: 380 }}>
              查看分身参与过的问题、证据和文风。当虚拟回答遇到真实世界的判断，邀请你接管。
            </p>
          </div>
          <div className="meshmap">
            <div className="orbit o1" />
            <div className="orbit o2" />
            <div className="node center">你</div>
            <div className="node n1">Skill</div>
            <div className="node n2">问题</div>
            <div className="node n3">证据</div>
            <div className="node n4">缺口</div>
          </div>
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

      <footer className="footer">
        <span>二号知乎 · 知乎黑客松 2026</span>
        <span className="dimmer">内容来源与作者信息始终保留</span>
      </footer>
    </div>
  );
}
