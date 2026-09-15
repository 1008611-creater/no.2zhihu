import type { AnswerDraft, MirrorQuestion } from "./types";

/**
 * 把「已经落盘的镜像数据」补成合法形状。
 *
 * ## 为什么需要它（不是防御性编程洁癖，是一次真实事故的收尾）
 *
 * 2026-09-15：「开始一轮互相回应」产出的回答缺 `evidence` / `status` / `round`
 * 三个字段（服务端 `DebateReply` 定义少了它们），前端却按 `AnswerDraft`
 * 直接追加进 `mirror.answers` 并**落盘到 localStorage**。结果：
 *   · `lib/domain/handoff.ts` 的 `for (const e of a.evidence)` 抛
 *     `TypeError: a.evidence is not iterable` → `/mirror` 整页白屏；
 *   · 而且它已经写进了 localStorage —— **只修服务端不能让这些人恢复**，
 *     刷新、换页都会继续崩，除非手动清缓存。
 *
 * 所以这里承担两件事：
 *   1. `MirrorProvider` 读盘时过一遍 → 已经中招的用户自愈；
 *   2. `appendReplies` 收到服务端响应时过一遍 → 同类残缺不再进内存/落盘。
 *
 * ## 边界：只补结构，不编内容
 *
 * `body` / `skillName` / `id` 这些**内容**字段一律原样保留；缺了就整条丢掉
 * （一条连正文都没有的「回答」没有展示价值，也不该被补成别的样子）。
 * 结构字段（数组、枚举）才允许给默认值，且默认值必须与既有语义一致 ——
 * 见下面每一处的注释。
 */

/** 读盘数据的形状：结构字段允许缺失，内容字段必须有。 */
export interface StoredAnswer {
  id: string;
  skillId: string;
  skillName: string;
  body: string;
  evidence?: AnswerDraft["evidence"];
  status?: AnswerDraft["status"];
  round?: number;
  accent?: AnswerDraft["accent"];
  generatedBy?: AnswerDraft["generatedBy"];
  handle?: string;
  humanAuthor?: string;
  replyTo?: string;
  replyToName?: string;
  createdAt?: number;
  claimCheck?: AnswerDraft["claimCheck"];
  publicFigure?: AnswerDraft["publicFigure"];
  generationIntegrity?: AnswerDraft["generationIntegrity"];
}

/**
 * 一条回答 → 合法 `AnswerDraft`。内容字段缺失时返回 `null`（由调用方丢弃）。
 */
export function normalizeAnswer(raw: StoredAnswer): AnswerDraft | null {
  if (!raw || typeof raw !== "object") return null;
  if (typeof raw.id !== "string" || !raw.id) return null;
  if (typeof raw.body !== "string") return null;

  return {
    ...raw,
    // 下游是 `for (const e of a.evidence)` 与 `flatMap(a => a.evidence)`：
    // 不是数组就会抛错，且抛在渲染期（整页白屏）。所以这里必须是数组。
    evidence: Array.isArray(raw.evidence) ? raw.evidence : [],
    // 缺失 = 首轮作答。互相回应的记录落盘时一定带 round=1，不会被误判。
    round: typeof raw.round === "number" && Number.isFinite(raw.round) ? raw.round : 0,
    // 「AI 生成」是本站回答的默认来源；真人补充与已搬运都显式写过这个字段。
    status: raw.status ?? "ai",
    // 有正文的回答只可能来自直答；`retrieval` 对应的是「只检索、没生成正文」。
    generatedBy: raw.generatedBy ?? "zhida",
    accent: raw.accent ?? "blue",
    createdAt: typeof raw.createdAt === "number" ? raw.createdAt : 0,
  } as AnswerDraft;
}

/**
 * 整场镜像 → 合法 `MirrorQuestion`。
 *
 * 只保证「下游会遍历的数组」确实是数组、每条回答结构合法；
 * 其余字段原样保留 —— 这一层不是数据校验器，不做过度清洗。
 */
export function normalizeMirror(raw: MirrorQuestion): MirrorQuestion {
  const answers = Array.isArray(raw.answers)
    ? raw.answers
        .map((a) => normalizeAnswer(a as unknown as StoredAnswer))
        .filter((a): a is AnswerDraft => a !== null)
    : [];

  return {
    ...raw,
    answers,
    skills: Array.isArray(raw.skills) ? raw.skills : [],
    gaps: Array.isArray(raw.gaps) ? raw.gaps : [],
    contributions: Array.isArray(raw.contributions) ? raw.contributions : [],
  };
}

/** 批量（history）。顺序不变，丢弃无法修复的条目。 */
export function normalizeMirrorList(raw: MirrorQuestion[]): MirrorQuestion[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((m) => normalizeMirror(m));
}
