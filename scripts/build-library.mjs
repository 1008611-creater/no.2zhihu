#!/usr/bin/env node
/**
 * 广场镜像问题库 —— 把「已完成的镜像讨论组」预生成成一份静态 JSON。
 *
 * 消费端：components/square/FeedStream.tsx（首页与 /square 共用）。
 *   它 fetch `/square-library.json`，把条目还原成可载入工作台的镜像问题。
 *   改本文件的 slim() 必须同步改那边的 hydrate()，否则广场会出现空条目。
 *
 * 何时该用：演示现场如果想把广场做成「一大批已经做完的讨论组」而不是
 *   「一堆等着你去做的问题」——预生成后广场可秒开、无限翻页、不再耗额度。
 *   评价标准很简单：演示时会不会连着点开 10 个以上讨论组？会，就值得预生成。
 *
 * 为什么需要它：虚拟广场的核心应该是「一大批已经做完的讨论组」，
 * 而不是「一堆等着你去做的问题」。演示现场如果每一条都要现跑，
 * 既耗额度又看不了几条；预生成后广场是秒开、可无限翻的。
 *
 * 做法：直接调 lib/server/mirror 的 runMirror（不经过 HTTP），
 * 每个问题跑一遍真实流程（真实检索 + 直答生成），结果按 id 落盘。
 * 已存在的条目默认跳过 —— 重跑不会重复消耗额度。
 *
 * 用法：
 *   node scripts/build-library.mjs                 # 生成缺失的条目
 *   node scripts/build-library.mjs --force         # 全部重跑
 *   node scripts/build-library.mjs --only 3        # 只跑前 3 个（试跑）
 *   node scripts/build-library.mjs --no-zhida      # 只取证据，不调直答
 *
 * 额度提醒：每个问题消耗 N 次搜索 + N 次直答（N = 该问题命中的答主数，≤4）。
 * 直答额度 100/天，所以一次完整生成请控制在 15 个问题以内。
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const OUT = join(ROOT, "public", "square-library.json");

/* ------------------------------ 环境变量 ------------------------------ */

/** 从 .env.local / .env 里读服务端凭证；只写到 process.env，不落盘、不打印。 */
function loadEnv() {
  for (const name of [".env.local", ".env"]) {
    const p = join(ROOT, name);
    if (!existsSync(p)) continue;
    for (const raw of readFileSync(p, "utf8").split(/\r?\n/)) {
      const line = raw.trim();
      if (!line || line.startsWith("#")) continue;
      const eq = line.indexOf("=");
      if (eq < 0) continue;
      const k = line.slice(0, eq).trim();
      let v = line.slice(eq + 1).trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
        v = v.slice(1, -1);
      }
      if (!process.env[k]) process.env[k] = v;
    }
  }
}

loadEnv();

/* ------------------------------ 话题清单 ------------------------------ */

/**
 * 与 lib/domain/topics.ts 的 DISCUSSION_TOPICS 保持一致 ——
 * 广场上的讨论组就是这些话题，这里把它们做成「已经答完」的样子。
 * 改这里时同步改那边，否则广场会出现点进去空白的条目。
 */
const TOPICS = [
  "30 岁从大厂转行做独立开发，值得吗？",
  "孩子近视了，要不要立刻配离焦镜？",
  "小城市开一家咖啡店，真实成本和风险是什么？",
  "该不该借钱给亲戚？借了不还怎么办？",
  "考研三年没上岸，还要不要继续？",
  "父母执意要买保健品，怎么劝？",
  "相亲对象说「先做朋友」，是什么意思？",
  "副业做自媒体，多久能超过主业收入？",
  "上班摸鱼被领导发现，要不要主动认错？",
  "月薪两万，在一线城市该不该买房？",
  "年轻人第一份工作，该看薪资还是看成长？",
  "要不要为了孩子上学，搬到老破小的学区房？",
  "35 岁被优化，转行做家政或网约车丢人吗？",
  "相亲时对方要求婚前全款买房，合理吗？",
  "存款 50 万，是先买车还是先还房贷？",
  "同事把活推给我，我该不该撕破脸？",
  "要不要送孩子去读国际学校？",
  "长期加班到十点，身体开始报警，该辞职吗？",
  "朋友创业拉我入伙，出钱还是出力？",
  "父母老了要不要接来同住？",
  "读博六年没毕业，还要不要坚持？",
  "在县城做公务员，一辈子就到头了吗？",
];

/**
 * 广场条目里保留的字段 —— 多余的（如完整证据原文）会让 JSON 膨胀到几 MB。
 *
 * ⚠️ 字段名必须与 lib/domain/types.ts 的真实类型对齐，不能凭印象写：
 *   - Gap 用的是 `label` / `reason` / `needProfile`，不是 question/why。
 *     写错字段名不会报错，只会静默产出只剩 id 的空缺口（2026-09-15 踩过）。
 *   - AnswerDraft 必填 `accent` / `evidence` / `createdAt` / `status`，
 *     这些在还原时要么补回、要么由 hydrate() 补默认值。
 * 消费端在 components/square/FeedStream.tsx 的 hydrate()，改这里必须同步改那边。
 */
function slim(mirror) {
  return {
    id: mirror.id,
    title: mirror.title,
    createdAt: mirror.createdAt,
    routing: { intent: mirror.routing.intent, summary: mirror.routing.summary },
    skills: mirror.skills.map((s) => ({
      id: s.id,
      name: s.name,
      kind: s.kind,
      lens: s.lens,
      accent: s.accent,
      persona: s.persona ? { handle: s.persona.handle, displayName: s.persona.displayName } : undefined,
    })),
    answers: mirror.answers.map((a) => ({
      id: a.id,
      skillId: a.skillId,
      skillName: a.skillName,
      accent: a.accent,
      handle: a.handle,
      body: a.body,
      generatedBy: a.generatedBy,
      status: a.status,
      createdAt: a.createdAt,
      round: a.round,
      replyToName: a.replyToName,
      /** 证据只留条数与来源标题，正文留在仓外 —— 它是最大的一块体积。 */
      evidenceCount: Array.isArray(a.evidence) ? a.evidence.length : 0,
      evidenceTitles: (a.evidence ?? []).slice(0, 3).map((e) => e.title),
    })),
    gaps: mirror.gaps.map((g) => ({
      id: g.id,
      kind: g.kind,
      label: g.label,
      reason: g.reason,
      needProfile: g.needProfile,
      severity: g.severity,
    })),
  };
}

/* ------------------------------ 主流程 ------------------------------ */

const args = process.argv.slice(2);
const FORCE = args.includes("--force");
const NO_ZHIDA = args.includes("--no-zhida");
const onlyArg = args.indexOf("--only");
const ONLY = onlyArg >= 0 ? Number(args[onlyArg + 1]) : 0;

/**
 * 让 Node 认识 Next 的 `@/` 路径别名，并把 `server-only` 变成空模块。
 *
 * 为什么必须这么做：lib/server/mirror.ts 用了 `@/lib/domain/...` 这类别名
 * 和 `import "server-only"`，这两样都只在 Next 的打包器里成立。
 * 用一个 loader 在解析阶段改掉，就不必为了跑脚本去改业务代码。
 */
const RESOLVER = `
import { pathToFileURL } from "node:url";
import { existsSync, statSync } from "node:fs";
const ROOT = ${JSON.stringify(ROOT.replace(/\\/g, "/"))};
const tryExt = (base) => {
  for (const c of [base + ".ts", base + ".tsx", base + "/index.ts", base + "/index.tsx", base]) {
    // 必须排除目录：Node 的 ESM loader 拿到目录路径会在 readSync 上报 EISDIR。
    if (existsSync(c) && statSync(c).isFile()) return c;
  }
  return null;
};
export function resolve(specifier, context, next) {
  if (specifier === "server-only") {
    return { url: "data:text/javascript,export default {}", shortCircuit: true };
  }
  if (specifier.startsWith("@/")) {
    const hit = tryExt(ROOT + "/" + specifier.slice(2));
    if (hit) return { url: pathToFileURL(hit).href, shortCircuit: true };
  }
  // TS 源码里相对 import 不带扩展名，Node 的 ESM 解析器不认，这里补上。
  if ((specifier.startsWith("./") || specifier.startsWith("../")) && context.parentURL) {
    const base = new URL(specifier, context.parentURL);
    const hit = tryExt(decodeURIComponent(base.pathname));
    if (hit) return { url: pathToFileURL(hit).href, shortCircuit: true };
  }
  return next(specifier, context);
}
`;

async function main() {
  const { writeFileSync, mkdirSync: mk } = await import("node:fs");
  const { pathToFileURL } = await import("node:url");
  const hookPath = join(ROOT, ".library-resolver.mjs");
  writeFileSync(hookPath, RESOLVER, "utf8");

  const { register } = await import("node:module");
  register(pathToFileURL(hookPath), { parentURL: pathToFileURL(join(ROOT, "scripts", "x.mjs")).href });

  const { runMirror } = await import("../lib/server/mirror.ts");

  const existing = existsSync(OUT) ? JSON.parse(readFileSync(OUT, "utf8")) : { entries: [] };
  const byTitle = new Map(existing.entries.map((e) => [e.title, e]));

  const topics = ONLY > 0 ? TOPICS.slice(0, ONLY) : TOPICS;
  let fresh = 0;
  let skipped = 0;

  for (const [i, topic] of topics.entries()) {
    if (!FORCE && byTitle.has(topic)) {
      skipped++;
      continue;
    }
    process.stdout.write(`[${i + 1}/${topics.length}] ${topic}\n`);
    try {
      const mirror = await runMirror(topic, { useZhida: !NO_ZHIDA });
      byTitle.set(topic, slim(mirror));
      fresh++;
      const gen = mirror.answers.filter((a) => a.generatedBy === "zhida").length;
      process.stdout.write(`    ✓ ${mirror.answers.length} 篇回答（${gen} 篇直答生成）\n`);
    } catch (err) {
      process.stdout.write(`    ✗ 失败：${err instanceof Error ? err.message : String(err)}\n`);
    }
  }

  // 按 TOPICS 顺序输出，保证广场的顺序稳定、可预期。
  const entries = TOPICS.map((t) => byTitle.get(t)).filter(Boolean);

  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, JSON.stringify({ builtAt: Date.now(), entries }, null, 0), "utf8");
  process.stdout.write(`\n写入 ${OUT}\n新增 ${fresh} 条，跳过 ${skipped} 条，共 ${entries.length} 条。\n`);
}

main().catch((err) => {
  process.stderr.write("构建失败：" + (err instanceof Error ? err.stack : String(err)) + "\n");
  process.exit(1);
});
