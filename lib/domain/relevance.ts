/**
 * 证据相关性硬过滤（纯函数，零模型、零额度、可复现）。
 *
 * 为什么必须有这一层（2026-09-15 实测取证）：
 *
 *   问题「30 岁从大厂转行做独立开发，值得吗？」路由到「贱贱」（力学答主）时，
 *   检索回来的 7 条证据全部是「力学专业有多难学，就业前景如何？」
 *   「力学专业的出路在哪？」—— 与问题相关性量级上约等于零。
 *   模型自己也在正文里吐槽了这件事：
 *     「你给我塞的『知乎证据』全是力学专业劝退帖……显然，这是检索环节出了点问题」。
 *
 *   更关键的是连锁反应：**证据跑题 → 模型无事实可依 → 只能落回 GPT 的
 *   通用结构硬写一篇通顺文章**。所以「像 GPT 直答」不完全是提示词问题，
 *   检索质量不过关是它的上游原因之一。
 *
 * 解法分两步，对应老大的决策「加相关性硬过滤 + 无相关证据时如实降级」：
 *   1. 本文件：先用确定性规则把跑题证据筛掉（不花任何额度）。
 *   2. 筛完为空 → 上层不生成正文，如实说明「这个问题没有对口的本人内容」。
 *
 * 判据刻意保守：宁可留下一条弱相关的，也不要错杀 —— 因为筛空的代价是
 * 这段回答直接没有内容。所以只拦「明显不同题」的，不追求精确排序。
 */

import type { SkillSource } from "./types";

/** 中文虚词与问句词，不携带主题信息，参与匹配只会增加噪音。 */
const STOPWORDS = new Set([
  "如何", "怎么", "怎样", "什么", "为什么", "哪些", "哪个", "是否", "是不是",
  "该不该", "有没有", "能不能", "要不要", "值得", "值得吗", "请问", "大家",
  "今年", "现在", "最近", "目前", "真的", "到底", "可以", "应该", "需要",
  "这个", "那个", "这种", "那种", "一个", "一些", "哪些", "我们", "你们",
  "他们", "自己", "还是", "或者", "但是", "因为", "所以", "如果", "就是",
  "没有", "不是", "很多", "特别", "非常", "比较", "以及", "还有", "问题",
  "回答", "知乎", "感觉", "觉得", "认为", "知道", "了解",
]);

/** 直接切开：中文按字，英文/数字按词。 */
function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\u4e00-\u9fa5a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** 中文二字切片 + 英文整词。 */
function tokens(text: string): string[] {
  const out: string[] = [];
  const norm = normalize(text);
  for (const chunk of norm.split(" ")) {
    if (!chunk) continue;
    if (/^[a-z0-9]+$/.test(chunk)) {
      if (chunk.length >= 2) out.push(chunk);
      continue;
    }
    // 中文：切二字组，跳过含虚词的组
    for (let i = 0; i + 1 < chunk.length; i++) {
      const g = chunk.slice(i, i + 2);
      if (STOPWORDS.has(g)) continue;
      out.push(g);
    }
  }
  return Array.from(new Set(out));
}

/**
 * 主题词组：连续的中文串 + 英文词。
 *
 * 与二字切片互补 —— 切片能容忍「大厂转行」vs「大厂转型」这类换字，
 * 而词组能抓到「独立开发」「咨询工程师」这类成词概念。两者取并集召回更高。
 */
function phrases(text: string): string[] {
  const norm = normalize(text);
  const out: string[] = [];
  for (const chunk of norm.split(" ")) {
    if (!chunk || chunk.length < 2) continue;
    if (/^[a-z0-9]+$/.test(chunk)) {
      out.push(chunk);
      continue;
    }
    // 中文长串切成 3–4 字滑窗，作为一种中等粒度的召回
    if (chunk.length >= 3) {
      for (let i = 0; i + 3 <= chunk.length; i++) {
        const g = chunk.slice(i, i + 3);
        if (STOPWORDS.has(g.slice(0, 2)) || STOPWORDS.has(g.slice(1))) continue;
        out.push(g);
      }
    }
  }
  return Array.from(new Set(out));
}

export interface RelevanceVerdict {
  /** 相关度 0–1 */
  score: number;
  /** 命中的主题词（用于解释为什么判定为相关） */
  hits: string[];
  /** true = 明显跑题，应当丢弃 */
  offTopic: boolean;
}

/**
 * 判定一条证据与问题的相关度。
 *
 * 打分方式刻意简单且可解释：
 *   - 英文/数字整词命中：高权重（「GPU」「2024」这类几乎不会误命中）
 *   - 中文二字切片命中：低权重（基数大，容易误命中）
 *   - 三字词组命中：中权重
 *
 * 阈值取 0.12 的低线：**只拦明显不同题的**。一条证据只有在几乎不含
 * 问题里任何主题词时才会被判跑题，避免把弱相关的有用材料错杀。
 */
export function scoreRelevance(question: string, source: SkillSource): RelevanceVerdict {
  const hay = normalize(source.title + " " + source.excerpt);
  if (!hay) return { score: 0, hits: [], offTopic: true };

  const qTokens = tokens(question);
  const qPhrases = phrases(question);
  const qWords = normalize(question)
    .split(" ")
    .filter((w) => /^[a-z0-9]+$/.test(w) && w.length >= 2);

  const hits = new Set<string>();
  let score = 0;

  for (const w of qWords) {
    if (hay.includes(w)) {
      score += 0.3;
      hits.add(w);
    }
  }
  for (const p of qPhrases) {
    if (hay.includes(p)) {
      score += 0.12;
      hits.add(p);
    }
  }
  for (const t of qTokens) {
    if (hay.includes(t)) {
      score += 0.03;
      hits.add(t);
    }
  }

  // 归一化：问题越长，越容易偶然命中，所以要按问题规模缩放。
  const denom = Math.max(qWords.length * 0.3 + qPhrases.length * 0.12 + qTokens.length * 0.03, 0.3);
  const normalized = Math.min(Number((score / denom).toFixed(3)), 1);

  return {
    score: normalized,
    hits: Array.from(hits).slice(0, 6),
    // 一个主题词都没命中 = 明显跑题。命中任一个就留下（保守）。
    offTopic: hits.size === 0,
  };
}

export interface FilterResult {
  /** 通过相关性过滤的证据，按相关度降序 */
  kept: SkillSource[];
  /** 被判跑题而丢弃的条数 */
  dropped: number;
  /** 原始条数 */
  scanned: number;
  /** 是否筛空了（上层据此走诚实降级） */
  empty: boolean;
}

/**
 * 批量过滤。
 *
 * @param question 用户的问题原文（主题词的唯一来源）
 * @param sources  检索回来的证据
 * @param minKeep  至少保留几条。相关证据不足时，从被丢的里按分数回补 ——
 *                 宁可给一条弱相关的，也不要让这一位答主完全空手。
 */
export function filterEvidence(
  question: string,
  sources: SkillSource[],
  minKeep = 0,
): FilterResult {
  const scored = sources.map((s) => ({ s, v: scoreRelevance(question, s) }));
  const kept = scored.filter((x) => !x.v.offTopic);
  const droppedList = scored
    .filter((x) => x.v.offTopic)
    .sort((a, b) => b.v.score - a.v.score);

  if (kept.length < minKeep) {
    kept.push(...droppedList.slice(0, minKeep - kept.length));
  }

  kept.sort((a, b) => b.v.score - a.v.score);

  return {
    kept: kept.map((x) => x.s),
    dropped: Math.max(sources.length - kept.length, 0),
    scanned: sources.length,
    empty: kept.length === 0,
  };
}
