/**
 * `/square-library.json` 的读取层。
 *
 * 这个文件原先在 `SquareField.tsx` 与 `FeedStream.tsx` 里各有一份**逐字重复**的
 * `hydrate()`（两处注释都写着「与另一处同源」，靠人肉同步）。广场改造要新增
 * 右栏现场广播，会变成第三份 —— 所以先把读取与还原收敛到这里，三处共用。
 *
 * 分层：本文件属 `lib/domain`，是纯数据变换，不碰网络、不读 env、不引 React。
 * 真正的 `fetch` 由 `lib/hooks/useSquareLibrary.ts` 负责。
 *
 * ⚠️ 这里的字段与 `scripts/build-library.mjs` 的 `slim()` 一一对应。
 * 改 `slim()` 必须同步改这里，否则会出现「字段在库里、读不出来」的静默缺失。
 */

import { confidenceOf, splitSources } from "./evidence";
import { PERSONA_BY_HANDLE } from "./personas";
import { skillFromPersona } from "./skills";
import type {
  Accent,
  AnswerDraft,
  Gap,
  MirrorQuestion,
  Skill,
  SkillKind,
} from "./types";

export interface LibrarySkill {
  id: string;
  name: string;
  kind?: SkillKind;
  lens?: string;
  accent?: Accent;
  persona?: { handle: string; displayName: string };
}

/**
 * 库里的一条来源。字段对齐 `SkillSource`，但**不含正文** ——
 * 正文是体积最大的一块，而 AGENTS.md §1 铁律 3 要的是「来源与作者」。
 *
 * ⚠️ `author` 允许为空串：开放平台对**同一条内容**可能一次返回作者名、一次返回空串
 *（实测：`question/482967753/answer/2096000577` 两次请求，一次 "Jackie Lee"、一次空）。
 * 所以空串只能理解为「本次没取到署名」，**不得**用 `"匿名用户"` 顶替 ——
 * 那会对着一位实名作者说他是匿名，属于编造（铁律 2）。
 * 展示与否交给 `isDisplayableSource()` 判定。
 */
export interface LibrarySource {
  title: string;
  author: string;
  url: string;
  voteUp: number;
  editTime: number;
}

export interface LibraryAnswer {
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
  /** 检索到的全部来源（含署名/链接暂缺的），展示与否由 `isDisplayableSource` 决定。 */
  sources?: LibrarySource[];
}

export interface LibraryGap {
  id: string;
  kind?: Gap["kind"];
  label?: string;
  reason?: string;
  needProfile?: string;
  severity?: number;
  /** 被真人补上时记录补的人；库里目前没有这个字段，视为未补。 */
  filledBy?: string;
}

export interface LibraryEntry {
  id: string;
  title: string;
  createdAt: number;
  routing: { intent: string; summary: string };
  skills: LibrarySkill[];
  answers: LibraryAnswer[];
  gaps: LibraryGap[];
}

const ACCENTS = ["blue", "violet", "green", "orange"] as const;

/**
 * 一场讨论的**真实**计数。
 *
 * 为什么单独抽一个函数，而不是各处 `entry.answers.length` 就地算：
 * 广场上的人形数量、右栏的元信息、详情面板的文案都要用同一组数字。
 * 各算各的迟早会出现「广场画了 3 个人、右栏写着 5 位分身」这种自相矛盾 ——
 * 而这类矛盾一旦出现在演示现场，评委立刻会怀疑整页数据都是编的。
 */
export interface LibraryStats {
  /** 在场分身数（按 handle 去重；无 handle 的视角型分身按 name 去重） */
  personaCount: number;
  /** 回答条数（含多轮回应） */
  answerCount: number;
  /** 引用到的知乎来源条数 */
  sourceCount: number;
  /** 还没被真人补上的缺口数 */
  openGapCount: number;
  /** 是否有人互相回应（round > 0） */
  hasReplies: boolean;
}

export function statsOf(entry: LibraryEntry): LibraryStats {
  const seen = new Set<string>();
  for (const s of entry.skills ?? []) {
    // 有 handle 用 handle —— 同一位答主可能同时以 persona 与视角型出现，
    // 用 name 去重会把同一人算两次。
    seen.add(s.persona?.handle ?? "name:" + s.name);
  }

  const answers = entry.answers ?? [];
  const sourceCount = answers.reduce((n, a) => {
    // 只数**可核对**的来源（作者名与链接齐全），与回答页实际展示的条数一致 ——
    // 否则会出现「右栏写 195 条来源、回答页只列得出 190 条」这种自相矛盾。
    // `evidenceCount` 是构建时的**检索**条数，只在老的库文件（没有 sources）里当兜底。
    if (a.sources?.length) return n + splitSources(a.sources).displayable.length;
    const c = a.evidenceCount ?? 0;
    return n + (Number.isFinite(c) && c > 0 ? c : 0);
  }, 0);

  return {
    personaCount: seen.size,
    answerCount: answers.length,
    sourceCount,
    openGapCount: (entry.gaps ?? []).filter((g) => !g.filledBy).length,
    hasReplies: answers.some((a) => (a.round ?? 0) > 0),
  };
}

/**
 * 把精简条目还原成一个能塞进 store 的完整 `MirrorQuestion`。
 *
 * 为什么不直接存完整对象：完整镜像问题带着全部回答正文与检索来源，
 * 22 份会让这个 JSON 膨胀到几百 KB —— 用户只是点「载入工作台」，
 * 没必要为此付首屏代价。这里按需重建，字段与 `build-library.mjs` 对齐。
 */
export function hydrateLibraryEntry(entry: LibraryEntry): MirrorQuestion {
  /**
   * 回答带回来的来源，按 skillId 归拢，稍后回填到 skill 上。
   *
   * 为什么必须回填：`skill.sources` 的约定就是「**本次回答检索到的证据**」。
   * 它的真实读者是：
   *   · `app/(flow)/answer/[id]/page.tsx` —— 渲染「证据覆盖 N%」
   *   · `lib/domain/mesh.ts` —— 关键词共现连线与真人候选
   *
   * ⚠️ `components/mirror/EvidenceOverview.tsx` 里也读它，但那个组件**全仓零引用
   *（死组件）**（2026-09-16 核实：`grep -rn EvidenceOverview` 只有它自己和这里的注释）。
   * 别再把「镜像页证据时间轴」当成它的存在理由 —— 那段话曾误导过两轮排查。
   *
   * 与人格语料的区别（2026-09-15 #52 之后人格语料已非空，别混淆）：
   *   · `skill.sources`          = 本次回答检索到的证据
   *   · `persona.corpus.sources` = 蒸馏该人格所用的语料 → `SkillCard` /
   *     `PersonaPopover` 直接读 `persona.corpus`，**不受这里影响**，两者各归各位。
   *
   * 不回填的后果是**同一页自相矛盾**：回答页写着「3 条真实知乎来源」，
   * 镜像页写着「当前没有可核对的来源」。
   */
  const sourcesBySkill = new Map<string, LibrarySource[]>();
  for (const a of entry.answers ?? []) {
    if (a.sources?.length) sourcesBySkill.set(a.skillId, a.sources);
  }

  /** 把一条回答的来源转成 `SkillSource`；正文不进库，故 excerpt 为空。 */
  const toSkillSources = (list: LibrarySource[] | undefined) =>
    (list ?? []).map((s) => ({
      title: s.title,
      author: s.author,
      url: s.url,
      excerpt: "",
      voteUp: s.voteUp ?? 0,
      editTime: s.editTime ?? 0,
      confidence: 0,
    }));

  const skills: Skill[] = entry.skills.map((s, i) => {
    const sources = toSkillSources(sourcesBySkill.get(s.id));
    const persona = s.persona ? PERSONA_BY_HANDLE.get(s.persona.handle) : undefined;
    if (persona) {
      // 人格定义里有完整的 lens / keywords / tone，优先用它，别用裁剪版。
      //
      // ⚠️ 但 `sources` 与 `confidence` **一律以回答侧为准，没有例外** ——
      // 绝不能像 2026-09-16 之前那样写成
      //   `sources.length ? { ...full, sources, confidence } : full`
      // 那个「没有来源就整个用 full」的兜底会同时制造两个错误：
      //
      //   ① `skill.sources` 变成 `persona.corpus.sources`（蒸馏该人格用的语料）。
      //      字段名与「本次证据」共用，`mesh.ts` 会把它当本次证据用 ——
      //      issue #70（实测 1/22 场：`mirror-826745` 的 `persona:splitter`，
      //      回答侧 0 条 / 技能侧 5 条，且那 5 条标题与当场问题毫无关系）。
      //   ② `confidence` 保留人格蒸馏质量。`skillFromPersona` 的公式是
      //      `0.4 + corpus.sampleSize * 0.015` —— 它衡量的是**人格蒸馏得好不好**，
      //      不是本次证据覆盖。30 条样本 → 0.85，于是回答页出现
      //      「证据覆盖 85%」而同一页的来源区写着「没有可核对的来源」。
      //      这个矛盾是**用户可见**的，issue #70 只查了 mesh.ts、低估了它。
      //
      // `confidenceOf([]) === 0`，所以零来源时两个数字一起归零、与来源区一致。
      const full = skillFromPersona(persona);
      const withEvidence: Skill = { ...full, sources, confidence: confidenceOf(sources) };
      return s.accent ? { ...withEvidence, accent: s.accent } : withEvidence;
    }
    // 找不到人格定义（公共人物视角 / 降级视角）时，用条目自称的信息兜一个最小 Skill。
    return {
      id: s.id,
      name: s.name,
      kind: s.kind ?? "analysis",
      lens: s.lens ?? "",
      query: entry.title,
      keywords: [],
      tone: [],
      accent: s.accent ?? ACCENTS[i % ACCENTS.length],
      sources,
      confidence: confidenceOf(sources),
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
    /**
     * 来源：带上库里存的**真名与真链接**。
     *
     * ⚠️ 署名/链接缺失的条目照样还原（不在这里丢数据），由消费端用
     * `isDisplayableSource()` 决定是否渲染成卡片并如实报出未归属条数。
     * 绝不能拿 `skillName` 冒充来源作者 —— 那是张冠李戴（铁律 3）。
     * 正文（excerpt）不进库，所以这里恒为空串，UI 不得渲染一个孤零零的「…」。
     */
    evidence: toSkillSources(a.sources),
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
    filledBy: g.filledBy,
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

/** 从 JSON 里取出条目数组，形状不对就返回空数组（不抛，也不编数据）。 */
export function entriesOf(raw: unknown): LibraryEntry[] {
  const list = (raw as { entries?: unknown })?.entries;
  return Array.isArray(list) ? (list as LibraryEntry[]) : [];
}
