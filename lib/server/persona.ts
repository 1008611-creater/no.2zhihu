import "server-only";

import type { Accent, Persona, SkillSource } from "@/lib/domain/types";
import { hasCredentials, zhidaText, zhihuSearch } from "@/lib/zhihu/client";
import type { SearchItem } from "@/lib/zhihu/types";

/**
 * 在线人格蒸馏。
 *
 * 用途：用户在「邀请一个分身」里指定了一个**没有预置**的答主。
 * 我们不会假装认识他 —— 而是现场检索、只保留他本人写的内容、再蒸馏四要素。
 *
 * 铁律（这一条决定产品可信度）：
 *   - 必须如实返回命中条数（matched）。命中为 0 时 confidence = "low"，
 *     并在 UI 上明确写「未取到该答主本人内容，人格为低置信度」，绝不假装成功。
 *   - 只保留 AuthorName 与 handle/显示名严格匹配的条目，不拿别人讨论他的内容充数。
 *   - 蒸馏失败（直答不可用）时退回「仅统计特征」的低置信度人格，仍然如实标注。
 */

export type PersonaConfidence = "high" | "medium" | "low";

export interface DistilledPersona {
  persona: Persona;
  /** 实际命中该作者本人的条数 */
  matched: number;
  /** 检索到的总条数（用于解释为什么命中少） */
  scanned: number;
  confidence: PersonaConfidence;
  /** 面向用户的如实说明，直接显示 */
  note: string;
  /** 命中到的原文来源，卡片可逐条点开 */
  sources: SkillSource[];
}

const FETCH_LIMIT = 10;
const MIN_EXCERPT = 40;

/** handle → 昵称的规范化：知乎 handle 常见 - 与下划线，比较时统一去掉。 */
function normalize(s: string): string {
  return s.trim().toLowerCase().replace(/[\s_-]+/g, "");
}

/** 只保留作者确实是本人的条目。 */
function authoredBy(item: SearchItem, handle: string, displayName: string): boolean {
  const author = normalize(item.AuthorName ?? "");
  if (!author) return false;
  const h = normalize(handle);
  const d = normalize(displayName);
  return (h.length > 0 && author === h) || (d.length > 0 && author === d);
}

function toSource(item: SearchItem): SkillSource {
  return {
    title: item.Title ?? "（无标题）",
    author: item.AuthorName ?? "匿名用户",
    url: item.Url ?? "",
    excerpt: (item.ContentText ?? "").replace(/\s+/g, " ").slice(0, 220),
    voteUp: item.VoteUpCount ?? 0,
    editTime: item.EditTime ? (item.EditTime < 1e12 ? item.EditTime * 1000 : item.EditTime) : 0,
    confidence: (item.ContentText ?? "").trim().length >= MIN_EXCERPT ? 0.8 : 0.4,
  };
}

/**
 * 现场蒸馏一位答主。
 *
 * @param handle      知乎 url_token 或用户输入的标识
 * @param displayName 用户看到的昵称（可选，缺省用 handle）
 * @param topic       当前问题主题词，用于构造检索词，提高命中率
 */
export async function distillPersona(
  handle: string,
  displayName: string,
  topic: string,
): Promise<DistilledPersona> {
  const name = (displayName || handle).trim();
  const accent: Accent = "blue";

  if (!hasCredentials()) {
    return fallback(handle, name, accent, 0, 0, "服务端未配置知乎开放平台凭证，无法现场蒸馏人格。");
  }

  // 检索词刻意带上答主名字 + 主题：只靠名字会命中大量「别人讨论他」的内容。
  //
  // 实测（2026-09-14）：知乎搜索是**内容语义检索**，不是按作者检索。单一检索词
  // 命中率极低（张佳玮 0/30、马伯庸 0/20、采铜 0/30）。改成跑两个变体再按作者
  // 过滤后，实测命中从 0 提升到 1–3 条（李松蔚、半佛仙人、陈章鱼均可命中）。
  // 三个变体覆盖「主题+人」「纯人名」「人名+的回答」，实测取并集命中最高。
  // 代价是额度翻倍，但这条路径只在用户临时指定未预置答主时触发，属低频操作；
  // 合并时按 Url 去重，同一篇内容不会被计两次。
  const variants = topic && topic !== name ? [name + " " + topic, name, name + " 的回答"] : [name];
  const items: SearchItem[] = [];
  const seen = new Set<string>();
  let failedVariants = 0;
  for (const variant of variants) {
    try {
      const res = await zhihuSearch(variant, FETCH_LIMIT);
      for (const it of res.Items ?? []) {
        const key = it.Url || it.ContentID || it.Title;
        if (key && !seen.has(key)) {
          seen.add(key);
          items.push(it);
        }
      }
    } catch {
      // 单个变体失败不影响另一个；全部失败时才按「检索失败」如实返回。
      failedVariants++;
    }
  }

  if (items.length === 0 && failedVariants === variants.length) {
    return fallback(handle, name, accent, 0, 0, "检索失败，暂时无法确认这位答主的公开内容。");
  }

  const mine = items.filter((i) => authoredBy(i, handle, name));
  const sources = mine
    .filter((i) => (i.ContentText ?? "").trim().length >= MIN_EXCERPT)
    .slice(0, 5)
    .map(toSource);

  const confidence: PersonaConfidence = mine.length >= 4 ? "high" : mine.length >= 1 ? "medium" : "low";

  if (sources.length === 0) {
    const why =
      items.length === 0
        ? "检索没有返回任何结果"
        : "检索到 " + items.length + " 条内容，但没有一条作者是「" + name + "」本人";
    return fallback(handle, name, accent, 0, items.length, why + "。人格为低置信度。");
  }

  // 用直答把命中的原文抽成四要素。失败则退回低置信度人格，仍然标注真实命中条数。
  try {
    const raw = await zhidaText([
      { role: "system", content: DISTILL_PROMPT },
      {
        role: "user",
        content: sources
          .map((s, i) => "[" + (i + 1) + "] " + s.title + "\n" + s.excerpt)
          .join("\n\n"),
      },
    ]);
    const parsed = parseDistill(raw);
    if (!parsed) throw new Error("unparsable");

    return {
      persona: {
        handle,
        displayName: name,
        headline: parsed.headline || "知乎答主",
        accent,
        knows: parsed.knows,
        stance: parsed.stance,
        voice: {
          sentenceLength: parsed.sentenceLength,
          wordRange: [180, 420],
          tone: parsed.tone,
          usesLists: parsed.usesLists,
          emotion: parsed.emotion,
          exampleStyle: parsed.exampleStyle,
          summary: parsed.voiceSummary,
        },
        doesNotKnow: parsed.doesNotKnow,
        catchphrases: parsed.catchphrases,
        corpus: { sampleSize: sources.length, capturedAt: new Date().toISOString(), real: true, sources },
      },
      matched: mine.length,
      scanned: items.length,
      confidence,
      note:
        "现场蒸馏：" + variants.length + " 个检索词共取到 " + items.length + " 条，其中 " +
        mine.length + " 条作者是「" + name + "」本人，用 " + sources.length +
        " 条有正文的原文抽取人格。",
      sources,
    };
  } catch {
    return fallback(
      handle,
      name,
      accent,
      mine.length,
      items.length,
      "命中 " + mine.length + " 条本人内容，但直答暂时不可用，未能抽取完整人格，当前为低置信度。",
      sources,
    );
  }
}

/** 拿不到人格时如实返回一个「低置信度」占位，不编造特征。 */
function fallback(
  handle: string,
  displayName: string,
  accent: Accent,
  matched: number,
  scanned: number,
  note: string,
  sources: SkillSource[] = [],
): DistilledPersona {
  return {
    persona: {
      handle,
      displayName,
      headline: matched > 0 ? "知乎答主 · 现场蒸馏未完成" : "未取到本人内容的答主",
      accent,
      knows: [],
      stance: [],
      voice: {
        sentenceLength: "mixed",
        wordRange: [180, 420],
        tone: ["未知"],
        usesLists: false,
        emotion: 0.4,
        exampleStyle: "未知",
        summary:
          "没有取到足够的本人原文，无法确定写作特征。请按通用知乎回答口吻作答，并明确说明哪些地方缺少依据。",
      },
      doesNotKnow: ["所有无法从公开内容确认的细节"],
      catchphrases: [],
      corpus: { sampleSize: matched, capturedAt: new Date().toISOString(), real: false, sources },
    },
    matched,
    scanned,
    confidence: "low",
    note,
    sources,
  };
}

const DISTILL_PROMPT = [
  "你是一个写作风格分析器。下面是一位知乎答主自己的公开回答片段。",
  "只输出一行严格 JSON，不要 Markdown 代码块，不要解释：",
  "{",
  '  "headline": "一句话身份，20 字以内",',
  '  "knows": ["他熟悉的领域/经历，2-4 条"],',
  '  "stance": ["他的价值判断与思考路径，2-4 条"],',
  '  "tone": ["语气标签，2-4 个"],',
  '  "sentenceLength": "short|medium|long|mixed",',
  '  "usesLists": true,',
  '  "emotion": 0.5,',
  '  "exampleStyle": "他怎么举例，一句话",',
  '  "voiceSummary": "他怎么说话，80 字以内，能直接当写作指令用",',
  '  "doesNotKnow": ["他明确不装懂的范围，1-3 条"],',
  '  "catchphrases": ["口头禅，0-4 个，尽量取自原文"]',
  "}",
  "只根据原文判断，不要脑补原文里没有的信息。",
].join("\n");

interface ParsedDistill {
  headline: string;
  knows: string[];
  stance: string[];
  tone: string[];
  sentenceLength: Persona["voice"]["sentenceLength"];
  usesLists: boolean;
  emotion: number;
  exampleStyle: string;
  voiceSummary: string;
  doesNotKnow: string[];
  catchphrases: string[];
}

function parseDistill(raw: string): ParsedDistill | null {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) return null;

  let obj: Record<string, unknown>;
  try {
    obj = JSON.parse(raw.slice(start, end + 1)) as Record<string, unknown>;
  } catch {
    return null;
  }

  const arr = (v: unknown, max: number): string[] =>
    Array.isArray(v)
      ? v.filter((x): x is string => typeof x === "string" && x.trim().length > 0).slice(0, max)
      : [];

  const knows = arr(obj.knows, 4);
  const voiceSummary = typeof obj.voiceSummary === "string" ? obj.voiceSummary.trim() : "";
  if (knows.length === 0 || !voiceSummary) return null;

  const len = obj.sentenceLength;
  const sentenceLength: Persona["voice"]["sentenceLength"] =
    len === "short" || len === "medium" || len === "long" || len === "mixed" ? len : "mixed";

  const emotion = typeof obj.emotion === "number" ? Math.min(Math.max(obj.emotion, 0), 1) : 0.4;

  return {
    headline: typeof obj.headline === "string" ? obj.headline.trim().slice(0, 24) : "",
    knows,
    stance: arr(obj.stance, 4),
    tone: arr(obj.tone, 4),
    sentenceLength,
    usesLists: obj.usesLists === true,
    emotion,
    exampleStyle: typeof obj.exampleStyle === "string" ? obj.exampleStyle.trim() : "未知",
    voiceSummary,
    doesNotKnow: arr(obj.doesNotKnow, 3),
    catchphrases: arr(obj.catchphrases, 4),
  };
}

/** 把现场蒸馏的人格包成一个临时 Skill，供生成层直接使用。 */
export function skillFromDistilled(handle: string, d: DistilledPersona) {
  return {
    id: "persona:" + handle,
    name: d.persona.displayName,
    kind: "persona" as const,
    lens: d.persona.headline,
    query: "",
    keywords: d.persona.knows.slice(0, 4),
    tone: d.persona.voice.tone,
    accent: d.persona.accent,
    sources: d.sources,
    confidence: d.confidence === "high" ? 0.8 : d.confidence === "medium" ? 0.55 : 0.25,
    persona: d.persona,
  };
}
