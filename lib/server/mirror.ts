import "server-only";

import { findGaps } from "@/lib/domain/gap";
import { routeQuestion } from "@/lib/domain/router";
import { PERSONA_SKILLS } from "@/lib/domain/skills";
import type { AnswerDraft, MirrorQuestion, Persona, Skill, SkillSource } from "@/lib/domain/types";
import { cached } from "@/lib/zhihu/cache";
import { hasCredentials, zhidaText, zhihuSearch } from "@/lib/zhihu/client";
import { ZhihuApiError } from "@/lib/zhihu/errors";
import type { SearchItem } from "@/lib/zhihu/types";

/**
 * 镜像引擎（服务端编排层）。
 *
 * v1 重构（2026-09-14）：主线从「抽象视角分身」改成「具体知乎答主的分身」。
 * 输入问题 → 用户选答主（或看山推荐）→ 每人格各自取证据 → 各自作答。
 * 评价标准是「像这个人」>「答案完美」，所以人格的 voice 优先级高于全站统一文风。
 *
 * 数据流：
 *   问题 → Human Router 定人（manual 优先）→ 每位答主跑真实知乎搜索取证据
 *        → 直答按该答主的人格生成正文 → 缺口识别（lib/domain/gap.ts）→ 匹配真人候选
 *
 * 额度纪律（直答 100/天、搜索 100/天）：
 *   - 整条流程的结果按「问题 + 指定答主 + 是否直答 + 证据条数」缓存 30 分钟。
 *   - 单次流程最多 MAX_SKILLS_PER_RUN 位答主。
 *   - 继续邀请（invite）只生成新的一位，不重跑已有分身。
 *   - 互相回应（debate）只跑一轮，最多 2 次直答。
 *   - 凭证缺失时进入只读降级：仍然产出结构与真实来源，但不编造任何正文。
 */

const MIRROR_TTL_MS = 30 * 60_000;

/**
 * 降级结果的缓存时长。
 *
 * 直答被限流时会产生「证据直引」的降级回答。这种结果如果也缓存 30 分钟，
 * 一次偶发的限流就会让接下来半小时的演示全部显示「直答不可用」。
 * 所以降级结果只短暂缓存，让下一次请求有机会拿到真正的生成内容。
 */
const MIRROR_DEGRADED_TTL_MS = 60_000;

/** 每次体验最多召集的答主数，控制额度消耗。 */
export const MAX_SKILLS_PER_RUN = 4;

/**
 * 直答默认开启 —— 这是产品的核心能力，关掉就退化成检索摘要。
 * 额度 100/天，配合 30 分钟结果缓存足够演示；设 ZHIHU_USE_ZHIDA=0 可强制关闭。
 */
const USE_ZHIDA = process.env.ZHIHU_USE_ZHIDA !== "0";

/** 单次直答的硬超时，避免一个慢请求拖垮整条流程。 */
const ANSWER_TIMEOUT_MS = 20_000;

/** 上游瞬时限流时的重试次数与基础退避。实测 2s 间隔可稳定通过。 */
const ZHIDA_ATTEMPTS = 4;
const ZHIDA_RETRY_BASE_MS = 2000;

/**
 * 直答并发上限。
 *
 * 实测：并发 4 路必触发 429；并发 2 路连续多轮稳定通过。
 * 所以用「并发 2 的池」而不是全串行 —— 4 位答主的作答时间从 ~36s 降到 ~20s，
 * 同时保住「每次都真的用直答生成」这个核心承诺。
 */
const ZHIDA_CONCURRENCY = 2;

/** 每位答主向上游多取一些，过滤掉过短的摘要后再截断到 evidencePerSkill。 */
const FETCH_LIMIT = 8;

/** 短于这个长度的摘要没有引用价值，宁可少一条也不展示噪音。 */
const MIN_EXCERPT = 40;

export interface MirrorOptions {
  /** 是否调用直答生成正文。关闭时用证据摘要拼装，零直答额度消耗。 */
  useZhida?: boolean;
  /** 每位答主取回的证据条数。 */
  evidencePerSkill?: number;
  /** 用户手动指定的答主 handle 列表；为空则走自动推荐。 */
  handles?: string[];
}

/* ------------------------------ 主流程 ------------------------------ */

/**
 * 核心入口：问题 → 路由 → 证据 → 回答 → 缺口。
 * 结果按「问题 + 指定答主」缓存 30 分钟，重复演示不消耗新额度。
 */
export async function runMirror(question: string, opts: MirrorOptions = {}): Promise<MirrorQuestion> {
  const trimmed = question.trim();
  const useZhida = opts.useZhida ?? USE_ZHIDA;
  const evidencePerSkill = clamp(opts.evidencePerSkill ?? 3, 1, 5);
  const handles = dedupeHandles(opts.handles ?? []);
  const cacheKey =
    "mirror:" + trimmed + ":" + handles.join(",") + ":" + useZhida + ":" + evidencePerSkill;

  return cached(
    cacheKey,
    () => buildMirror(trimmed, { useZhida, evidencePerSkill }, handles),
    {
      ttlMs: (mirror) =>
        mirror.answers.some((a) => a.generatedBy === "retrieval")
          ? MIRROR_DEGRADED_TTL_MS
          : MIRROR_TTL_MS,
    },
  );
}

async function buildMirror(
  question: string,
  opts: { useZhida: boolean; evidencePerSkill: number },
  handles: string[],
): Promise<MirrorQuestion> {
  const routing = routeQuestion(question, handles);
  const picks = routing.picks.slice(0, MAX_SKILLS_PER_RUN);

  // 并行取证据：各位答主互不依赖，串行只会拖慢体验，额度消耗完全相同。
  const skills = (
    await Promise.all(
      picks.map(async (pick, index) => {
        const base = PERSONA_SKILLS.find((s) => s.id === pick.skillId);
        if (!base) return null;
        const query = routing.queries[index] ?? "";
        const sources = await collectEvidence(query, opts.evidencePerSkill);
        // confidence 表示「这一次检索到多少可核对的证据」，与人格蒸馏条数分开。
        return { ...base, query, sources, confidence: confidenceOf(sources) } as Skill;
      }),
    )
  ).filter((s): s is Skill => s !== null);

  // 限并发作答：并发 4 会触发上游 429，全串行又太慢，并发 2 是实测的稳定点。
  const answers = await mapPool(skills, ZHIDA_CONCURRENCY, (skill) =>
    draftAnswer(skill, question, opts.useZhida),
  );

  // 缺口识别是本作品的核心创新点：纯函数、零额度、可复现。
  const gaps = findGaps({ question, answers, skills });

  const targetUrl = normalizeZhihuUrl(question);

  return {
    id: "mirror-" + (Math.abs(hash(question + "|" + handles.join(","))) % 1_000_000),
    title: question,
    origin: targetUrl ? "zhihu-link" : "typed",
    sourceUrl: targetUrl,
    createdAt: Date.now(),
    routing,
    skills,
    answers,
    gaps,
    handoff: {
      status: "not-ready",
      targetUrl,
      note:
        "知乎开放平台目前只提供读取能力，没有写入/发布接口。" +
        "本产品无法代你发布：请复制整理好的内容，自行到知乎对应问题下发布。",
    },
    contributions: [],
  };
}

/* ------------------------------ 继续邀请 ------------------------------ */

export interface InviteResult {
  skill: Skill;
  answer: AnswerDraft;
}

/**
 * 继续邀请一位答主：只为这一位取证据 + 生成正文。
 *
 * 关键纪律：不重跑已有分身。旧的回答原样保留，额度只花在新来的这一位身上。
 * handle 不在名册里时返回 null，由路由层如实告知「没有这位答主」，不猜、不编。
 */
export async function invitePersona(
  question: string,
  handle: string,
  opts: { useZhida?: boolean; evidencePerSkill?: number } = {},
): Promise<InviteResult | null> {
  const base = PERSONA_SKILLS.find((s) => s.persona?.handle === handle);
  if (!base) return null;

  const useZhida = opts.useZhida ?? USE_ZHIDA;
  const evidencePerSkill = clamp(opts.evidencePerSkill ?? 3, 1, 5);

  // 复用与首轮完全相同的检索词构造逻辑，保证同一位答主两次进来的证据口径一致。
  const routing = routeQuestion(question, [handle]);
  const query = routing.queries[0] ?? "";
  const sources = await collectEvidence(query, evidencePerSkill);
  const skill = { ...base, query, sources, confidence: confidenceOf(sources) } as Skill;
  const answer = await draftAnswer(skill, question, useZhida);

  return { skill, answer };
}

/* ------------------------------ 一轮互相回应 ------------------------------ */

export interface DebateEntry {
  id: string;
  name: string;
  handle?: string;
  body: string;
}

export interface DebateReply {
  id: string;
  skillId: string;
  skillName: string;
  accent: Skill["accent"];
  handle?: string;
  body: string;
  replyTo: string;
  replyToName: string;
  createdAt: number;
  generatedBy: "zhida" | "retrieval";
}

/**
 * 一轮互相回应：找出这组回答里最尖锐的一处冲突，让双方各回一段。
 *
 * 只跑一轮，不循环 —— 上限 2 次直答：
 *   1 次识别冲突（输出严格 JSON），1 次让两位各写一段回应。
 * 任何一步失败都返回空数组 + 原因，绝不用模板假造一段「辩论」。
 */
export async function runDebate(
  question: string,
  entries: DebateEntry[],
): Promise<{ replies: DebateReply[]; note: string }> {
  if (!hasCredentials()) {
    return { replies: [], note: "服务端未配置知乎开放平台凭证，无法生成互相回应。" };
  }
  const usable = entries.filter((e) => e.body.trim().length > 0);
  if (usable.length < 2) {
    return { replies: [], note: "至少要有两位答主回答过，才谈得上互相回应。" };
  }

  // 第 1 次直答：识别冲突。
  let pair: { a: string; b: string; clash: string } | null = null;
  try {
    const raw = await withTimeout(
      zhidaText([
        { role: "system", content: DEBATE_PICKER_PROMPT },
        { role: "user", content: buildDebateDigest(question, usable) },
      ]),
      ANSWER_TIMEOUT_MS,
    );
    pair = parseClash(raw, usable);
  } catch {
    pair = null;
  }

  if (!pair) {
    return { replies: [], note: "这一轮没有识别出足够尖锐的观点冲突，不强行制造对立。" };
  }

  // 第 2 次直答：双方各写一段回应。
  const left = usable.find((e) => e.id === pair.a);
  const right = usable.find((e) => e.id === pair.b);
  if (!left || !right) {
    return { replies: [], note: "这一轮没有识别出足够尖锐的观点冲突，不强行制造对立。" };
  }

  try {
    const raw = await withTimeout(
      zhidaText([
        { role: "system", content: DEBATE_REPLY_PROMPT },
        { role: "user", content: buildDebateReplyPrompt(question, left, right, pair.clash) },
      ]),
      ANSWER_TIMEOUT_MS,
    );
    const replies = parseReplies(raw, left, right);
    if (replies.length === 0) {
      return { replies: [], note: "模型没有按格式给出回应，本轮跳过，不生成假内容。" };
    }
    return { replies, note: pair.clash };
  } catch {
    return { replies: [], note: "互相回应生成失败，请稍后再试。" };
  }
}

/* ------------------------------ 证据 ------------------------------ */

/** 给单个答主收集真实证据。失败时返回空数组，由上层如实标注，绝不编造。 */
export async function collectEvidence(query: string, limit: number): Promise<SkillSource[]> {
  if (!hasCredentials() || !query.trim()) return [];
  try {
    const res = await zhihuSearch(query, FETCH_LIMIT);
    return (res.Items ?? [])
      .filter((i) => (i.ContentText ?? "").trim().length >= MIN_EXCERPT)
      .slice(0, limit)
      .map(toSource);
  } catch {
    return [];
  }
}

function toSource(item: SearchItem): SkillSource {
  return {
    title: item.Title ?? "（无标题）",
    author: item.AuthorName ?? "匿名用户",
    url: item.Url ?? "",
    excerpt: (item.ContentText ?? "").replace(/\s+/g, " ").slice(0, 220),
    voteUp: item.VoteUpCount ?? 0,
    // 上游返回秒级时间戳；小于 1e12 视为秒，统一转成毫秒。
    editTime: normalizeEditTime(item.EditTime),
    // 有正文可核对 = 0.8；只有标题 = 0.4。不由模型自评。
    confidence: (item.ContentText ?? "").trim().length >= MIN_EXCERPT ? 0.8 : 0.4,
  };
}

/** 可信度只由「拿到几条真实来源」决定，不引入任何模型自评分。 */
function confidenceOf(sources: SkillSource[]): number {
  if (sources.length === 0) return 0;
  return Number(Math.min(0.35 + sources.length * 0.22, 0.95).toFixed(2));
}

function normalizeEditTime(value: number | undefined): number {
  if (!value) return 0;
  return value < 1e12 ? value * 1000 : value;
}

/* ------------------------------ 作答 ------------------------------ */

function sentenceLengthLabel(len: Persona["voice"]["sentenceLength"]): string {
  return len === "short" ? "短句为主" : len === "long" ? "长句为主" : len === "medium" ? "中等句长" : "长短交错";
}

/**
 * 人格驱动的主提示词。
 *
 * 与旧版的区别：旧版把「180–320 字、不分点、不要情绪」当成全站统一文风，
 * 结果六个人写出来是同一个人。现在字数区间、句长、分段习惯、情绪强度
 * 全部由这位答主自己的 voice 决定 —— 半佛仙人和张佳玮必须明显不是一个人。
 */
function systemPromptFor(skill: Skill): string {
  const p = skill.persona;

  if (!p) {
    // 视角型（补充层）：保留旧的克制文风，不冒充具体的人。
    return [
      "你是知乎社区里一位有稳定写作风格的答主，正在回答一个具体问题。",
      "",
      "硬性约束（违反即视为失败）：",
      "1. 只能使用【知乎证据】里出现过的信息。不允许引入证据之外的数字、机构名、年份、案例。",
      "2. 不要写任何 Markdown 标记：不要 # 标题、不要 ** 加粗、不要列表符号、不要分隔线。",
      "3. 不要写小标题、不要分点、不要总结段。就是一段连贯的中文。",
      "4. 字数严格控制在 180–320 个汉字之间。",
      "5. 不要在开头客套，第一句就是观点本身。",
      "6. 如果证据不足以支撑一个结论，就在文中用一句话说明「这一点需要真人补充」。",
      "",
      "直接输出正文，不要任何前后缀。",
    ].join("\n");
  }

  const [lo, hi] = p.voice.wordRange;

  return [
    "你正在扮演知乎答主「" + p.displayName + "」，回答一个具体问题。",
    "目标不是给出最完美的答案，而是让读过他文章的人觉得「这像是他本人写的」。",
    "",
    "【他是谁】",
    p.headline,
    "他熟悉的领域：" + p.knows.join("；"),
    "他的立场倾向与思考路径：" + p.stance.join("；"),
    "他明确不懂、绝不装懂的范围：" + p.doesNotKnow.join("；"),
    "",
    "【他怎么说话 · 必须严格遵守】",
    p.voice.summary,
    "句长：" + sentenceLengthLabel(p.voice.sentenceLength) + "；目标字数 " + lo + "–" + hi + " 个汉字。",
    "语气：" + p.voice.tone.join("、") + "；情绪强度 " + p.voice.emotion.toFixed(2) + "（0 克制，1 外放）。",
    p.voice.usesLists
      ? "他习惯分点讲，可以用短分点或短段落。"
      : "他习惯连贯段落，不要分点、不要小标题、不要总结段。",
    "举例方式：" + p.voice.exampleStyle,
    "口语习惯（自然地用，不要每句都堆）：" + p.catchphrases.join("、"),
    "",
    "硬性约束（违反即视为失败）：",
    "1. 事实只能来自【知乎证据】。不允许引入证据之外的数字、机构名、年份、案例。",
    "2. 观点可以片面、可以有情绪、可以直接下结论 —— 不要写成四平八稳的 AI 腔。",
    "3. 不要写任何 Markdown 标记：不要 # 标题、不要 ** 加粗、不要分隔线。",
    "4. 不要在开头客套（不要「这个问题很好」「先说结论」这类铺垫），第一句就进入状态。",
    "5. 如果证据不足以支撑某个结论，就用一句话说「这一点需要真人补充」，不要编。",
    "",
    "直接输出正文，不要任何前后缀。",
  ].join("\n");
}

function buildUserPrompt(skill: Skill, question: string): string {
  const evidence = skill.sources
    .map((s, i) => "[" + (i + 1) + "] 作者：" + s.author + "｜赞同 " + s.voteUp + "\n" + s.excerpt)
    .join("\n\n");

  const p = skill.persona;
  const lines: string[] = [
    "问题：" + question,
    "你的身份：" + skill.name + "（" + skill.lens + "）",
  ];

  if (p) {
    lines.push("你的关注领域：" + p.knows.join("、"));
    lines.push("你的语癖：" + p.catchphrases.join("、"));
  } else {
    lines.push("你的视角：" + skill.lens);
    lines.push("你的文风：" + skill.tone.join("、"));
    lines.push("关注的关键词：" + skill.keywords.join("、"));
  }

  lines.push("", "【知乎证据】", evidence || "（没有取到证据）", "", "请按你的身份和说话方式写一段回答。");
  return lines.join("\n");
}

/** 清理模型偶尔带出的 Markdown 痕迹，并按该人格的字数上限收尾。 */
function sanitizeAnswer(raw: string, skill: Skill): string {
  const t = raw
    .replace(/^#{1,6}\s*/gm, "")
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/^\s*[-*+]\s+/gm, "")
    .replace(/^\s*\d+\.\s+/gm, "")
    .replace(/^-{3,}$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  const hi = skill.persona ? skill.persona.voice.wordRange[1] : 320;
  const hardMax = hi + 80;
  if (t.length > hardMax) {
    const cut = t.slice(0, hardMax);
    const lastStop = Math.max(cut.lastIndexOf("。"), cut.lastIndexOf("！"), cut.lastIndexOf("？"));
    return lastStop > hardMax * 0.6 ? cut.slice(0, lastStop + 1) : cut + "…";
  }
  return t;
}

export async function draftAnswer(
  skill: Skill,
  question: string,
  useZhida: boolean,
): Promise<AnswerDraft> {
  const base = {
    id: "ans-" + skill.id,
    skillId: skill.id,
    skillName: skill.name,
    accent: skill.accent,
    handle: skill.persona?.handle,
    evidence: skill.sources,
    createdAt: Date.now(),
    status: "ai" as const,
    round: 0,
  };

  // 没有凭证、没有证据、或没开直答 —— 三种情况都走同一套诚实的证据直引。
  if (!hasCredentials() || skill.sources.length === 0 || !useZhida) {
    return { ...base, generatedBy: "retrieval", body: evidenceBody(skill) };
  }

  const messages = [
    { role: "system" as const, content: systemPromptFor(skill) },
    { role: "user" as const, content: buildUserPrompt(skill, question) },
  ];

  let lastError: ZhihuApiError | undefined;
  // 上游瞬时限流（429）很常见，退避重试几次通常就能拿到生成结果。
  for (let attempt = 0; attempt < ZHIDA_ATTEMPTS; attempt++) {
    try {
      const text = await withTimeout(zhidaText(messages), ANSWER_TIMEOUT_MS);
      const cleaned = sanitizeAnswer(text, skill);
      if (cleaned.length > 0) return { ...base, generatedBy: "zhida", body: cleaned };
      break;
    } catch (err) {
      if (err instanceof ZhihuApiError) {
        lastError = err;
        // 只有限流值得重试；鉴权/参数/额度用尽重试也不会变好。
        if (err.kind !== "rate_limit" && err.kind !== "upstream") break;
        await sleep(ZHIDA_RETRY_BASE_MS * (attempt + 1));
        continue;
      }
      break;
    }
  }

  if (lastError) {
    return {
      ...base,
      generatedBy: "retrieval",
      body:
        "直答暂时不可用（" + lastError.userMessage + "），已保留 " + skill.sources.length +
        " 条真实来源供你参考。",
    };
  }

  return { ...base, generatedBy: "retrieval", body: evidenceBody(skill) };
}

/**
 * 不调用直答时的正文：直接引用真实证据，零生成成本。
 * 文案必须让读者一眼看出「这段是检索摘要，不是模型生成」。
 */
function evidenceBody(skill: Skill): string {
  const top = skill.sources[0];
  if (!top) {
    return (
      "没有在知乎检索到足够的公开证据，「" + skill.name + "」这一段暂时是空的，需要一位真人来补上。"
    );
  }
  const rest =
    skill.sources.length > 1 ? "此外还有 " + (skill.sources.length - 1) + " 条相关回答可以对照。" : "";
  return (
    "（本段为证据直引，未调用生成模型）" + top.author + "在《" + top.title + "》里写道：" +
    top.excerpt + rest
  );
}

/* ------------------------------ 互相回应的提示词 ------------------------------ */

const DEBATE_PICKER_PROMPT = [
  "你是一个观点冲突识别器。给定同一个问题下多位答主的回答，找出观点分歧最尖锐的一对。",
  "只输出一行严格 JSON，不要 Markdown 代码块，不要解释：",
  '{"a":"第一位答主的名字","b":"第二位答主的名字","clash":"一句话说明他们分歧在哪"}',
  "如果所有回答立场基本一致，输出 {\"a\":\"\",\"b\":\"\",\"clash\":\"\"}。",
].join("\n");

const DEBATE_REPLY_PROMPT = [
  "你在帮两位知乎答主做一轮互相回应。",
  "规则：",
  "1. 每位答主只写一段，100–220 字，用他自己的口吻。",
  "2. 只能针对对方已经说过的内容回应，不允许引入新的数字、机构、年份。",
  "3. 可以锋利，可以不同意，但必须讲道理。",
  "4. 不要写 Markdown，不要分点。",
  "输出格式（严格照做）：",
  "===REPLY:第一位答主的名字===",
  "（正文）",
  "===REPLY:第二位答主的名字===",
  "（正文）",
].join("\n");

function buildDebateDigest(question: string, entries: DebateEntry[]): string {
  const blocks = entries.map(
    (e) => "【" + e.name + "】\n" + e.body.slice(0, 500),
  );
  return ["问题：" + question, "", blocks.join("\n\n")].join("\n");
}

function buildDebateReplyPrompt(
  question: string,
  a: DebateEntry,
  b: DebateEntry,
  clash: string,
): string {
  return [
    "问题：" + question,
    "分歧点：" + clash,
    "",
    "【" + a.name + "的回答】",
    a.body.slice(0, 700),
    "",
    "【" + b.name + "的回答】",
    b.body.slice(0, 700),
    "",
    "请让这两位各写一段回应，输出格式严格按上面的要求。",
  ].join("\n");
}

/** 从模型输出里抽出严格 JSON；失败返回 null，不猜。 */
function parseClash(raw: string, entries: DebateEntry[]): { a: string; b: string; clash: string } | null {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  let obj: { a?: unknown; b?: unknown; clash?: unknown };
  try {
    obj = JSON.parse(raw.slice(start, end + 1));
  } catch {
    return null;
  }
  const nameA = typeof obj.a === "string" ? obj.a.trim() : "";
  const nameB = typeof obj.b === "string" ? obj.b.trim() : "";
  const clash = typeof obj.clash === "string" ? obj.clash.trim() : "";
  if (!nameA || !nameB || !clash || nameA === nameB) return null;

  const left = entries.find((e) => e.name === nameA || nameA.includes(e.name));
  const right = entries.find((e) => e.name === nameB || nameB.includes(e.name));
  if (!left || !right || left.id === right.id) return null;
  return { a: left.id, b: right.id, clash };
}

function parseReplies(raw: string, left: DebateEntry, right: DebateEntry): DebateReply[] {
  const parts = raw.split(/^===REPLY:(.+?)===\s*$/m);
  // split 结果形如 [前言, 名字1, 正文1, 名字2, 正文2, ...]
  const found: Array<{ name: string; body: string }> = [];
  for (let i = 1; i + 1 < parts.length; i += 2) {
    const name = parts[i].trim();
    const body = parts[i + 1]
      .replace(/^#{1,6}\s*/gm, "")
      .replace(/\*\*(.+?)\*\*/g, "$1")
      .replace(/^-{3,}$/gm, "")
      .trim();
    if (name && body) found.push({ name, body });
  }
  if (found.length === 0) return [];

  const out: DebateReply[] = [];
  const pairs: Array<[DebateEntry, DebateEntry]> = [
    [left, right],
    [right, left],
  ];
  for (const [speaker, opponent] of pairs) {
    const hit = found.find((f) => f.name.includes(speaker.name) || speaker.name.includes(f.name));
    if (!hit) continue;
    out.push({
      id: "reply-" + speaker.id + "-" + Math.abs(hash(speaker.name + hit.body.slice(0, 24))) % 100000,
      skillId: speaker.handle ? "persona:" + speaker.handle : speaker.id,
      skillName: speaker.name,
      accent: accentOfHandle(speaker.handle),
      handle: speaker.handle,
      body: hit.body.slice(0, 400),
      replyTo: opponent.id,
      replyToName: opponent.name,
      createdAt: Date.now(),
      generatedBy: "zhida",
    });
  }
  return out;
}

function accentOfHandle(handle: string | undefined): Skill["accent"] {
  if (!handle) return "blue";
  return PERSONA_SKILLS.find((s) => s.persona?.handle === handle)?.accent ?? "blue";
}

/* ------------------------------ 工具 ------------------------------ */

/** 从任意知乎链接里解析出规范问题地址；无法确定时返回 undefined，不猜测。 */
export function normalizeZhihuUrl(input: string): string | undefined {
  const m = input.match(/zhihu\.com\/question\/(\d+)/);
  return m ? "https://www.zhihu.com/question/" + m[1] : undefined;
}

/** 只保留名册里真实存在的 handle，去重且保序 —— 不猜、不补。 */
function dedupeHandles(handles: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const h of handles) {
    const t = h.trim();
    if (!t || seen.has(t)) continue;
    if (!PERSONA_SKILLS.some((s) => s.persona?.handle === t)) continue;
    seen.add(t);
    out.push(t);
  }
  return out;
}

/** 以固定并发上限跑一批异步任务，保持返回顺序与输入一致。 */
async function mapPool<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const out = new Array<R>(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const i = cursor++;
      if (i >= items.length) return;
      out[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return out;
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error("timeout")), ms)),
  ]);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(Math.max(n, min), max);
}

/** 稳定的小哈希，仅用于生成可复现的 id，不用于安全用途。 */
function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  return h;
}
