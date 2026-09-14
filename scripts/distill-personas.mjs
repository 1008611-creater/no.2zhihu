#!/usr/bin/env node
/**
 * 答主人格蒸馏（本地离线，一次性）。
 *
 * 输入：.personas-raw/<handle>/ 下的真实回答（由 persona-crawler.mjs 抓取）
 * 输出：lib/domain/personas/<handle>.ts（覆盖写入，corpus.real 变为 true）
 *
 * 做三件事：
 *   1. 把该答主的真实回答正文喂给直答，按固定 schema 抽四要素
 *      （知道什么 / 怎么看问题 / 怎么说话 / 不知道什么）；
 *   2. 从真实回答长度算出这位答主的字数区间，不再全站统一 180-320；
 *   3. 把抓取元数据写进 corpus，卡片上如实显示「基于 N 条真实回答蒸馏」。
 *
 * 合规：原始语料只在 .personas-raw/（已 gitignore），本脚本只把特征与少量短引用
 * 写进仓库，不复制大段原文。
 *
 * 用法：
 *   node scripts/distill-personas.mjs                     # 蒸馏全部已抓取的答主
 *   node scripts/distill-personas.mjs ban-fo-xian-ren      # 只蒸馏某一位
 */

import { readdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const RAW_DIR = join(ROOT, ".personas-raw");
const OUT_DIR = join(ROOT, "lib", "domain", "personas");

const DEFAULT_HANDLES = [
  "ban-fo-xian-ren",
  "zhang-jia-wei",
  "splitter",
  "li-song-wei",
  "da-meng",
  "chen-zhang-yu",
];

const ACCENT_CYCLE = ["orange", "violet", "blue", "green", "blue", "violet"];

/** 默认显示名。若人格文件里已有 displayName，则以文件为准。 */
const DEFAULT_DISPLAY = {
  "ban-fo-xian-ren": "半佛仙人",
  "zhang-jia-wei": "张佳玮",
  splitter: "贱贱",
  "li-song-wei": "李松蔚",
  "da-meng": "大猛",
  "chen-zhang-yu": "陈章鱼",
};

const API_BASE = "https://developer.zhihu.com";
const MODEL = process.env.ZHIHU_DISTILL_MODEL || "zhida-thinking-1p5";

/** 单条回答送进模型的正文上限，避免上下文过长被截断。 */
const PER_ANSWER_CHARS = 1400;
/** 整体语料上限，超出的回答按赞同数从高到低截断。 */
const TOTAL_CHARS = 26000;

function loadEnv() {
  const p = join(ROOT, ".env.local");
  if (!existsSync(p)) return;
  for (const line of readFileSync(p, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    if (process.env[m[1]] === undefined) {
      process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  }
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/** 解析一份抓取到的回答 txt：头部是元信息，--- 之后是正文。 */
function parseAnswerFile(text) {
  const sep = text.indexOf("\n---\n");
  const header = sep >= 0 ? text.slice(0, sep) : "";
  const body = sep >= 0 ? text.slice(sep + 5) : text;

  const pick = (label) => {
    const m = header.match(new RegExp("^" + label + "：(.*)$", "m"));
    return m ? m[1].trim() : "";
  };

  const url = pick("链接");
  const votes = parseInt(pick("赞同").split("｜")[0], 10);

  return {
    question: pick("问题"),
    url,
    voteUp: Number.isFinite(votes) ? votes : 0,
    body: body.trim(),
  };
}

function readCorpus(handle) {
  const dir = join(RAW_DIR, handle);
  if (!existsSync(dir)) return null;

  const files = readdirSync(dir).filter((f) => f.endsWith(".txt"));
  if (files.length === 0) return null;

  const items = [];
  for (const f of files) {
    const parsed = parseAnswerFile(readFileSync(join(dir, f), "utf8"));
    if (!parsed.body || parsed.body.length < 80) continue;
    parsed.id = f.replace(/\.txt$/, "");
    items.push(parsed);
  }
  if (items.length === 0) return null;

  items.sort((a, b) => b.voteUp - a.voteUp);

  let meta = null;
  const metaPath = join(dir, "_meta.json");
  if (existsSync(metaPath)) {
    try {
      meta = JSON.parse(readFileSync(metaPath, "utf8"));
    } catch {
      meta = null;
    }
  }

  return { items, meta };
}

const DISTILL_PROMPT = [
  "你是一个写作风格分析器。下面是一位知乎答主自己写的公开回答（按赞同数排序）。",
  "请只根据原文判断，不要脑补原文里没有的信息。",
  "只输出一行严格 JSON，不要 Markdown 代码块，不要任何解释：",
  "{",
  '  "headline": "一句话身份，20 字以内",',
  '  "knows": ["他熟悉的领域、经历、专业边界，3-5 条"],',
  '  "stance": ["他的价值判断、常见立场、思考路径，3-5 条"],',
  '  "tone": ["语气标签，3-5 个"],',
  '  "sentenceLength": "short|medium|long|mixed",',
  '  "usesLists": true,',
  '  "emotion": 0.5,',
  '  "exampleStyle": "他怎么举例，一句话",',
  '  "voiceSummary": "他怎么说话，100 字以内，能直接当写作指令用",',
  '  "doesNotKnow": ["他明确不装懂的范围，2-4 条"],',
  '  "catchphrases": ["口头禅，2-6 个，尽量直接取自原文"]',
  "}",
].join("\n");

async function callZhida(secret, userContent) {
  const res = await fetch(API_BASE + "/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: "Bearer " + secret,
      "X-Request-Timestamp": String(Math.floor(Date.now() / 1000)),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      stream: false,
      messages: [
        { role: "system", content: DISTILL_PROMPT },
        { role: "user", content: userContent },
      ],
    }),
  });

  const raw = await res.text();
  if (!res.ok) {
    throw new Error("直答 HTTP " + res.status + "：" + raw.slice(0, 200));
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("直答返回无法解析：" + raw.slice(0, 200));
  }
  const content = parsed?.choices?.[0]?.message?.content;
  if (typeof content !== "string" || !content.trim()) {
    throw new Error("直答返回空内容：" + raw.slice(0, 200));
  }
  return content.trim();
}

function asArray(v, max) {
  return Array.isArray(v)
    ? v.filter((x) => typeof x === "string" && x.trim().length > 0).map((x) => x.trim()).slice(0, max)
    : [];
}

function parseDistill(raw) {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) return null;

  let obj;
  try {
    obj = JSON.parse(raw.slice(start, end + 1));
  } catch {
    return null;
  }

  const knows = asArray(obj.knows, 5);
  const voiceSummary = typeof obj.voiceSummary === "string" ? obj.voiceSummary.trim() : "";
  if (knows.length === 0 || !voiceSummary) return null;

  const len = obj.sentenceLength;
  const sentenceLength =
    len === "short" || len === "medium" || len === "long" || len === "mixed" ? len : "mixed";

  const emotion = typeof obj.emotion === "number" ? Math.min(Math.max(obj.emotion, 0), 1) : 0.5;

  return {
    headline: typeof obj.headline === "string" ? obj.headline.trim().slice(0, 24) : "",
    knows,
    stance: asArray(obj.stance, 5),
    tone: asArray(obj.tone, 5),
    sentenceLength,
    usesLists: obj.usesLists === true,
    emotion,
    exampleStyle: typeof obj.exampleStyle === "string" ? obj.exampleStyle.trim() : "未知",
    voiceSummary,
    doesNotKnow: asArray(obj.doesNotKnow, 4),
    catchphrases: asArray(obj.catchphrases, 6),
  };
}

/** 用真实回答长度算出这位答主的字数区间：取分位数，夹到 80-600。 */
function wordRangeFor(items) {
  const lens = items.map((i) => i.body.length).sort((a, b) => a - b);
  const at = (q) => lens[Math.min(lens.length - 1, Math.max(0, Math.floor(q * (lens.length - 1))))];
  const lo = Math.max(80, Math.min(600, Math.round(at(0.25) / 10) * 10));
  const hi = Math.max(lo + 60, Math.min(600, Math.round(at(0.9) / 10) * 10));
  return [lo, hi];
}

function tsString(s) {
  return JSON.stringify(String(s));
}

function tsStringArray(arr, indent) {
  if (arr.length === 0) return "[]";
  const pad = " ".repeat(indent + 2);
  return (
    "[\n" +
    arr.map((s) => pad + tsString(s) + ",").join("\n") +
    "\n" + " ".repeat(indent) + "]"
  );
}

function existingDisplayName(handle) {
  const p = join(OUT_DIR, handle + ".ts");
  if (existsSync(p)) {
    const m = readFileSync(p, "utf8").match(/displayName:\s*"([^"]+)"/);
    if (m) return m[1];
  }
  return DEFAULT_DISPLAY[handle] || handle;
}

function existingAccent(handle, index) {
  const p = join(OUT_DIR, handle + ".ts");
  if (existsSync(p)) {
    const m = readFileSync(p, "utf8").match(/accent:\s*"(blue|violet|green|orange)"/);
    if (m) return m[1];
  }
  return ACCENT_CYCLE[index % ACCENT_CYCLE.length];
}

function buildTs(handle, displayName, accent, d, corpus) {
  const lines = [];
  lines.push('import type { Persona } from "../types";');
  lines.push("");
  lines.push("/**");
  lines.push(" * " + displayName + "｜" + (d.headline || "知乎答主"));
  lines.push(" *");
  lines.push(" * 本文件由 scripts/distill-personas.mjs 从真实公开回答蒸馏生成，请勿手工大改。");
  lines.push(" * 重跑数据管线（crawler → distill）会覆盖本文件。");
  lines.push(" * 原始语料只在 .personas-raw/（已 gitignore），这里只保留特征与少量短引用。");
  lines.push(" */");
  lines.push("export const persona: Persona = {");
  lines.push("  handle: " + tsString(handle) + ",");
  lines.push("  displayName: " + tsString(displayName) + ",");
  lines.push("  headline: " + tsString(d.headline || "知乎答主") + ",");
  lines.push("  accent: " + tsString(accent) + ",");
  lines.push("  knows: " + tsStringArray(d.knows, 2) + ",");
  lines.push("  stance: " + tsStringArray(d.stance, 2) + ",");
  lines.push("  voice: {");
  lines.push("    sentenceLength: " + tsString(d.sentenceLength) + ",");
  lines.push("    wordRange: [" + corpus.wordRange[0] + ", " + corpus.wordRange[1] + "],");
  lines.push("    tone: " + tsStringArray(d.tone, 4) + ",");
  lines.push("    usesLists: " + (d.usesLists ? "true" : "false") + ",");
  lines.push("    emotion: " + d.emotion + ",");
  lines.push("    exampleStyle: " + tsString(d.exampleStyle) + ",");
  lines.push("    summary: " + tsString(d.voiceSummary) + ",");
  lines.push("  },");
  lines.push("  doesNotKnow: " + tsStringArray(d.doesNotKnow, 2) + ",");
  lines.push("  catchphrases: " + tsStringArray(d.catchphrases, 2) + ",");
  lines.push("  corpus: {");
  lines.push("    sampleSize: " + corpus.sampleSize + ",");
  lines.push("    capturedAt: " + tsString(corpus.capturedAt) + ",");
  lines.push("    real: true,");
  lines.push("    sources: [");
  for (const s of corpus.sources) {
    lines.push("      {");
    lines.push("        title: " + tsString(s.title) + ",");
    lines.push("        author: " + tsString(displayName) + ",");
    lines.push("        url: " + tsString(s.url) + ",");
    lines.push("        excerpt: " + tsString(s.excerpt) + ",");
    lines.push("        voteUp: " + s.voteUp + ",");
    lines.push("        editTime: " + s.editTime + ",");
    lines.push("        confidence: " + s.confidence + ",");
    lines.push("      },");
  }
  lines.push("    ],");
  lines.push("  },");
  lines.push("};");
  lines.push("");
  return lines.join("\n");
}

function buildCorpus(items, meta) {
  let used = [];
  let total = 0;
  for (const it of items) {
    const snippet = it.body.slice(0, PER_ANSWER_CHARS);
    if (total + snippet.length > TOTAL_CHARS && used.length > 0) break;
    used.push(it);
    total += snippet.length;
  }

  const sources = used.slice(0, 5).map((it) => ({
    title: it.question || "（无标题）",
    url: it.url,
    excerpt: it.body.replace(/\s+/g, " ").slice(0, 180),
    voteUp: it.voteUp,
    editTime: 0,
    confidence: 0.9,
  }));

  return {
    used,
    sampleSize: items.length,
    capturedAt: (meta && meta.capturedAt) || new Date().toISOString(),
    wordRange: wordRangeFor(items),
    sources,
  };
}

async function distillOne(handle, index, secret) {
  const corpus = readCorpus(handle);
  if (!corpus) {
    console.log("  跳过 " + handle + "：.personas-raw/" + handle + "/ 里没有可用回答（先跑 crawler）。");
    return { handle, ok: false, reason: "no-corpus" };
  }

  const built = buildCorpus(corpus.items, corpus.meta, handle);

  const userContent =
    "答主：" + handle + "\n" +
    "共 " + corpus.items.length + " 条回答，以下为按赞同数排序的节选：\n\n" +
    built.used
      .map((it, i) => "[" + (i + 1) + "] 问题：" + (it.question || "（无标题）") + "（赞同 " + it.voteUp + "）\n" + it.body.slice(0, PER_ANSWER_CHARS))
      .join("\n\n---\n\n");

  let raw;
  try {
    raw = await callZhida(secret, userContent);
  } catch (e) {
    console.log("  失败 " + handle + "：" + e.message);
    return { handle, ok: false, reason: "zhida" };
  }

  const d = parseDistill(raw);
  if (!d) {
    console.log("  失败 " + handle + "：直答输出无法解析成四要素。");
    return { handle, ok: false, reason: "parse" };
  }

  const accent = existingAccent(handle, index);
  const displayName = existingDisplayName(handle);
  const ts = buildTs(handle, displayName, accent, d, built);
  writeFileSync(join(OUT_DIR, handle + ".ts"), ts, "utf8");

  console.log(
    "  完成 " + handle + "：基于 " + built.sampleSize + " 条真实回答，" +
    "字数区间 " + built.wordRange[0] + "-" + built.wordRange[1] + "。",
  );
  return { handle, ok: true, sampleSize: built.sampleSize };
}

async function main() {
  loadEnv();
  const secret = process.env.ZHIHU_ACCESS_SECRET;
  if (!secret) {
    console.error("缺少 ZHIHU_ACCESS_SECRET（可写在 .env.local，或设为环境变量）。");
    process.exit(1);
  }

  const targets = process.argv.slice(2).filter((a) => !a.startsWith("-"));
  const handles = targets.length > 0 ? targets : DEFAULT_HANDLES;

  console.log("准备蒸馏 " + handles.length + " 位答主，模型 " + MODEL + "。");
  console.log("原始语料目录：" + RAW_DIR + "\n");

  const summary = [];
  for (let i = 0; i < handles.length; i++) {
    const h = handles[i];
    console.log("→ " + h);
    try {
      summary.push(await distillOne(h, i, secret));
    } catch (e) {
      summary.push({ handle: h, ok: false, reason: e.message });
    }
    await sleep(400);
  }

  console.log("\n=== 蒸馏结果 ===");
  for (const s of summary) {
    console.log((s.ok ? "✓" : "✗") + " " + s.handle + (s.ok ? "：" + s.sampleSize + " 条" : "（" + s.reason + "）"));
  }

  const done = summary.filter((s) => s.ok).length;
  if (done === 0) {
    console.log("\n没有一位答主蒸馏成功。请确认先跑过 crawler，且 .personas-raw/ 下有回答正文。");
  } else {
    console.log("\n已更新 " + done + " 位答主的人格文件，下一步：检查类型并提交。");
  }
}

main().catch((e) => {
  console.error("未捕获错误：" + e.message);
  process.exit(1);
});
