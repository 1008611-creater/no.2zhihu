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
  evidenceTitles?: string[];
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
    // evidenceCount 是构建时的计数；缺失时退回标题数组长度。
    // 两个都没有就记 0 —— 不猜、不补位。
    const c = a.evidenceCount ?? a.evidenceTitles?.length ?? 0;
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
  const skills: Skill[] = entry.skills.map((s, i) => {
    const persona = s.persona ? PERSONA_BY_HANDLE.get(s.persona.handle) : undefined;
    if (persona) {
      // 人格定义里有完整的 lens / keywords / tone，优先用它，别用裁剪版。
      const full = skillFromPersona(persona);
      return s.accent ? { ...full, accent: s.accent } : full;
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
    // 证据正文没有随 JSON 下发，只有标题可用。
    // ⚠️ 只还原真正已知的字段：标题。author / url / voteUp / editTime 一律不知道，
    // 就用空值 —— 绝不能拿 skillName 冒充来源作者（那是张冠李戴，违反保留来源的硬要求）。
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
