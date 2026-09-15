"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import SquareCanvas from "@/components/square/SquareCanvas";
import SquareStrip from "@/components/square/SquareStrip";
import { useMirror } from "@/lib/store/mirror-store";
import { PERSONA_BY_HANDLE } from "@/lib/domain/personas";
import { skillFromPersona } from "@/lib/domain/skills";
import {
  SCOPE_LABELS,
  filterByScope,
  layoutSquare,
  myLocationNode,
  type SquareLayout,
  type SquareScope,
  type TopicInput,
  type TopicNode,
} from "@/lib/domain/square-layout";
import type {
  Accent,
  AnswerDraft,
  Gap,
  MirrorQuestion,
  Skill,
  SkillKind,
} from "@/lib/domain/types";

/**
 * 虚拟广场 · 数据接入层。
 *
 * 职责分工（保持边界清晰）：
 *   · SquareCanvas      —— 只管画布交互（拖拽/缩放/聚焦/悬浮）
 *   · square-layout.ts  —— 只管空间布局（纯函数，确定性）
 *   · SquareField       —— 只管把真实数据喂给上面两者（本文件）
 *
 * 数据来源（与旧的 FeedStream 一致，不新增任何上游调用）：
 *   · `/square-library.json` —— 已完成的 22 个讨论组，由 scripts/build-library.mjs 生成
 *   · 本地会话 history      —— 用户自己刚生成的讨论（「我这场」）
 *   · `/api/zhihu/hot`      —— 热榜，作为「还能新开什么题」的入口
 *
 * 额度纪律（AGENTS.md §1.5）：热榜 100/天。旧版默认取 20 条，
 * 新版广场的可见话题数受画布面积限制，取 12 条足够铺满 —— 但热榜是
 * 缓存接口（lib/zhihu/cache），条数变化不额外消耗额度。这里仍降到 12，
 * 避免画布被低价值条目占满。
 */

interface LibrarySkill {
  id: string;
  name: string;
  kind?: SkillKind;
  lens?: string;
  accent?: Accent;
  persona?: { handle: string; displayName: string };
}

interface LibraryAnswer {
  id: string;
  skillId: string;
  skillName: string;
  accent?: Accent;
  handle?: string;
  body: string;
  generatedBy?: AnswerDraft["generatedBy"];
  status?: AnswerDraft["status"];
  createdAt?: number;
  round?: number;
  replyToName?: string;
  evidenceCount?: number;
  evidenceTitles?: string[];
}

interface LibraryGap {
  id: string;
  kind?: Gap["kind"];
  label?: string;
  reason?: string;
  needProfile?: string;
  severity?: number;
  /** 被真人补上时记录补的人；库里目前没有，视为未补。 */
  filledBy?: string;
}

interface LibraryEntry {
  id: string;
  title: string;
  createdAt: number;
  routing: { intent: string; summary: string };
  skills: LibrarySkill[];
  answers: LibraryAnswer[];
  gaps: LibraryGap[];
}

const ACCENTS = ["blue", "violet", "green", "orange"] as const;

/** 与 FeedStream 的 hydrate 同源：把精简条目还原成完整 MirrorQuestion。 */
function hydrate(entry: LibraryEntry): MirrorQuestion {
  const skills: Skill[] = entry.skills.map((s, i) => {
    const persona = s.persona ? PERSONA_BY_HANDLE.get(s.persona.handle) : undefined;
    if (persona) {
      const full = skillFromPersona(persona);
      return s.accent ? { ...full, accent: s.accent } : full;
    }
    return {
      id: s.id,
      name: s.name,
      kind: s.kind ?? "analysis",
      lens: s.lens ?? "",
      query: entry.title,
      keywords: [],
      tone: [],
      accent: s.accent ?? ACCENTS[i % ACCENTS.length],
      sources: [],
      confidence: 0,
      supplementary: true,
    } satisfies Skill;
  });

  const answers = entry.answers.map((a, i) => ({
    id: a.id,
    skillId: a.skillId,
    skillName: a.skillName,
    accent: a.accent ?? ACCENTS[i % ACCENTS.length],
    handle: a.handle,
    body: a.body,
    // 只还原真正已知的字段：标题。author/url/voteUp 一律不知道 ——
    // 绝不能拿 skillName 冒充来源作者（AGENTS.md §1.3 保留来源）。
    evidence: (a.evidenceTitles ?? []).map((title) => ({
      title,
      author: "",
      url: "",
      excerpt: "",
      voteUp: 0,
      editTime: 0,
      confidence: 0,
    })),
    createdAt: a.createdAt ?? entry.createdAt,
    status: a.status ?? "ai",
    generatedBy: a.generatedBy ?? "retrieval",
    round: a.round,
    replyToName: a.replyToName,
  })) as AnswerDraft[];

  const gaps = entry.gaps.map((g) => ({
    id: g.id,
    kind: g.kind ?? "experience",
    label: g.label ?? "",
    reason: g.reason ?? "",
    needProfile: g.needProfile ?? "",
    candidates: [],
    severity: g.severity ?? 0,
  })) as Gap[];

  return {
    id: entry.id,
    title: entry.title,
    origin: "hot",
    createdAt: entry.createdAt,
    routing: {
      mode: "auto",
      intent: entry.routing?.intent ?? "experience",
      picks: entry.skills.map((s) => ({ skillId: s.id, reason: "", score: 0 })),
      summary: entry.routing?.summary ?? "",
      queries: [],
    },
    skills,
    answers,
    gaps,
    handoff: { status: "not-ready", note: "" },
    contributions: [],
  };
}

export default function SquareField() {
  const { history, setMirror } = useMirror();
  const [library, setLibrary] = useState<LibraryEntry[] | null>(null);
  const [focusedId, setFocusedId] = useState<string | null>(null);
  /**
   * 窄屏时换成横向滑动的话题街区（规格要求）。
   *
   * 为什么在 JS 层分叉而不是纯 CSS：390×780 的手机上，22 张卡铺开的广场
   * 即使「全景」也只有 18%，卡片 30px、标题糊成灰点，而且 390px 宽里
   * 做精确拖拽 + 缩放根本不现实。硬留画布等于让手机上的人看一堆方块。
   *
   * 断点 640 与 frontend-v2.css 的窄屏断点一致；用 matchMedia 而不是监听
   * resize，是因为旋转屏幕 / 分屏拖拽都会触发它，而 resize 不一定。
   */
  const narrow = useIsNarrow(640);

  /**
   * 当前筛选（全部 / 正在发生 / 等真人回答 / 我的讨论）。
   *
   * 为什么状态在这里而不是页面里：切换筛选不能触发路由跳转 ——
   * 画布的视口位置、聚焦节点、悬停态都在客户端，一次 push 会把它们重置，
   * 用户刚拖到的位置就丢了。所以筛选只改这里的状态，URL 仅作为**进入时**的初值。
   *
   * 为什么初值给 "all" 而不是同步读 window.location：服务端没有 window，
   * 同步读会让首屏 HTML 与客户端不一致（hydration 报错）。
   * 挂载后立刻校正，此时页面通常还在骨架屏，用户看不到跳变。
   */
  const [scope, setScope] = useState<SquareScope>("all");

  // 支持 /square?filter=mine 深链（其它页面会用到）。
  useEffect(() => {
    const f = new URLSearchParams(window.location.search).get("filter");
    if (f === "mine" || f === "live" || f === "waiting") setScope(f as SquareScope);
  }, []);

  useEffect(() => {
    let alive = true;
    fetch("/square-library.json")
      .then((r) => r.json())
      .then((d) => alive && setLibrary(Array.isArray(d?.entries) ? d.entries : []))
      .catch(() => alive && setLibrary([]));
    return () => {
      alive = false;
    };
  }, []);

  /**
   * 让广场页吃掉探索区的固定 chrome（面包屑 + explore 间距）。
   *
   * .sq-page 的作用见 frontend-v2.css：不加它的话，画布会被头顶那行
   * 「首页 / 探索 Human Mesh」顶下去约 64px，而 body 已锁滚动 ——
   * 底部那 64px 就永远看不见了（实测踩过）。
   * 这一条与窄屏无关，两种形态都需要。
   */
  useEffect(() => {
    document.body.classList.add("sq-page");
    return () => document.body.classList.remove("sq-page");
  }, []);

  /**
   * 禁止页面上下滚动（规格硬要求：「不进行传统的上下滚动」）。
   *
   * 只在**画布形态**下锁（见下面 narrow 的判断）：
   * 横向街区形态必须保留纵向滚动 —— 详情展开后内容会超出视口，
   * 锁了 body 就再也看不到底部那两个按钮了。
   * 这是「降级」形态与原形态的真实差异，不能一刀切。
   *
   * 为什么要给 body 加 class 而不是只靠画布的 touch-action：
   * 画布之外的页面仍然有滚动条（导航栏、布局容器），滚轮在画布上虽然被
   * preventDefault 了，但一旦指针滑出画布，页面又开始滚 —— 用户就会觉得
   * 「说是无限画布，结果还是会滚」。所以挂载期间锁住 body，
   * 卸载时**必须**还原，否则离开这个页面后全站都滚不动了。
   */
  useEffect(() => {
    if (narrow) return;
    document.body.classList.add("sq-locked");
    return () => document.body.classList.remove("sq-locked");
  }, [narrow]);

  /**
   * 把顶栏的**真实**高度写进 --sq-chrome。
   *
   * 为什么不能只靠 CSS 里的 73px：那是 1440 宽、默认字号下的实测值。
   * 窄屏时 TopBar 收成抽屉、用户调大浏览器默认字号、或系统字号放大，
   * 都会让它变高 —— 写死的值会让画布底部被顶栏切掉一块，
   * 而 body 已锁滚动，被切掉的部分就永远看不到了。
   *
   * 用 ResizeObserver 而不是 window.resize：顶栏高度变化未必来自窗口尺寸
   * （字体设置、账户区从「登录」变成「@昵称」都会改变高度），
   * 监听元素本身才是对的。这也是它在移动端表现正确的原因。
   */
  useEffect(() => {
    const root = document.querySelector<HTMLElement>(".sq-root");
    const bar = document.querySelector<HTMLElement>(".topbar");
    if (!root || !bar) return;
    const sync = () => {
      const h = Math.round(bar.getBoundingClientRect().height);
      if (h > 0) root.style.setProperty("--sq-chrome", h + "px");
    };
    sync();
    const ro = new ResizeObserver(sync);
    ro.observe(bar);
    return () => ro.disconnect();
  }, []);

  /** 把库条目与本地会话统一成布局输入，再按当前筛选收窄。 */
  const { topics, totalCount } = useMemo(() => {
    const libraryIds = new Set((library ?? []).map((e) => e.id));

    const fromLibrary: TopicInput[] = (library ?? []).map((e) => ({
      id: e.id,
      title: e.title,
      answerCount: e.answers?.length ?? 0,
      hasReplies: (e.answers ?? []).some((a) => (a.round ?? 0) > 0),
      mine: false,
      // 缺口是否还没被真人补上。库快照里没有 filledBy 字段，
      // 缺它就当「未补」—— 保守方向是「等真人」，不会把该等的判成已完成。
      hasOpenGaps: (e.gaps ?? []).some((g) => !g.filledBy),
    }));

    const fromMine: TopicInput[] = history
      .filter((m) => !libraryIds.has(m.id))
      .map((m) => ({
        id: m.id,
        title: m.title,
        answerCount: m.answers.length,
        hasReplies: m.answers.some((a) => (a.round ?? 0) > 0),
        mine: true,
        hasOpenGaps: m.gaps.some((g) => !g.filledBy),
      }));

    // 我的讨论排前面：布局按热度取中央，而 mine 有热度加成 ——
    // 于是「我刚问的那场」大概率就在广场中央，符合「回到我的位置」的预期。
    const all = [...fromMine, ...fromLibrary];

    // 筛选放在**布局之前**：布局要为「这一屏实际有几场」重新分配空间，
    // 而不是先按 22 场排好再隐藏掉一半 —— 那样筛完会留下大片空洞。
    return { topics: filterByScope(all, scope), totalCount: all.length };
  }, [library, history, scope]);

  // 筛选变化后，原先聚焦的那场可能已经不在集合里了 —— 必须清掉，
  // 否则画布会「聚焦到一个不存在的节点」，镜头停在空白处。
  useEffect(() => {
    setFocusedId((cur) => (cur && topics.some((t) => t.id === cur) ? cur : null));
  }, [topics]);

  /** handle → 显示名，供卡片头像显示。 */
  const avatarLookup = useCallback((handle: string) => {
    return PERSONA_BY_HANDLE.get(handle)?.displayName;
  }, []);

  /**
   * 每场讨论的参与答主 handle 列表（取前 3 个做头像）。
   *
   * 为什么先查库、再查会话：同一个 id 可能同时在两边（库是构建时快照，
   * 会话是用户本地生成的）。以会话为准 —— 它包含最新的邀请结果。
   */
  const avatarSource = useCallback(
    (id: string): string[] => {
      const local = history.find((m) => m.id === id);
      if (local) {
        return local.skills.map((s) => s.persona?.handle).filter((h): h is string => !!h).slice(0, 3);
      }
      const lib = (library ?? []).find((e) => e.id === id);
      if (lib) {
        return (lib.skills ?? [])
          .map((s) => s.persona?.handle)
          .filter((h): h is string => !!h)
          .slice(0, 3);
      }
      return [];
    },
    [history, library],
  );

  /** 一句回答预览：取该场第一条非空回答的前 60 字。 */
  const previewOf = useCallback(
    (id: string): string | undefined => {
      const local = history.find((m) => m.id === id);
      const body =
        local?.answers.find((a) => a.body?.trim())?.body ??
        (library ?? []).find((e) => e.id === id)?.answers.find((a) => a.body?.trim())?.body;
      if (!body) return undefined;
      const clean = body.replace(/\s+/g, " ").trim();
      return clean.length > 64 ? clean.slice(0, 64) + "…" : clean;
    },
    [history, library],
  );

  const layout: SquareLayout = useMemo(() => {
    const base = layoutSquare(topics, avatarLookup, avatarSource);
    // 预览是展示层信息，布局层不关心它 —— 在这里补上，保持布局纯函数的职责单一。
    return {
      ...base,
      nodes: base.nodes.map((n) => ({ ...n, preview: previewOf(n.id) })),
    };
  }, [topics, avatarLookup, avatarSource, previewOf]);

  const focused = useMemo(
    () => (focusedId ? layout.nodes.find((n) => n.id === focusedId) ?? null : null),
    [focusedId, layout.nodes],
  );

  /** 打开某场讨论：载入会话并跳到结果视图（复用 /mirror 的双意图机制）。 */
  const openTopic = useCallback(
    (node: TopicNode) => {
      const local = history.find((m) => m.id === node.id);
      if (local) {
        setMirror(local);
        window.location.href = "/mirror?view=result#answers";
        return;
      }
      const lib = (library ?? []).find((e) => e.id === node.id);
      if (lib) {
        setMirror(hydrate(lib));
        window.location.href = "/mirror?view=result#answers";
      }
    },
    [history, library, setMirror],
  );

  /** 发现一场讨论：在未聚焦的话题里随机挑一个（排除当前聚焦的）。 */
  const randomTopic = useCallback(() => {
    const pool = layout.nodes.filter((n) => n.id !== focusedId);
    if (pool.length === 0) return;
    // 这里用 Math.random 是故意的：这是**用户主动触发的探索行为**，
    // 不是布局 —— 布局必须确定性（评委要能复现同一个广场），
    // 而「随机逛逛」每次给不同结果才是它的价值。
    const pick = pool[Math.floor(Math.random() * pool.length)];
    setFocusedId(pick.id);
  }, [layout.nodes, focusedId]);

  /** 键盘：Esc 关闭详情，方向键在话题间移动。 */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && focusedId) {
        setFocusedId(null);
        return;
      }
      if (!focusedId) return;
      if (e.key !== "ArrowRight" && e.key !== "ArrowLeft" && e.key !== "ArrowUp" && e.key !== "ArrowDown") {
        return;
      }
      const nodes = layout.nodes;
      const i = nodes.findIndex((n) => n.id === focusedId);
      if (i < 0) return;
      const next = e.key === "ArrowRight" || e.key === "ArrowDown" ? i + 1 : i - 1;
      if (next >= 0 && next < nodes.length) {
        e.preventDefault();
        setFocusedId(nodes[next].id);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [focusedId, layout.nodes]);

  // 首屏骨架：库还没到就渲染画布会让视口按 0 尺寸取景，闪一下再跳。
  if (library === null) {
    return (
      <div className="sq-bleed">
        <div className="sq-boot">
          <div className="sq-boot-text">正在铺开广场…</div>
        </div>
      </div>
    );
  }

  // 筛完为空 ≠ 广场是空的。这两种情况必须分开说：
  //   · 广场真的没有讨论 → 引导去提问
  //   · 只是当前筛选没命中 → 说明还有多少场，并把筛选条留在屏幕上让用户切回去
  // 合并成一句话会让用户以为内容丢了（这是诚实性要求的一部分）。
  if (layout.nodes.length === 0) {
    const label = SCOPE_LABELS.find((s) => s.key === scope)?.label ?? "";
    return (
      <div className="sq-bleed">
        <div className="sq-boot">
          <div className="sq-boot-text">
            {totalCount === 0
              ? "广场上还没有讨论。回首页问一个问题，它就会出现在这里。"
              : scope === "live"
                ? "现在没有正在进行的讨论 —— 分身都答完了，剩下的缺口在等真人。你可以现在开一场。"
                : scope === "mine"
                  ? "你还没有提问过。广场上另有 " + totalCount + " 场别人的讨论，可以先去逛逛。"
                  : "没有符合「" + label + "」的讨论。广场上共有 " + totalCount + " 场，换一个筛选看看。"}
          </div>
          {/* 空态必须把筛选条留在屏幕上 —— 否则用户没有路切回去。
              这是「筛空」与「真空白」在交互上的关键差别。 */}
          <div className="sq-boot-filters" role="tablist" aria-label="广场筛选">
            {SCOPE_LABELS.map((s) => (
              <button
                key={s.key}
                role="tab"
                aria-selected={scope === s.key}
                className={"sq-filter" + (scope === s.key ? " sq-filter-on" : "")}
                onClick={() => setScope(s.key)}
              >
                {s.label}
              </button>
            ))}
          </div>
          {totalCount === 0 && (
            <Link className="btn btn-primary" href="/" style={{ marginTop: 16 }}>
              去提问 →
            </Link>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="sq-bleed">
      {narrow ? (
        <SquareStrip
          layout={layout}
          focusedId={focusedId}
          onFocus={(n) => setFocusedId(n?.id ?? null)}
          onOpen={openTopic}
          renderDetail={(node) => <DetailBody node={node} />}
          scope={scope}
          onScope={setScope}
          totalCount={totalCount}
        />
      ) : (
        <SquareCanvas
          layout={layout}
          focusedId={focusedId}
          onFocus={(n) => setFocusedId(n?.id ?? null)}
          onOpen={openTopic}
          onRandom={randomTopic}
          renderDetail={(node) => <DetailBody node={node} />}
          // 骨架期没有 pending 态；将来接入「正在生成」时从 store 取。
          pendingIds={[]}
          scope={scope}
          onScope={setScope}
          totalCount={totalCount}
        />
      )}
    </div>
  );
}

/**
 * 窄屏探测。
 *
 * 为什么不用 CSS media query 单独做：这不是「样式不同」，是**结构不同** ——
 * 一边是画布 + 拖拽 + 缩放，一边是横向滚动列表。结构性的差异必须在 JS 层解，
 * CSS 只能换皮。
 *
 * 初值用 `false`（先按桌面渲染）而不是同步读 matchMedia：
 * 服务端没有 window，同步读会让首屏 HTML 与客户端不一致（hydration 报错）。
 * 挂载后立刻校正，且此时 library 通常还没到、页面还在骨架屏，
 * 所以用户看不到「先桌面后移动」的跳变。
 */
function useIsNarrow(px: number): boolean {
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${px}px)`);
    const sync = () => setNarrow(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, [px]);
  return narrow;
}

/**
 * 详情面板的内容。
 *
 * 为什么详情里只给这些：规格要求卡片本身「避免塞入完整说明文字」，
 * 完整内容留在 /mirror（用户点「载入工作台」才过去）。
 * 这里给的是「值不值得点进去」所需的判断依据 —— 谁在参与、答了几条、
 * 一句预览、有没有缺口。
 */
function DetailBody({ node }: { node: TopicNode }) {
  const { history } = useMirror();
  const local = history.find((m) => m.id === node.id);

  return (
    <div className="sq-detail-info">
      <div className="sq-detail-grid">
        <div>
          <div className="sq-detail-k">参与分身</div>
          <div className="sq-detail-v">{node.answerCount} 位</div>
        </div>
        <div>
          <div className="sq-detail-k">讨论状态</div>
          <div className="sq-detail-v">{node.statusLabel}</div>
        </div>
        <div>
          <div className="sq-detail-k">所属街区</div>
          <div className="sq-detail-v">{node.theme.label}</div>
        </div>
      </div>

      {node.preview && (
        <div className="sq-detail-preview">
          <span className="dim">其中一段是这样的 ——</span>
          <p>{node.preview}</p>
        </div>
      )}

      {local && local.gaps.length > 0 && (
        <div className="sq-detail-gaps dim">
          看山在这一场里发现了 {local.gaps.length} 个缺口 —— 有
          {local.gaps.filter((g) => !g.filledBy).length} 个还等着真人来补。
        </div>
      )}
    </div>
  );
}
