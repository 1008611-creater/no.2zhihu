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
export type PersonaFailure = "config" | "search_failed" | "no_match" | "no_valid_content" | "model_failed" | "invalid_format";

export interface DistilledPersona {
  persona: Persona;
  /** 实际命中该作者本人的条数 */
  matched: number;
  /** 检索到的总条数（用于解释为什么命中少） */
  scanned: number;
  confidence: PersonaConfidence;
  validSamples?: number;
  failureReason?: PersonaFailure;
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
    return fallback(handle, name, accent, 0, 0, "服务端未配置知乎开放平台凭证，无法现场蒸馏人格。", [], "config");
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
    return fallback(handle, name, accent, 0, 0, "检索失败，暂时无法确认这位答主的公开内容。请稍后重试。", [], "search_failed");
  }

  const mine = items.filter((i) => authoredBy(i, handle, name));
  const sources = mine
    .filter((i) => (i.ContentText ?? "").trim().length >= MIN_EXCERPT && /^https?:\/\//i.test(i.Url ?? ""))
    .slice(0, 5)
    .map(toSource);

  const confidence: PersonaConfidence = sources.length >= 4 ? "high" : sources.length >= 2 ? "medium" : "low";

  if (sources.length === 0) {
    const why = mine.length > 0 ? "命中 " + mine.length + " 条同名作者内容，但正文过短或缺少可核对的来源链接" :
      items.length === 0
        ? "检索没有返回任何结果"
        : "检索到 " + items.length + " 条内容，但没有一条作者是「" + name + "」本人";
    return fallback(handle, name, accent, mine.length, items.length, why + "。可换一位答主或稍后重试。", [], mine.length ? "no_valid_content" : "no_match");
  }

  // 用直答把命中的原文抽成四要素。失败则退回低置信度人格，仍然标注真实命中条数。
  try {
    const raw = await zhidaText([
      { role: "system", content: DISTILL_PROMPT },
      { role: "user", content: distillMaterial(sources) },
    ]);
    let parsed = parseDistill(raw);
    if (!parsed) {
      // 重试一次：**重发原始材料**，而不是把上一次的输出丢回去让它「修格式」。
      //
      // 原实现（content: raw.slice(0, 4000)）对实测的失败形态是死路，原因有二：
      //   ① 失败形态是模型输出了**完全不同的 schema** —— 一份信源评估报告
      //      （键名是「信源结构」「权威性得分」），里面没有任何人格字段可「修」；
      //   ② 原提示词要求「缺失信息留空」，而 parseDistill 要求 knows 非空 ——
      //      两条约束互相矛盾，即使格式修对了也过不了解析。
      // 重发材料才是真正的第二次机会：模型重新看到原文，且这次带着更强的指令。
      //
      // 另：这条失败是上游偶发行为（同一条 messages 时好时坏，实测已确认），
      // 不是提示词结构问题，所以不要试图从提示词措辞上根治它。
      const repaired = await zhidaText([
        {
          role: "system",
          content:
            DISTILL_PROMPT +
            "\n再次强调：不要评估信源质量、不要打分、不要输出「信源结构」「权威性」这类字段。" +
            "你只描述这位作者的写作与认知特征。",
        },
        { role: "user", content: distillMaterial(sources) },
      ]);
      parsed = parseDistill(repaired);
      if (!parsed) return fallback(handle, name, accent, mine.length, items.length,
        "模型两次都没有按要求返回人格 JSON。实测这是上游偶发行为（同一条请求时好时坏），来源已保留，可稍后重试。", sources, "invalid_format");
    }

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
        corpus: { sampleSize: sources.length, capturedAt: new Date().toISOString(), real: true, sources, status: "extracted" },
      },
      matched: mine.length,
      scanned: items.length,
      confidence,
      validSamples: sources.length,
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
      "model_failed",
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
  failureReason?: PersonaFailure,
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
      corpus: { sampleSize: sources.length, capturedAt: new Date().toISOString(), real: false, sources, status: "unavailable", note },
    },
    matched,
    scanned,
    confidence: "low",
    validSamples: sources.length,
    failureReason,
    note,
    sources,
  };
}

/**
 * 把待分析的回答片段包成「材料」，并在末尾重申输出格式。
 *
 * 为什么必须这么写（2026-09-15 线上实测，同一输入复现 2/2）：
 *   原实现把 `[n] 标题 + 摘要` 直接拼起来当 user message 发出去，模型把
 *   **标题当成了要回答的问题**、把材料当成了「要作答的内容」，
 *   于是输出了一篇针对该话题的分析文章 —— 全文**一个花括号都没有**，
 *   `parseDistill` 只能判 invalid_format。
 *   这不是抽 JSON 不够健壮的问题，是提示词没把「材料」与「任务」分开。
 *
 * 三处修正：① 用分隔标记把材料框住；② 明说「这是材料，不是要你回答的问题」；
 *   ③ 在材料**之后**重申输出格式 —— 离输出最近的位置，模型最不容易忽略。
 */
function distillMaterial(sources: SkillSource[]): string {
  const body = sources
    .map((s, i) => "[" + (i + 1) + "] " + s.title + "\n" + s.excerpt)
    .join("\n\n");
  return [
    "【待分析的原文片段 · 开始】",
    body,
    "【待分析的原文片段 · 结束】",
    "",
    "以上只是**分析材料**，不是要你回答的问题。不要解释、不要评论、不要总结这些内容讨论的话题。",
    "你的唯一输出是一个 JSON 对象：第一个字符是 {，最后一个字符是 }，中间不要有任何其他文字或 Markdown 标记。",
  ].join("\n");
}

const DISTILL_PROMPT = [
  "你是一个写作风格分析器。你的唯一任务：从待分析的原文片段里提取**这位答主的写作与认知特征**。",
  "⚠️ 不要回答、不要评论、不要总结片段里讨论的话题 —— 那些内容只是分析材料，不是问题。",
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

/**
 * 从模型输出里抽出第一个**括号配平**的 JSON 对象。
 *
 * 不能用 `indexOf("{")` + `lastIndexOf("}")`：提示词本身含一份 JSON 模板，
 * 模型一旦先复述模板再给答案（或前后带一段说明），首尾各取一个括号就会把
 * 多段内容一起截进来，`JSON.parse` 必失败。
 * 先剥围栏代码块，再按括号配平扫描 —— 字符串内部的括号（含转义）不参与计数。
 */
function extractJsonObject(raw: string): string | null {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const text = fenced ? fenced[1] : raw;
  const start = text.indexOf("{");
  if (start < 0) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}

/** 提示词里的占位符文本。模型偶尔会把模板原样复述回来，那不是人格数据。 */
const TEMPLATE_MARKERS = [
  "他熟悉的领域/经历",
  "一句话身份",
  "他明确不装懂的范围",
  "short|medium|long|mixed",
  "他怎么举例",
];

function parseDistill(raw: string): ParsedDistill | null {
  const json = extractJsonObject(raw);
  if (!json) return null;
  // 复述模板比解析失败更危险 —— 它会静默造出一个由占位符组成的人格。
  if (TEMPLATE_MARKERS.some((m) => json.includes(m))) return null;

  let obj: Record<string, unknown>;
  try {
    obj = JSON.parse(json) as Record<string, unknown>;
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
