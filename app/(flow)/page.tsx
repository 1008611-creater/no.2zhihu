"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import HeroTitle from '@/components/ui/HeroTitle';
import { useInviteUrl } from '@/lib/motion/useInviteUrl';
import { AnimatePresence, motion } from "motion/react";

import { Kanshan } from "@/components/kanshan/Kanshan";
import { KanshanStage } from "@/components/kanshan/KanshanStage";
import { FLOW_STATES, flowStateAt } from "@/components/kanshan/states";
import InviteDrawer, { type InviteOutcome } from "@/components/mirror/InviteDrawer";
import PersonaPicker from "@/components/mirror/PersonaPicker";
import { personaCandidates, type PersonaCandidate } from "@/lib/domain/router";
import { useMirror } from "@/lib/store/mirror-store";
import { DUR, EASE, SHIFT } from "@/lib/motion/tokens";

/**
 * 首页 = 提出问题。
 *
 * v1 主叙事（2026-09-14 重构）：不是「抽象视角」，而是「具体知乎答主的分身」。
 * 提问 → 选答主 → 每位答主按自己的领域/立场/说话方式作答。
 *
 * 2026-09-15 收敛（评委反馈）：
 *   · 首页不再铺开全部结果 —— 答主阵容、回答群组、缺口、Mesh 都与 /mirror 重复，
 *     现在统一由 /mirror（首页的子级页面）承载，生成完成后直接跳过去。
 *
 * 2026-09-15 二次收敛（信息架构）：
 *   · 首页只负责「提出问题」这一件事。原先首页还铺了一整段广场信息流，
 *     与 /square 是同一份内容 —— 同一件事有两个入口，用户反而不知道哪边是"正路"。
 *     现在首页只留一个入口（一行卡片 + 一个链接），内容整体归 /square。
 *   · 支持 `?auto=1&q=…&persona=…`：从「我的」页的一键自动回答进来时，
 *     跳过手动点选，直接开跑。
 *
 * 文案约定（req 10）：大字后面不加解释性小字，大字末尾不加句号。
 *   HeroTitle 与各 section 标题统一走 `className="no-tail"`，
 *   配套的 `.no-tail + .lede / .no-tail + .dim { display: none }` 兜住残留小字。
 *
 * 三步状态机（phase）：
 *   ask   —— 输入问题（下方只有一个广场入口，不铺内容）
 *   pick  —— 选答主（默认勾选推荐 3 位）
 *   run   —— 生成中，完成后跳转到 /mirror#answers
 */

const MIN_QUESTION = 4;
const DEFAULT_PICKS = 3;

type Phase = "ask" | "pick" | "run";

export default function Home() {
  const router = useRouter();
  const { mirror, setMirror, appendInvite } = useMirror();

  const [question, setQuestion] = useState("");
  // ?persona=handle：预选这位答主。现在只有「我的」页的一键自动回答会带它过来。
  const [preferred, setPreferred] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>("ask");
  const [selected, setSelected] = useState<string[]>([]);
  const [running, setRunning] = useState(false);
  const [step, setStep] = useState(-1);
  const [error, setError] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useInviteUrl();
  const [inviteNote, setInviteNote] = useState<string | null>(null);
  /** 「我的」页一键自动回答带过来的答主 handle —— 输入框就绪后自动开跑。 */
  const [pendingAuto, setPendingAuto] = useState<string | null>(null);
  /**
   * 首屏角色位是否让位给流程舞台。
   *
   * 为什么需要这个开关（2026-09-15 审计）：首页原来**同时**渲染两个看山 ——
   * 第 240 行首屏一个、`KanshanStage` 内部再包一个（run 阶段挂载）。
   * 同一视口里出现两个形象，视觉上就是重影。
   * 现在约定「同一时刻一个视口只出现一个看山」，由这个状态互斥。
   *
   * 为什么不用 `phase === "run"` 直接判断：`KanshanStage` 所在的 section 走
   * AnimatePresence，退出时还会在屏幕上停留一小段淡出动画。若按 phase 判断，
   * phase 一回到 "pick" 首屏看山就立刻出现，退出动画期间两个形象会同时可见 ——
   * 正是要避免的中间态。所以这里改成由 `onExitComplete` 在**退出动画结束后**
   * 才把角色位还回来。
   */
  const [hostVacant, setHostVacant] = useState(false);

  const timers = useRef<Array<ReturnType<typeof setTimeout>>>([]);

  const clearTimers = useCallback(() => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  }, []);

  // 从虚拟广场点条目过来时带 ?q=，直接填进输入框，省一步操作。
  // ?persona=handle：记下这位答主，进选人步骤时优先选中。
  // 从「我的」页一键自动回答过来时带 ?auto=1，记下后自动开跑。
  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    const q = sp.get("q");
    if (q) setQuestion(q);
    const p = sp.get("persona");
    if (p) setPreferred(p);
    if (sp.get("auto") === "1" && q && p) setPendingAuto(p);
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
    // 指定了答主就把他排在第一位，保证「一键自动回答」真的用上他。
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
    async (handles: string[], qOverride?: string) => {
      const q = (qOverride ?? question).trim();
      if (q.length < MIN_QUESTION) return;
      // 未选人不得开始（收敛清单原文）。UI 上按钮已禁用，这里再挡一层：
      // 否则任何绕过按钮的调用（旧书签、脚本、后续新增入口）都会静默变成
      // 「服务端自动推荐」——用户以为自己选了人，其实不是。
      if (handles.length === 0) {
        setError("先选至少 1 位答主，再让他们作答。");
        setPhase("pick");
        return;
      }

      setError(null);
      setMirror(null);
      setInviteNote(null);
      setPhase("run");
      // 角色位让给下方的流程舞台 —— 同一时刻只留一个看山（见 hostVacant 注释）。
      setHostVacant(true);
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

  /**
   * 一键自动回答：把 `?auto=1` 接成「选人 → 生成 → 跳工作台」。
   *
   * 「我的」页在没有分身记录时会推荐「一个问题 + 一位答主」，点一下就带
   * auto=1 回到这里。用户在那边已经表过态（就是这个问题、就是这个人），
   * 再让他手动点两次选人/确认纯属多余。
   *
   * 消费掉之后立刻把 auto 从地址栏抹掉：否则生成失败退回 pick 步骤时，
   * 用户刷新页面会被再自动跑一遍。
   */
  useEffect(() => {
    if (!pendingAuto) return;
    const q = question.trim();
    if (q.length < MIN_QUESTION) return;
    const handle = pendingAuto;
    setPendingAuto(null);
    const url = new URL(window.location.href);
    url.searchParams.delete("auto");
    window.history.replaceState(null, "", url.pathname + (url.search || "") + url.hash);
    void run([handle], q);
  }, [pendingAuto, question, run]);

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
            {/*
              首屏角色位：run 阶段让给下方的 KanshanStage。
              空位里只放装饰环与标签 —— 它是**占位**，不是第二个看山形象：
              同一个视口里任何时候只有一个 `.kanshan-img`（验收标准 6）。
              保留 208px 的方框尺寸，避免进入/退出流程时首屏标题发生跳动。
            */}
            {hostVacant ? (
              <div className="hero-char-vacant" aria-hidden>
                <span className="hero-char-vacant-ring" />
              </div>
            ) : (
              <Kanshan state={flowStateAt(step)} size={208} followPointer />
            )}
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
            placeholder="输入一个你真正想问的问题"
            rows={3}
            aria-label="你的问题"
          />
          <div className="composebar">
            {/*
              ⚠️ 这里原来写「支持知乎链接 · …」，但提问路径**从来没有**把链接解析成标题：
              `personaCandidates(question)` 是拿问题文本直接做路由的，链接串只会被当成
              一串无意义的字符。解析能力只存在于搬运（`/api/handoff` 拼编辑器深链）与
              `/api/zhihu/question-answers`（按 url 取回答）两处，都不在首页这条路上。
              收敛清单给的两条路是「真做解析」或「把提示改掉」，本轮明确不做新解析，
              所以提示与这句话一并去掉 —— 界面上说的话必须与实际能力一致。
            */}
            <span className="dim mono">
              结果缓存 30 分钟 · 重复演示不重复消耗额度
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
            initial={{ opacity: 0, y: SHIFT.lg }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: DUR.slow, ease: EASE.out }}
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
                  {selected.length > 0 ? `已选 ${selected.length} 位答主` : "还没选答主"}
                </div>
                <div className="dim" style={{ fontSize: 12.5 }}>
                  {selected.length > 0
                    ? "他们会各自取证据、各自作答；单次最多 4 位，控制额度消耗。"
                    : "至少选 1 位答主才能开始 —— 点上面的卡片选人。"}
                </div>
              </div>
              {/*
                收敛清单原文：「未选人时不能开始作答」。
                改之前这里只挡 `running`，未选人时按钮**可点**，点下去会静默降级成
                「让看山推荐并作答」（`run([])` → 服务端 handles 可选 → 自动推荐）——
                界面上写着「让这些答主作答」，实际却不是用户选的那批人，属于言行不一。
                现在未选人即禁用；默认进选人页时已预勾 3 位，所以「直接确认」的快捷仍在。
              */}
              <button
                className="btn btn-primary"
                onClick={() => run(selected)}
                disabled={running || selected.length === 0}
              >
                {running ? "看山正在召集…" : "让这些答主作答 →"}
              </button>
            </div>
          </motion.section>
        )}
      </AnimatePresence>

      {/* ------------------------------ 主持舞台 ------------------------------ */}
      {/*
        onExitComplete：退出动画播完才把首屏角色位还回去。
        这样「切换过程中两个看山同时可见」的中间态不存在 —— 舞台上那个
        完全淡出之后，首屏的才出现（验收标准 5）。
      */}
      <AnimatePresence onExitComplete={() => setHostVacant(false)}>
        {phase === "run" && (
          <motion.section
            className="section"
            initial={{ opacity: 0, y: SHIFT.lg }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: DUR.slow, ease: EASE.out }}
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

      {/* ------------------------------ 广场入口（只给门，不铺内容） ------------------------------ */}
      {phase === "ask" && (
        <section className="section">
          <div
            className="card-flat"
            style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}
          >
            <div style={{ marginRight: "auto" }}>
              <div style={{ fontWeight: 700, fontSize: 13.5 }}>虚拟广场</div>
              <div className="dim" style={{ fontSize: 12.5 }}>
                别人正在讨论的事，以及你自己提问过的，都在广场里。
              </div>
            </div>
            <Link className="btn" href="/square">
              进入广场 →
            </Link>
          </div>
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
