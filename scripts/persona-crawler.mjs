#!/usr/bin/env node
/**
 * 知乎答主回答抓取（本地离线，一次性）。
 *
 * 用途：把预置答主的真实公开回答抓下来，供 distill-personas.mjs 蒸馏成
 * lib/domain/personas/<handle>.ts 里的人格四要素。
 *
 * 实现思路来自 zhihubackup 的 backup.py + RSSHub 的 x-zse-96 实现：
 *   1. 打 /api/v4/members/{username}/answers 分页拉**这位答主本人**的回答；
 *      若一条都没有（只发文章的答主，如蒋校长），自动改打 /articles；
 *   2. 逐条过滤：作者校验 + 正文长度，太短的丢弃；
 *   3. 请求头带 cookie + x-api-version + x-zse-93 + x-zse-96 签名。
 *
 * 2026-09-15 修正 A：原实现打的是 /api/v3/moments/{username}/activities（动态流），
 *   而该接口返回的是**分页信封** { data, paging } 而不是裸数组 —— 旧代码按数组
 *   处理，于是第一页就静默 break，一条都抓不到（实测张佳玮 0 条，2 秒结束）。
 *   改用 members/answers 后不仅拿到正文，还省掉了「从动态流里筛本人回答」这一步。
 *
 * 2026-09-15 修正 B：名册早期的 handle 是「想当然拼的」，指向的不是本人
 *   （陈兰香真身是 chen-lan-xiang-76：1257 回答 / 34.9 万关注，而 chen-lan-xiang
 *   只是一个 2 关注的空号）。这些假 ID 已全部换成知乎真实 url_token，并同步改了
 *   lib/domain/router.ts、public/square-library.json 与 mesh-selftest 里的引用。
 *   教训：抓之前必须先用搜索或 members/profile 核对 handle，否则会静默抓 0 条。
 *   另外「0 回答」不一定是 handle 错 —— 蒋校长 21 万关注但只发文章，所以加了文章兜底。
 *
 * ⚠️ 合规说明（必读）
 *   知乎官方制作指南明确禁止批量爬取、滥用用户数据。本脚本仅供参赛团队
 *   本地一次性取样使用：原始语料写入 .personas-raw/（已 gitignore），
 *   不入公开仓库；蒸馏产物只保留特征与少量短引用，不存大段原文。
 *
 * 用法（cookie 先用 .tools/zhihu-session.cjs 拿一次，之后长期有效）：
 *   node .tools/zhihu-session.cjs                    # 一次登录，导出 .personas-raw/.cookie.txt
 *   $env:ZHIHU_COOKIE = (Get-Content .personas-raw/.cookie.txt -Raw).Trim()
 *   node scripts/persona-crawler.mjs                 # 抓名册里的默认几位
 *   node scripts/persona-crawler.mjs banfoxianren  # 只抓某一位
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
  "banfoxianren",                 // 半佛仙人 · 商业毒舌
  "zhang-jia-wei",                // 张佳玮 · 文学长句
  "splitter",                     // 贱贱 · 科研体制内冷眼拆解
  "lisongwei",                    // 李松蔚 · 心理专业
  "da-meng-24-13",                // 大猛 · 体制内观察
  "ChenZhangyu",                  // 陈章鱼 · 读书知识整理
  "bing-deng-xing",               // 丙等星 · 育儿科技 NBA
  "cai-tong",                     // 采铜 · 认知心理学
  "chen-lan-xiang-76",            // 陈兰香 · 法律实务
  "dong-ji-zai-hang-zhou",        // 动机在杭州 · 亲密关系
  "jiangxiaozhang",               // 蒋校长 · 军事历史
  "li-lei-up",                    // 李雷 · 医学科普
  "mulianghai",                   // 赤戟 · 网文推书
  "pi-bo-shi-tai-kong-jing-niang", // 太空精酿 · 航天啤酒
  "shui-qian-xiao-xi",            // 马前卒 · 工程拆历史
  "wen-yi-fei-31",                // 温义飞 · 经济学热点
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

/**
 * 拉一页这位答主本人的内容（回答或文章）。
 *
 * 走 members/{answers,articles} 而不是 moments/activities：
 *   · moments/activities 是**动态流**，混着转发、文章、想法，还得自己按 author 过滤；
 *   · 它返回的是分页信封 { data, paging }，不是裸数组 —— 旧实现按数组处理，
 *     于是第一页就静默 break，一条都抓不到。
 *   · members/{answers,articles} 直接给本人的内容（带 content 正文），并有 paging.totals 总数。
 *
 * 这里统一把信封拆成裸数组再返回，调用方不必知道上游的信封结构。
 */
async function fetchPage(username, offset, kind) {
  const isArticle = kind === "articles";
  const include = encodeURIComponent(
    isArticle
      ? "data[*].content,title,voteup_count,comment_count,created_time,updated_time," +
          "author.name,author.url_token"
      : "data[*].content,voteup_count,comment_count,created_time,updated_time," +
          "question.title,question.id,author.name,author.url_token",
  );
  const path =
    "/api/v4/members/" +
    encodeURIComponent(username) +
    "/" + kind +
    "?limit=" + PAGE_LIMIT +
    "&offset=" + offset +
    // 按赞同数排序取，而不是按时间：语料要代表「这位答主最出名的写法」，
    // 最新几条往往只是碎片。⚠️ 上游不给 voteup_count（见下），只能靠它排序。
    "&sort_by=voteups&include=" + include;

  const res = await fetch("https://www.zhihu.com" + path, {
    headers: {
      accept: "application/json, text/plain, */*",
      "accept-language": "zh-CN,zh;q=0.9",
      cookie: COOKIE,
      referer: "https://www.zhihu.com/people/" + username + "/" + kind,
      "user-agent": UA,
      ...signedHeaders(path),
    },
  });

  if (res.status === 401 || res.status === 403) {
    throw new Error(
      "HTTP " + res.status + "：登录态无效或已过期。重跑 .tools/zhihu-session.cjs 登录一次即可。",
    );
  }
  if (!res.ok) throw new Error("HTTP " + res.status);

  const json = await res.json();
  if (json && json.need_force_login) {
    throw new Error("上游要求重新登录（need_force_login）。重跑 .tools/zhihu-session.cjs。");
  }
  return Array.isArray(json && json.data) ? json.data : [];
}

/**
 * 把上游条目整理成统一结构（回答与文章共用同一套字段）。
 *
 * members/{answers,articles} 已经只返回本人的内容，这里**仍保留作者校验做双保险** ——
 * 一旦上游改了行为，宁可少抓几条，也不能把别人的内容当成他的语料。
 *
 * question 字段对文章放的是**标题**：下游只把它当「话题标签」，语义一致。
 * url 在这里就算好，避免下游再按 kind 分支拼链接。
 */
function pickItems(items, username, kind) {
  const isArticle = kind === "articles";
  const out = [];
  for (const t of items ?? []) {
    if (!t) continue;
    const token = t.author?.url_token;
    if (token && token !== username) continue;
    const content = stripHtml(t.content);
    if (content.length < 80) continue; // 太短的没有蒸馏价值
    out.push({
      id: String(t.id),
      question: (isArticle ? t.title : t.question?.title) ?? "",
      url: isArticle
        ? "https://zhuanlan.zhihu.com/p/" + t.id
        : "https://www.zhihu.com/question/" + (t.question?.id ?? "") + "/answer/" + t.id,
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

/** 按 kind 分页拉取，直到攒够 TARGET 条或上游不再返回。 */
async function collect(username, kind) {
  const collected = [];
  const seen = new Set();
  let offset = 0;

  for (let page = 0; page < MAX_PAGES; page++) {
    let items;
    try {
      items = await fetchPage(username, offset, kind);
    } catch (e) {
      console.error("  [" + username + "] " + kind + " 第 " + (page + 1) + " 页失败：" + e.message);
      break;
    }
    if (items.length === 0) break;

    const picked = pickItems(items, username, kind);
    for (const a of picked) {
      if (seen.has(a.id)) continue;
      seen.add(a.id);
      collected.push(a);
    }
    console.log(
      "  [" + username + "] " + kind + " 第 " + (page + 1) + " 页：拉到 " + items.length +
      " 条，其中可用 " + picked.length + " 条，累计 " + collected.length,
    );

    if (collected.length >= TARGET) break;
    if (items.length < PAGE_LIMIT) break;

    offset += PAGE_LIMIT;
    await sleep(1200 + Math.random() * 800); // 限速，避免触发风控
  }
  return collected;
}

async function crawlOne(username) {
  const dir = join(OUT_DIR, username);
  mkdirSync(dir, { recursive: true });

  // 先抓回答；对「只发文章」的答主（回答恒为 0）再补一轮文章。
  let collected = await collect(username, "answers");
  let source = "回答";
  if (collected.length === 0) {
    console.log("  [" + username + "] 没有可用回答，改抓文章。");
    await sleep(1200);
    collected = await collect(username, "articles");
    source = "文章";
  }

  const final = collected.slice(0, TARGET);
  for (const a of final) {
    // ⚠️ 赞同数只有真拿到才写。members/answers 上游**不返回** voteup_count
    // （显式 include 也拿不到，实测 2026-09-15），此时 a.voteUp 是 0 —— 写进头部
    // 会被下游当成「这条回答 0 赞同」渲染到卡片上，比不写更糟。
    const header =
      "问题：" + a.question + "\n" +
      "链接：" + a.url + "\n" +
      "作者：" + a.author + "\n" +
      (a.voteUp > 0 ? "赞同：" + a.voteUp + "\n" : "") +
      (Number.isFinite(a.commentCount) ? "评论：" + a.commentCount + "\n" : "") +
      "时间：" + (a.createdTime ? new Date(a.createdTime * 1000).toISOString() : "未知") + "\n" +
      "---\n";
    writeFileSync(join(dir, a.id + ".txt"), header + a.content, "utf8");
  }

  const meta = {
    handle: username,
    // 语料来自回答还是文章 —— 卡片上要如实说明，不能让读者以为是回答
    source,
    capturedAt: new Date().toISOString(),
    sampleSize: final.length,
    items: final.map((a) => ({
      id: a.id,
      question: a.question,
      url: a.url,
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
