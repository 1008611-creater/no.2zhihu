import "server-only";

import { findGaps } from "@/lib/domain/gap";
import { voiceFingerprintGaps } from "@/lib/domain/personas";
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
 * 启动自检：答主语言指纹是否齐全。
 *
 * 为什么放在这一层、而不是 lib/domain：AGENTS.md §2 规定 lib/domain 必须是纯函数层、
 * 不得读 process.env。而「指纹缺失要不要致命」是**运行环境**的决策，所以纯计算留在
 * domain（voiceFingerprintGaps），env 判断留在 server（这里）。
 *
 * 为什么值得自检：指纹缺失不会让任何页面报错，只会让生成的回答**悄悄退回 AI 腔**
 * —— 而这正是评委反复指出的那个问题。让它可见，好过让它静默发生。
 * 开发期直接抛错（早失败），生产期只警告（不能因为一个人格资产没写完就让整个服务起不来）。
 */
{
  const gaps = voiceFingerprintGaps();
  if (gaps.length > 0) {
    const detail = gaps.map((g) => `· ${g.name}：缺少 ${g.missing.join("、")}`).join("\n");
    if (process.env.NODE_ENV !== "production") {
      throw new Error("答主语言指纹不完整（会导致生成文风退回 AI 腔）：\n" + detail);
    }
    console.warn("[personas] 答主语言指纹不完整，生成文风会退回 AI 腔：\n" + detail);
  }
}

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
    draftAnswer(skill, question, opts.useZhida, skills),
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
 * 把答主的语言指纹压成一小段，用于互相回应的提示词。
 *
 * 为什么回应也要带指纹：互相回应是最容易被写成「两个 AI 在辩论」的地方 ——
 * 两边都开始讲道理、都四平八稳，人格立刻消失。让模型在回应时也拿着
 * 各自的开头方式、标点习惯和禁区，才能保住「是这两个人在对话」。
 */
function debateVoiceLine(entry: DebateEntry): string {
  const p = PERSONA_SKILLS.find((s) => s.persona?.handle === entry.handle)?.persona;
  if (!p) return "";
  const bits = ["语气：" + p.voice.tone.join("、"), "句长：" + sentenceLengthLabel(p.voice.sentenceLength)];
  if (p.voice.punctuation) bits.push("标点：" + p.voice.punctuation);
  if (p.voice.opening) bits.push("开口习惯：" + p.voice.opening.slice(0, 50));
  if (p.voice.avoid && p.voice.avoid.length > 0) {
    bits.push("绝不出现：" + p.voice.avoid.slice(0, 2).join(" ／ "));
  }
  return entry.name + " —— " + bits.join("；");
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
    return { replies: [], note: "观点冲突识别请求失败或超时，暂时无法判断分歧，请稍后重试。" };
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
function systemPromptFor(skill: Skill, siblings: Skill[] = []): string {
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

  // 「几个回答看着像一个人写的」是这个产品最致命的失败。
  // 光靠形容词约束不够，必须把同场其他人的风格明确写出来当反面参照。
  const others = siblings.filter((s) => s.id !== skill.id);
  const rivalLines: string[] = [];
  if (others.length > 0) {
    rivalLines.push(
      "",
      "【同场还有这些人在回答同一个问题 —— 你必须写得和他们明显不同】",
      ...others.map((s) => {
        const op = s.persona;
        if (!op) return "· " + s.name + "：" + s.lens;
        const [olo, ohi] = op.voice.wordRange;
        return (
          "· " + op.displayName + "：" + op.headline +
          "。语气是「" + op.voice.tone.join("、") + "」，" +
          op.voice.sentenceLength +
          "句为主，" + olo + "–" + ohi + " 字，" +
          op.catchphrases.slice(0, 2).join("、") + " 是他的口头禅。" +
          (op.voice.opening ? "他开头习惯「" + op.voice.opening.slice(0, 40) + "…」。" : "")
        );
      }),
      "读的人会把你们几段放在一起看。如果遮住名字分不出谁写的，这次就算失败。",
      "具体说：开头第一句的写法、句长节奏、标点习惯、看问题的入口，四样都要和他不一样。",
    );
  }

  /**
   * 文风特征段。
   *
   * 为什么把「开头 / 标点 / 反面例句 / 语感范例」单独拉出来：
   * 之前只给了「语气」「句长」这类形容词，模型没法把它们落地 —— 形容词谁都能
   * 认领，结果就是每个人写出来都是同一个温和、条理、有分寸的腔调。
   * 这四样是**可执行、可核对**的：开头第一句能直接照抄句式，标点习惯能数，
   * 反面例句是明确的禁区，语感范例给了节奏目标。
   */
  const fingerprint: string[] = [];
  if (p.voice.opening) {
    fingerprint.push("开头第一句怎么起：" + p.voice.opening);
    fingerprint.push("（开头是最容易暴露 AI 的位置。不要用「这个问题其实」「先说结论」「随着……的发展」起手。）");
  }
  if (p.voice.punctuation) {
    fingerprint.push("标点与排版习惯（照做，这是识别你最快的地方）：" + p.voice.punctuation);
  }
  if (p.voice.avoid && p.voice.avoid.length > 0) {
    fingerprint.push(
      "",
      "【这几句你绝对写不出来 —— 出现任何一句，就算写砸了】",
      ...p.voice.avoid.map((x) => "× " + x),
    );
  }
  if (p.voice.exemplars && p.voice.exemplars.length > 0) {
    fingerprint.push(
      "",
      "【语感范例 · 只对齐节奏与句式，不要抄内容、不要照搬主题】",
      ...p.voice.exemplars.map((x) => "→ " + x),
    );
  }

  return [
    "你在为知乎答主「" + p.displayName + "」代笔回答一个具体问题。",
    "评价标准只有一条：读过他文章的人看到这段，会觉得「这像是他本人敲出来的」。",
    "不是「写得好的通用回答」，是**他这个人**的回答。宁可糙一点、偏一点，也不要标准。",
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
    ...(fingerprint.length > 0 ? ["", "【这个人的语言指纹 · 这部分比上面更要紧】", ...fingerprint] : []),
    "",
    "硬性约束（违反即视为失败）：",
    "1. 事实只能来自【知乎证据】。不允许引入证据之外的数字、机构名、年份、案例。",
    "2. 观点可以片面、可以有情绪、可以直接下结论 —— 不要写成四平八稳的 AI 腔。",
    "3. 不要写任何 Markdown 标记：不要 # 标题、不要 ** 加粗、不要分隔线。",
    "3b. 不要写任何形式的小标题、引导句或分段标签 —— 单独成行的「先算启动这笔账」",
    "「成本拆解」「风险在哪」这类短语一律不要。整篇就是连贯的段落，直接从内容往下写。",
    "4. 不要在开头客套（不要「这个问题很好」「先说结论」这类铺垫），第一句就进入状态。",
    "5. 如果证据不足以支撑某个结论，就用一句话说「这一点需要真人补充」，不要编。",
    "6. 用第一人称「我」说话，像本人在知乎上随手敲出来的，不是在写报告。",
    "7. 不要用「先说这一点」「再讲那一点」这种自我报幕的句子，直接说事。",
    "8. 不要在结尾总结。真人写知乎回答经常说完就走，不写「总之」「综上」也不写收尾句。",
    "",
    "【以下都是 AI 腔，出现任何一个，这段回答就算失败】",
    "首先/其次/最后、总的来说、综上所述、值得注意的是、不难看出、由此可见、",
    "这取决于个人情况、因人而异、没有标准答案、这是一个复杂的问题、",
    "希望以上回答对你有帮助、作为一个人工智能、我们应该辩证地看、值得一提、",
    "在当今社会、随着……的发展、综合来看、一方面……另一方面、总而言之、",
    "需要注意的是、建议您、从……的角度来看、让我们一起、归根结底、",
    "总的来说有几点、以下是我的看法、希望可以帮到你。",
    "",
    "【落笔前自检】",
    "第一句是不是直接给了判断或亲身经历？有没有出现上面的 AI 套话？",
    "标点习惯和段落长度，是不是这个人该有的样子？",
    "把这段读一遍，像不像「" + p.displayName + "」本人会在知乎上写出来的？",
    others.length > 0
      ? "把这段和同场其他人放在一起，遮住名字还能不能认出是你写的？不能就重写。"
      : "句子长度是不是他习惯的那种节奏？",
    "",
    ...rivalLines,
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

  lines.push("", "【知乎证据】", evidence || "（没有取到证据）");

  // 语气的关键不是形容词，而是范例。优先拿这位答主本人的原话片段做语感锚点。
  if (p && skill.sources.length > 0) {
    const own = skill.sources.filter(
      (s) => s.author && (s.author.includes(p.displayName) || p.displayName.includes(s.author)),
    );
    const samples = (own.length > 0 ? own : skill.sources).slice(0, 2);
    lines.push("", "【这是他自己写过的话 · 只模仿语感节奏，不要抄内容】");
    samples.forEach((s) => lines.push("· " + s.excerpt.slice(0, 150)));
  }

  /**
   * 把语言指纹在最靠近生成的位置再钉一次。
   *
   * 为什么要重复：system prompt 离实际生成最远，模型容易「读了但没照做」。
   * 把开头句式、标点习惯与禁区放到 user prompt 末尾（也就是最后看到的内容），
   * 是实践中让它真正落到正文上最有效的一次提醒。
   */
  if (p) {
    const tail: string[] = [];
    if (p.voice.opening) tail.push("第一句就按他这个习惯起 —— " + p.voice.opening);
    if (p.voice.punctuation) tail.push("标点与分段照这个来 —— " + p.voice.punctuation);
    if (tail.length > 0) {
      lines.push("", "【落笔前的最后提醒 · 这两条最影响「像不像他」】", ...tail);
    }
    if (p.voice.avoid && p.voice.avoid.length > 0) {
      lines.push("这些句子一句都不要出现：" + p.voice.avoid.join(" ／ "));
    }
  }

  lines.push("", "请按你的身份和说话方式写一段回答。第一句就进入状态，不要铺垫，不要在结尾总结。");
  return lines.join("\n");
}

/**
 * 结尾套话黑名单。
 *
 * 为什么要在后处理里兜底，而不只靠提示词：模型即使整篇都守住了人格，
 * 也极容易在最后一句滑回自己的默认收尾（「总之」「综上」「希望……」）。
 * 而这些收尾恰恰是「一眼就看得出是 AI」的位置 —— 真人写知乎很少正经收尾。
 * 这里只删**位于末尾**的那一句，中间出现的不动，避免误伤正文。
 *
 * ⚠️ 判据：只有**整句就是一个纯套话**时才删（2026-09-15 审计修正）。
 *
 * 早期版本写成 `/(?:总之|...)[^\n]{0,80}[。！？]?\s*$/`，实测会误伤：
 * 「总之我劝你别碰这个，去年我朋友就亏了六十万。」是一句**有实质信息**的
 * 结论，只因为以「总之」开头就被整句删掉了。而这些答主恰恰爱用「总之」
 * 起句说硬话 —— 删掉它等于删掉回答里最有价值的一句。
 *
 * 所以这里把每个模式收紧成「起手词 + 最多一句空泛收束」，并在
 * `stripClosing` 里再加一道「删完不能伤到信息量」的兜底校验。
 */
const CLOSING_PATTERNS: RegExp[] = [
  // ⚠️ 长度上限只有 14 字（早期版本给到 80 字）：
  // 实测 `[^\n]{0,80}` 会把「总之我劝你别碰这个，去年我朋友就亏了六十万。」
  // 这种**有实质信息的结论**整句删掉 —— 而这几位答主恰恰爱用「总之」起句
  // 说硬话，删掉它等于删掉回答里最有价值的一句，且用户完全看不出来。
  // 收紧到 14 字后，只剩「总之，未来可期。」这类真正的空泛收束会被命中。
  /^(?:总之|综上(?:所述)?|总而言之|总的来说)[，,：:]?[^\n]{0,14}[。！？]?\s*$/,
  /^(?:希望|祝愿)(?:以上|这些|这)[^\n]{0,40}[。！？]?\s*$/,
  /^(?:希望(?:能|可以)?(?:对|给)你?[^\n]{0,40}(?:帮助|参考|启发))[。！？]?\s*$/,
  /^(?:以上(?:就是|便是|是)我[^\n]{0,40})[。！？]?\s*$/,
  /^(?:仅供参考)[^\n]{0,20}[。！？]?\s*$/,
  // 「如果觉得有用，欢迎点赞关注」这类求互动收尾，也是典型 AI 腔。
  /^(?:如果|若)?(?:觉得|认为)?(?:有用|有帮助|感兴趣)?[，,]?\s*(?:欢迎|可以|请)\s*(?:点赞|关注|收藏|转发|评论)[^\n]{0,20}[。！？]?\s*$/,
];

/** 清理模型偶尔带出的 Markdown 痕迹，并按该人格的字数上限收尾。 */
function sanitizeAnswer(raw: string, skill: Skill): string {
  const t = raw
    .replace(/^#{1,6}\s*/gm, "")
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/^\s*[-*+]\s+/gm, "")
    .replace(/^\s*\d+\.\s+/gm, "")
    .replace(/^-{3,}$/gm, "")
    // 模型很爱写「先算启动这笔账」这种独立成行的小标题，一眼就是 AI 分节的腔调。
    //
    // ⚠️ 这里**故意收窄了规则**（2026-09-15 审计修正）。早期版本用
    // 「短（2–14 字）+ 无句读」作判据，会把真人风格的独立短句一起删掉：
    //   真人短句：我不信 / 纯属扯淡 / 说不通 / 不是钱的事 / 这事没完
    //   AI 小标题：先算启动这笔账 / 三个层面看这个问题 / 成本核算
    // 两者**在文本层面不可分**（长度相近、都没有句读）。既然判不准，
    // 就该按风险不对称来取舍：误删真人短句 = 静默抹掉本 PR 想要的短促节奏；
    // 漏删小标题 = 少一处优化，无害。**宁可漏删。**
    //
    // 因此只匹配**明确具备标题特征**的行：以序数起手、或以冒号结尾、
    // 或是「写在前面的」这类元叙述词。这些规则精确度高，代价是召回低。
    .replace(
      /^\s*(?:[一二三四五六七八九十]+[、.）)]|\d+[、.）)]|写在前面|结论先行|先给结论|背景交代|简单来说就是)[^\n。！？]{0,14}\s*$/gm,
      "",
    )
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  // 去掉末尾的 AI 式总结句（真人写完就走，不写收尾）。
  const trimmed = stripClosing(t);

  const hi = skill.persona ? skill.persona.voice.wordRange[1] : 320;
  const hardMax = hi + 80;
  if (trimmed.length > hardMax) {
    const cut = trimmed.slice(0, hardMax);
    const lastStop = Math.max(cut.lastIndexOf("。"), cut.lastIndexOf("！"), cut.lastIndexOf("？"));
    return lastStop > hardMax * 0.6 ? cut.slice(0, lastStop + 1) : cut + "…";
  }
  return trimmed;
}

/**
 * 删掉末段里的总结句。
 *
 * 只在**最后一段**上做：真人也会在中间用「总之」引出下一层意思，
 * 全局替换会毁掉正文。末尾是套话高发位，且删掉它不会影响信息完整性。
 */
function stripClosing(text: string): string {
  const blocks = text.split(/\n{2,}/);
  if (blocks.length === 0) return text;
  const last = blocks[blocks.length - 1];

  let out = last;
  // 反复剥离：模型有时会连写两句收尾。
  for (let i = 0; i < 2; i++) {
    const before = out;
    for (const re of CLOSING_PATTERNS) out = out.replace(re, "").trim();
    if (out === before) break;
  }

  // 剥完如果这段空了，就整段丢掉（说明最后一段本来就是一句收尾）。
  if (out.trim().length === 0) {
    const rest = blocks.slice(0, -1).join("\n\n").trim();
    return rest.length > 0 ? rest : text;
  }

  /**
   * 兜底：剥离不能把末段削得太狠。
   *
   * 上面每个正则都要求「整句就是套话」，但**正则总有漏网的可能**。
   * 真人的实质结论恰恰爱用「总之/综上」起句说硬话，一旦误删，
   * 丢的是整篇最有价值的一句，而且用户看不出来（不是报错，是内容没了）。
   * 所以这里做一次量的校验：末段被削掉超过一半且剩下的不足 30 字，
   * 就认为这次剥离「伤到肉了」，回退保留原文 —— 宁可留一句套话，
   * 也不要丢掉作者的结论。
   */
  if (last.trim().length > 0 && out.length < last.trim().length * 0.5 && out.length < 30) {
    return text;
  }

  blocks[blocks.length - 1] = out;
  return blocks.join("\n\n").trim();
}

export async function draftAnswer(
  skill: Skill,
  question: string,
  useZhida: boolean,
  siblings: Skill[] = [],
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
    { role: "system" as const, content: systemPromptFor(skill, siblings) },
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
  "1. 每位答主只写一段，100–220 字，用他自己的口吻 —— 不是「一个理性的人在讲道理」。",
  "2. 只能针对对方已经说过的内容回应，不允许引入新的数字、机构、年份。",
  "3. 可以锋利，可以不同意，但必须讲道理。",
  "4. 不要写 Markdown，不要分点。",
  "5. 两个人的语气、句长、标点习惯必须明显不同；遮住名字要能认出是谁在说。",
  "6. 不要在结尾总结或致谢，说完就走。",
  "最常犯的错是两边都写成「我理解你的观点，但是……」这种礼貌辩论腔 —— 绝对不要。",
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
  const voices = [debateVoiceLine(a), debateVoiceLine(b)].filter(Boolean);
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
    ...(voices.length > 0 ? ["【两人的语言指纹 · 回应时必须各自守住】", ...voices, ""] : []),
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
    const body = stripClosing(
      parts[i + 1]
        .replace(/^#{1,6}\s*/gm, "")
        .replace(/\*\*(.+?)\*\*/g, "$1")
        .replace(/^-{3,}$/gm, "")
        .trim(),
    );
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

async function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      p,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error("timeout")), ms);
      }),
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
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
