"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import HeroTitle from '@/components/ui/HeroTitle';
import { useInviteUrl } from '@/lib/motion/useInviteUrl';
import { AnimatePresence, motion } from "motion/react";

import { Kanshan } from "@/components/kanshan/Kanshan";
import { KanshanStage } from "@/components/kanshan/KanshanStage";
import { FLOW_STATES, flowStateAt } from "@/components/kanshan/states";
import InviteDrawer, { type InviteOutcome } from "@/components/mirror/InviteDrawer";
import PersonaPicker from "@/components/mirror/PersonaPicker";
import FeedStream from "@/components/square/FeedStream";
import { personaCandidates, type PersonaCandidate } from "@/lib/domain/router";
import { useMirror } from "@/lib/store/mirror-store";

/**
 * 首页 = 提问入口 + 广场信息流。
 *
 * v1 主叙事（2026-09-14 重构）：不是「抽象视角」，而是「具体知乎答主的分身」。
 * 提问 → 选答主 → 每位答主按自己的领域/立场/说话方式作答。
 *
 * 2026-09-15 收敛（评委反馈）：
 *   · 首页不再铺开全部结果 —— 答主阵容、回答群组、缺口、Mesh 都与 /mirror 重复，
 *     现在统一由 /mirror（首页的子级页面）承载，生成完成后直接跳过去。
 *   · 空闲态不再是一块说明文字，而是**广场信息流**：主体是已经做完的
 *     镜像讨论组，后面跟知乎热榜，点任意一条就能变成新的镜像问题。
 *
 * 文案约定（req 10）：大字后面不加解释性小字，大字末尾不加句号。
 *   HeroTitle 与各 section 标题统一走 `className="no-tail"`，
 *   配套的 `.no-tail + .lede / .no-tail + .dim { display: none }` 兜住残留小字。
 *
 * 三步状态机（phase）：
 *   ask   —— 输入问题（下方是广场信息流）
 *   pick  —— 选答主（默认勾选推荐 3 位）
 *   run   —— 生成中，完成后跳转到 /mirror#answers
 */

const MIN_QUESTION = 4;
const DEFAULT_PICKS = 3;

type Phase = "ask" | "pick" | "run";

export default function Home() {
  const router = useRouter();
  const { mirror, setMirror, ready, appendInvite } = useMirror();

  const [question, setQuestion] = useState("");
  // 从答主档案页「带他去提问」过来时带 ?persona=handle，用于预选这位答主。
  const [preferred, setPreferred] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>("ask");
  const [selected, setSelected] = useState<string[]>([]);
  const [running, setRunning] = useState(false);
  const [step, setStep] = useState(-1);
  const [error, setError] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useInviteUrl();
  const [inviteNote, setInviteNote] = useState<string | null>(null);

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
        timers.current.push(setTimeout(() => setStep(i), i * 320));
      });
      timers.current.push(
        setTimeout(() => {
          setStep(FLOW_STATES.length);
          onDone();
        }, FLOW_STATES.length * 320),
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

  /**
   * 第二步：确认答主 → 生成 → 跳转到子级页面看结果。
   *
   * 为什么不再原地 scrollIntoView：结果区已经搬到 /mirror，
   * 首页继续堆一份一样的内容就是重复。生成完直接把人送过去。
   */
  const run = useCallback(
    async (handles: string[]) => {
      const q = question.trim();
      if (q.length < MIN_QUESTION) return;

      setError(null);
      setMirror(null);
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
        // 等一次本地落盘，避免跳转太快时新会话还没写进 localStorage。
        await new Promise((r) => setTimeout(r, 260));
        router.push("/mirror#answers");
      } catch {
        clearTimers();
        setError("网络连接失败，请检查后重试。");
        setStep(-1);
        setPhase("pick");
      } finally {
        setRunning(false);
      }
    },
    [clearTimers, playFlow, question, router, setMirror],
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
    [appendInvite, setDrawerOpen],
  );

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
            <p className="eyebrow">HUMAN MESH · 真人专家网络</p>
            <HeroTitle />
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
              if (phase === "pick") setPhase("ask");
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
                <h2 className="no-tail">你想听谁回答这个问题</h2>
              </div>
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
        {phase === "run" && (
          <motion.section
            className="section"
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.4 }}
          >
            <div className="grid grid-2" style={{ alignItems: "start" }}>
              <div className="card" style={{ borderColor: "rgba(77,124,255,0.4)" }}>
                <p className="eyebrow">Human Router · 看山在挑人</p>
                <h3 style={{ marginBottom: 12 }}>
                  正在为「{question.trim()}」召集答主分身
                </h3>
                <div style={{ display: "grid", gap: 8, marginTop: 14 }}>
                  {selected.length > 0 ? (
                    selected.map((h) => <div key={h} className="skeleton" style={{ height: 38 }} />)
                  ) : (
                    <div className="skeleton" style={{ height: 120 }} />
                  )}
                </div>
              </div>

              <KanshanStage step={step} running={running} size={176} />
            </div>
          </motion.section>
        )}
      </AnimatePresence>

      {/* ------------------------------ 广场信息流 ------------------------------ */}
      {phase === "ask" && (
        <section className="section">
          <div className="section-head">
            <div>
              <p className="eyebrow">Virtual square · 虚拟广场</p>
              <h2 className="no-tail">这座虚拟知乎里已经讨论过的事</h2>
            </div>
          </div>
          {ready && <FeedStream hotLimit={20} />}
          {!ready && <div className="skeleton" style={{ height: 260 }} />}
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

      {inviteNote && <div className="notice notice-info" style={{ marginTop: 14 }}>{inviteNote}</div>}

      <footer className="footer">
        <span>影子知乎 · Agent 可调用的人类知识网络</span>
        <span className="dimmer">内容来源与作者信息始终保留</span>
      </footer>
    </div>
  );
}
