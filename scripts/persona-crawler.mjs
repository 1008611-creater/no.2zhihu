#!/usr/bin/env node
/**
 * 知乎答主回答抓取（本地离线，一次性）。
 *
 * 用途：把预置答主的真实公开回答抓下来，供 distill-personas.mjs 蒸馏成
 * lib/domain/personas/<handle>.ts 里的人格四要素。
 *
 * 实现思路来自 zhihubackup 的 backup.py + RSSHub 的 x-zse-96 实现：
 *   1. 打 /api/v3/moments/{username}/activities?desktop=true 分页拉动态；
 *   2. 只保留 author.url_token === username 的回答（过滤掉转发与别人内容）；
 *   3. 请求头带 cookie + x-api-version + x-zse-93 + x-zse-96 签名。
 *
 * ⚠️ 合规说明（必读）
 *   知乎官方制作指南明确禁止批量爬取、滥用用户数据。本脚本仅供参赛团队
 *   本地一次性取样使用：原始语料写入 .personas-raw/（已 gitignore），
 *   不入公开仓库；蒸馏产物只保留特征与少量短引用，不存大段原文。
 *
 * 用法：
 *   $env:ZHIHU_COOKIE = "d_c0=...; z_c0=..."
 *   node scripts/persona-crawler.mjs                 # 抓名册里的 6 位
 *   node scripts/persona-crawler.mjs ban-fo-xian-ren # 只抓某一位
 */

import { mkdirSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import crypto from "node:crypto";

import { encrypt } from "./zhihu-zse.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const OUT_DIR = join(ROOT, ".personas-raw");

/** 默认名册：跨领域、风格反差最大化。失败即跳过，不阻塞其他答主。 */
const DEFAULT_HANDLES = [
  "ban-fo-xian-ren", // 半佛仙人 · 商业毒舌
  "zhang-jia-wei",   // 张佳玮 · 文学长句
  "splitter",        // 贱贱 · 物理玩梗
  "li-song-wei",     // 李松蔚 · 心理专业
  "da-meng",         // 大猛 · 制造业硬核
  "chen-zhang-yu",   // 陈章鱼 · 读书知识整理
];

/** 每位答主目标条数。30 条足够蒸馏出稳定的四要素。 */
const TARGET = 30;
const PAGE_LIMIT = 20;
const MAX_PAGES = 12;
const API_VERSION = "3.0.91";
const ZSE_93 = "101_3_3.0";

const COOKIE = process.env.ZHIHU_COOKIE ?? "";
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

function dc0FromCookie(cookie) {
  const m = cookie.match(/(?:^|;\s*)d_c0=([^;]+)/);
  return m ? m[1] : "";
}

function md5(s) {
  return crypto.createHash("md5").update(s).digest("hex");
}

/** 按知乎 Web 端的算法生成 x-zse-96 签名头。 */
function signedHeaders(apiPathWithQuery) {
  const dc0 = dc0FromCookie(COOKIE);
  return {
    "x-api-version": API_VERSION,
    "x-zse-93": ZSE_93,
    "x-zse-96": "2.0_" + encrypt(md5(ZSE_93 + "+" + apiPathWithQuery + "+" + dc0)),
    "x-app-za": "OS=Web",
  };
}

/** 把 HTML 正文清成纯文本：去掉标签、实体与多余空行。 */
function stripHtml(html) {
  if (!html) return "";
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

async function fetchPage(username, offset) {
  const path =
    "/api/v3/moments/" +
    encodeURIComponent(username) +
    "/activities?limit=" + PAGE_LIMIT +
    "&offset=" + offset +
    "&desktop=true&ws_qiangzhisafe=0";

  const res = await fetch("https://www.zhihu.com" + path, {
    headers: {
      accept: "application/json, text/plain, */*",
      "accept-language": "zh-CN,zh;q=0.9",
      cookie: COOKIE,
      referer: "https://www.zhihu.com/people/" + username + "/activities",
      "user-agent": UA,
      ...signedHeaders(path),
    },
  });

  if (res.status === 401 || res.status === 403) {
    throw new Error(
      "HTTP " + res.status + "：登录态无效或已过期，请重新复制 ZHIHU_COOKIE（需含 d_c0 与 z_c0）。",
    );
  }
  if (!res.ok) throw new Error("HTTP " + res.status);
  return res.json();
}

/** 只保留这位答主本人写的回答，其他人 / 转发 / 想法一律丢弃。 */
function pickAnswers(data, username) {
  const out = [];
  for (const item of data ?? []) {
    const t = item?.target;
    if (!t || t.type !== "answer") continue;
    const token = t.author?.url_token;
    if (token !== username) continue;
    const content = stripHtml(t.content);
    if (content.length < 80) continue; // 太短的没有蒸馏价值
    out.push({
      id: String(t.id),
      question: t.question?.title ?? "",
      questionId: t.question?.id ?? "",
      author: t.author?.name ?? username,
      voteUp: t.voteup_count ?? t.vote_up_count ?? 0,
      commentCount: t.comment_count ?? 0,
      createdTime: t.created_time ?? t.updated_time ?? 0,
      content,
    });
  }
  return out;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function crawlOne(username) {
  const dir = join(OUT_DIR, username);
  mkdirSync(dir, { recursive: true });

  const collected = [];
  const seen = new Set();
  let offset = 0;

  for (let page = 0; page < MAX_PAGES; page++) {
    let data;
    try {
      data = await fetchPage(username, offset);
    } catch (e) {
      console.error("  [" + username + "] 第 " + (page + 1) + " 页失败：" + e.message);
      break;
    }
    if (!Array.isArray(data) || data.length === 0) break;

    const answers = pickAnswers(data, username);
    for (const a of answers) {
      if (seen.has(a.id)) continue;
      seen.add(a.id);
      collected.push(a);
    }
    console.log(
      "  [" + username + "] 第 " + (page + 1) + " 页：拉到 " + data.length +
      " 条动态，其中本人回答 " + answers.length + " 条，累计 " + collected.length,
    );

    if (collected.length >= TARGET) break;
    if (data.length < PAGE_LIMIT) break;

    offset += PAGE_LIMIT;
    await sleep(1200 + Math.random() * 800); // 限速，避免触发风控
  }

  const final = collected.slice(0, TARGET);
  for (const a of final) {
    const header =
      "问题：" + a.question + "\n" +
      "链接：https://www.zhihu.com/question/" + a.questionId + "/answer/" + a.id + "\n" +
      "作者：" + a.author + "\n" +
      "赞同：" + a.voteUp + "｜评论：" + a.commentCount + "\n" +
      "时间：" + (a.createdTime ? new Date(a.createdTime * 1000).toISOString() : "未知") + "\n" +
      "---\n";
    writeFileSync(join(dir, a.id + ".txt"), header + a.content, "utf8");
  }

  const meta = {
    handle: username,
    capturedAt: new Date().toISOString(),
    sampleSize: final.length,
    answers: final.map((a) => ({
      id: a.id,
      question: a.question,
      url: "https://www.zhihu.com/question/" + a.questionId + "/answer/" + a.id,
      voteUp: a.voteUp,
    })),
  };
  writeFileSync(join(dir, "_meta.json"), JSON.stringify(meta, null, 2), "utf8");
  return final.length;
}

async function main() {
  if (!COOKIE) {
    console.error(
      "缺少 ZHIHU_COOKIE。\n" +
      "请在浏览器登录知乎后，从开发者工具复制完整 Cookie（至少含 d_c0 与 z_c0），例如：\n" +
      '  $env:ZHIHU_COOKIE = "d_c0=...; z_c0=..."',
    );
    process.exit(1);
  }
  if (!dc0FromCookie(COOKIE)) {
    console.error("Cookie 里没有 d_c0，x-zse-96 签名无法生成。请复制完整 Cookie。");
    process.exit(1);
  }

  const targets = process.argv.slice(2).filter((a) => !a.startsWith("-"));
  const handles = targets.length > 0 ? targets : DEFAULT_HANDLES;

  console.log("准备抓取 " + handles.length + " 位答主，每位目标 " + TARGET + " 条回答。");
  console.log("原始语料写入 " + OUT_DIR + "（已 gitignore，不入公开仓库）。\n");

  const summary = [];
  for (const h of handles) {
    console.log("→ " + h);
    try {
      const n = await crawlOne(h);
      summary.push({ handle: h, ok: n >= TARGET, count: n });
      console.log("  [" + h + "] 完成，共 " + n + " 条" + (n < TARGET ? "（不足目标，建议换人）" : "") + "\n");
    } catch (e) {
      summary.push({ handle: h, ok: false, count: 0, error: e.message });
      console.error("  [" + h + "] 失败：" + e.message + "\n");
    }
    await sleep(1500 + Math.random() * 1000);
  }

  console.log("=== 抓取结果 ===");
  for (const s of summary) {
    console.log(
      (s.ok ? "✓" : "✗") + " " + s.handle + "：" + s.count + " 条" + (s.error ? "（" + s.error + "）" : ""),
    );
  }
  const failed = summary.filter((s) => !s.ok).map((s) => s.handle);
  if (failed.length > 0) {
    console.log("\n未达标的答主：" + failed.join("、") + "，可在 lib/domain/personas/index.ts 里替换后重跑。");
  }
  console.log("\n下一步：node scripts/distill-personas.mjs");
}

main().catch((e) => {
  console.error("未捕获错误：" + e.message);
  process.exit(1);
});
