import "server-only";

import { findGaps } from "@/lib/domain/gap";
import { extractTopic, routeQuestion } from "@/lib/domain/router";
import { SKILL_SEEDS } from "@/lib/domain/skills";
import type { AnswerDraft, MirrorQuestion, Skill, SkillSource } from "@/lib/domain/types";
import { cached } from "@/lib/zhihu/cache";
import { hasCredentials, zhidaText, zhihuSearch } from "@/lib/zhihu/client";
import { ZhihuApiError } from "@/lib/zhihu/errors";
import type { SearchItem } from "@/lib/zhihu/types";

/**
 * 镜像引擎（服务端编排层）。
 *
 * 为什么放在 lib/server/ 而不是 lib/domain/：
 * 这是全站唯一同时接触「知乎 IO」与「领域规则」的地方。lib/domain/ 必须保持
 * 纯函数、可测试、零 IO（见 AGENTS.md 的依赖方向铁律），所以把编排单独分层。
 *
 * 数据流：
 *   问题 → Human Router 选分身 → 每个分身跑真实知乎搜索 → 取真实证据
 *        → 直答基于证据生成该视角正文 → 缺口识别（lib/domain/gap.ts）→ 匹配真人候选
 *
 * 额度纪律（热榜 100/天、直答 100/天、问题回答 100/天）：
 *   - 整条流程的结果按「问题 + 是否直答 + 证据条数」缓存 30 分钟。
 *     同一问题反复演示不会重复消耗额度 —— 这是 Demo 期间最关键的一条保障。
 *   - 单次流程最多 MAX_SKILLS_PER_RUN 个分身，即最多这么多次搜索。
 *   - 直答默认开启（设 ZHIHU_USE_ZHIDA=0 才关）。这是产品的核心能力：分身必须按自己的
 *     视角真的生成正文。关闭时退回证据摘要拼装，零生成成本，且文案标注「这是直引」。
 *   - 凭证缺失时进入只读降级：仍然产出分身与缺口结构，但不编造任何内容。
 */

type SkillSeed = (typeof SKILL_SEEDS)[number];

const MIRROR_TTL_MS = 30 * 60_000;

/**
 * 降级结果的缓存时长。
 *
 * 直答被限流时会产生「证据直引」的降级回答。这种结果如果也缓存 30 分钟，
 * 一次偶发的限流就会让接下来半小时的演示全部显示「直答不可用」。
 * 所以降级结果只短暂缓存，让下一次请求有机会拿到真正的生成内容。
 */
const MIRROR_DEGRADED_TTL_MS = 60_000;

/** 每次体验最多检索的分身数，控制额度消耗。 */
export const MAX_SKILLS_PER_RUN = 4;

/**
 * 直答默认开启 —— 这是产品的核心能力，关掉就退化成检索摘要。
 * 额度 100/天，配合 30 分钟结果缓存足够演示；设 ZHIHU_USE_ZHIDA=0 可强制关闭。
 */
const USE_ZHIDA = process.env.ZHIHU_USE_ZHIDA !== "0";

/** 单次直答的硬超时，避免一个慢请求拖垮整条流程。 */
const ANSWER_TIMEOUT_MS = 20_000;

/** 上游瞬时限流时的重试次数与基础退避。实测 1.5s 间隔可稳定通过。 */
const ZHIDA_ATTEMPTS = 4;
const ZHIDA_RETRY_BASE_MS = 2000;

/**
 * 直答并发上限。
 *
 * 实测：并发 4 路必触发 429；并发 2 路连续多轮稳定通过。
 * 所以用「并发 2 的池」而不是全串行 —— 4 个分身的作答时间从 ~36s 降到 ~20s，
 * 同时保住「每次都真的用直答生成」这个核心承诺。
 */
const ZHIDA_CONCURRENCY = 2;

/** 每个分身向上游多取一些，过滤掉过短的摘要后再截断到 evidencePerSkill。 */
const FETCH_LIMIT = 8;

/** 短于这个长度的摘要没有引用价值，宁可少一条也不展示噪音。 */
const MIN_EXCERPT = 40;

export interface MirrorOptions {
  /** 是否调用直答生成正文。关闭时用证据摘要拼装，零直答额度消耗。 */
  useZhida?: boolean;
  /** 每个分身取回的证据条数。 */
  evidencePerSkill?: number;
}

/**
 * 核心入口：问题 → 路由 → 证据 → 回答 → 缺口。
 * 结果按问题缓存 30 分钟，重复演示不消耗新额度。
 */
export async function runMirror(question: string, opts: MirrorOptions = {}): Promise<MirrorQuestion> {
  const trimmed = question.trim();
  const useZhida = opts.useZhida ?? USE_ZHIDA;
  const evidencePerSkill = clamp(opts.evidencePerSkill ?? 3, 1, 5);
  const cacheKey = `mirror:${trimmed}:${useZhida}:${evidencePerSkill}`;

  return cached(cacheKey, () => buildMirror(trimmed, { useZhida, evidencePerSkill }), {
    ttlMs: (mirror) =>
      mirror.answers.some((a) => a.generatedBy === "retrieval")
        ? MIRROR_DEGRADED_TTL_MS
        : MIRROR_TTL_MS,
  });
}

async function buildMirror(question: string, opts: Required<MirrorOptions>): Promise<MirrorQuestion> {
  const routing = routeQuestion(question);
  const picks = routing.picks.slice(0, MAX_SKILLS_PER_RUN);

  // 并行取证据：各分身互不依赖，串行只会拖慢体验，额度消耗完全相同。
  const skills = (
    await Promise.all(
      picks.map(async (pick, index) => {
        const seed = SKILL_SEEDS.find((s) => s.id === pick.skillId);
        if (!seed) return null;
        const query =
          routing.queries[index] ?? seed.queryTemplate.replace("{topic}", extractTopic(question));
        const sources = await collectEvidence(query, opts.evidencePerSkill);
        return buildSkill(seed, sources, query);
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
    id: `mirror-${Math.abs(hash(question)) % 1_000_000}`,
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

/* ------------------------------ 证据 ------------------------------ */

/** 给单个分身收集真实证据。失败时返回空数组，由上层如实标注，绝不编造。 */
async function collectEvidence(query: string, limit: number): Promise<SkillSource[]> {
  if (!hasCredentials()) return [];
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
  };
}

function buildSkill(seed: SkillSeed, sources: SkillSource[], query: string): Skill {
  return {
    id: seed.id,
    name: seed.name,
    kind: seed.kind,
    lens: seed.lens,
    query,
    keywords: seed.keywords,
    tone: seed.tone,
    accent: seed.accent,
    sources,
    confidence: confidenceOf(sources),
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

const SYSTEM_PROMPT = [
  "你是知乎社区里一位有稳定写作风格的答主，正在回答一个具体问题。",
  "",
  "硬性约束（违反即视为失败）：",
  "1. 只能使用【知乎证据】里出现过的信息。不允许引入证据之外的数字、机构名、年份、案例。",
  "2. 不要写任何 Markdown 标记：不要 # 标题、不要 ** 加粗、不要列表符号、不要分隔线。",
  "3. 不要写小标题、不要分点、不要总结段。就是一段连贯的中文。",
  "4. 字数严格控制在 180–320 个汉字之间。",
  "5. 不要在开头客套（不要「这个问题很好」「先说结论」这类铺垫），第一句就是观点本身。",
  "6. 如果证据不足以支撑一个结论，就在文中用一句话说明「这一点需要真人补充」。",
  "",
  "直接输出正文，不要任何前后缀。",
].join("\n");

function buildUserPrompt(skill: Skill, question: string): string {
  const evidence = skill.sources
    .map((s, i) => `[${i + 1}] 作者：${s.author}｜赞同 ${s.voteUp}\n${s.excerpt}`)
    .join("\n\n");

  return [
    `问题：${question}`,
    `你的视角：${skill.lens}`,
    `你的文风：${skill.tone.join("、")}`,
    `关注的关键词：${skill.keywords.join("、")}`,
    "",
    "【知乎证据】",
    evidence || "（没有取到证据）",
    "",
    "请按你的视角写一段回答。",
  ].join("\n");
}

/** 清理模型偶尔带出的 Markdown 痕迹，并硬性截断到合理长度。 */
function sanitizeAnswer(raw: string): string {
  const t = raw
    .replace(/^#{1,6}\s*/gm, "")
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/^\s*[-*+]\s+/gm, "")
    .replace(/^\s*\d+\.\s+/gm, "")
    .replace(/^-{3,}$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  // 超长时在最后一个完整句子处收尾，避免把句子截断。
  if (t.length > 420) {
    const cut = t.slice(0, 420);
    const lastStop = Math.max(cut.lastIndexOf("。"), cut.lastIndexOf("！"), cut.lastIndexOf("？"));
    return lastStop > 200 ? cut.slice(0, lastStop + 1) : cut + "…";
  }
  return t;
}

async function draftAnswer(skill: Skill, question: string, useZhida: boolean): Promise<AnswerDraft> {
  const base = {
    id: `ans-${skill.id}`,
    skillId: skill.id,
    skillName: skill.name,
    accent: skill.accent,
    evidence: skill.sources,
    createdAt: Date.now(),
    status: "ai" as const,
  };

  // 没有凭证、没有证据、或没开直答 —— 三种情况都走同一套诚实的证据直引。
  if (!hasCredentials() || skill.sources.length === 0 || !useZhida) {
    return { ...base, generatedBy: "retrieval", body: evidenceBody(skill) };
  }

  const messages = [
    { role: "system" as const, content: SYSTEM_PROMPT },
    { role: "user" as const, content: buildUserPrompt(skill, question) },
  ];

  let lastError: ZhihuApiError | undefined;
  // 上游瞬时限流（429）很常见，退避重试两次通常就能拿到生成结果。
  for (let attempt = 0; attempt < ZHIDA_ATTEMPTS; attempt++) {
    try {
      const text = await Promise.race([
        zhidaText(messages),
        new Promise<string>((_, reject) =>
          setTimeout(() => reject(new Error("timeout")), ANSWER_TIMEOUT_MS),
        ),
      ]);

      const cleaned = sanitizeAnswer(text);
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
      body: `直答暂时不可用（${lastError.userMessage}），已保留 ${skill.sources.length} 条真实来源供你参考。`,
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
    return `没有在知乎检索到足够的公开证据，「${skill.name}」这个视角暂时是空的，需要一位真人来补上这一块。`;
  }
  const rest = skill.sources.length > 1 ? `此外还有 ${skill.sources.length - 1} 条相关回答可以对照。` : "";
  return `（本段为证据直引，未调用生成模型）${top.author}在《${top.title}》里写道：${top.excerpt}${rest}`;
}

/* ------------------------------ 工具 ------------------------------ */

/** 从任意知乎链接里解析出规范问题地址；无法确定时返回 undefined，不猜测。 */
export function normalizeZhihuUrl(input: string): string | undefined {
  const m = input.match(/zhihu\.com\/question\/(\d+)/);
  return m ? `https://www.zhihu.com/question/${m[1]}` : undefined;
}

/** 以固定并发上限跑一批异步任务，保持返回顺序与输入一致。 */
async function mapPool<T, R>(items: T[], limit: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
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
