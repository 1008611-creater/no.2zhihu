#!/usr/bin/env node
/**
 * 检查：改了业务文件的 PR，有没有在 `docs/threads/` 里放线程声明。
 *
 * ## 为什么需要它
 *
 * `docs/threads/` 是为了解决多线程并行的两个**不报错**的事故：重复劳动、
 * 基于过期信息做决定（见 docs/threads/README.md）。但机制有个死法：**没人填**。
 * 前车之鉴就在同一天 —— `docs/collaboration.md` 写着「WIP ≤ 2」，
 * 而队列到过 7 个。**被无视的规则比没有规则更糟**：它会让人以为有保护。
 *
 * 所以给它一个反馈回路：改了业务文件却没声明 → 提醒（**不阻断**）。
 *
 * ## 为什么「不阻断」
 *
 * 它是**协作提醒**，不是**质量门禁**。用失败表达提醒是语义错位：
 * 红叉会让人以为 PR 坏了（`pr-flow-check.yml` 踩过同一个坑，已从 failure 改成 comment）。
 * 而且声明缺失**不影响任何运行时行为**，用它挡合并是过度约束。
 *
 * ## 判定规则
 *
 * - **业务文件**：`app/` `components/` `lib/` `public/` —— 改了这些才要求声明。
 * - **不算业务**：`docs/` `scripts/` `.github/` 根配置文件 —— 改这些不需要声明。
 * - **有效声明**：本 PR 新增或修改了 `docs/threads/<任意>.md`
 *   （`README.md` 与 `_template.md` 是规范本身，不算声明）。
 *
 * ## 用法
 *
 *   node scripts/check-thread-declaration.mjs                     # 与 main 比（本地自查）
 *   node scripts/check-thread-declaration.mjs --base <sha> --head <sha>
 *   node scripts/check-thread-declaration.mjs --strict            # 缺失时 exit 1
 *
 * 退出码：默认 **恒 0**（软检查）；加 `--strict` 时缺失返回 1。
 *
 * ## 已知边界
 *
 * - 用 `merge-base(base, head)` 而不是直接 `diff base head`：
 *   后者会把**期间 main 上前进的提交**也算进本 PR 的改动 → 误报
 *   （`pr-flow-check.yml` 用的是后者，会误报，见该文件）。
 * - 只看文件名，不解析声明内容 —— 声明是否**属实**由审计线程抽查，
 *   机器判不了（那是「是否符合意图」的范畴）。
 */

import { execFileSync } from "node:child_process";

const BUSINESS_PREFIXES = ["app/", "components/", "lib/", "public/"];
const DECLARATION_DIR = "docs/threads/";
const NON_DECLARATION = new Set(["README.md", "_template.md"]);

function git(...args) {
  try {
    return execFileSync("git", args, { encoding: "utf8" }).trim();
  } catch {
    return "";
  }
}

function parseArgs(argv) {
  const out = { base: "", head: "", strict: false };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--base") out.base = argv[++i] ?? "";
    else if (argv[i] === "--head") out.head = argv[++i] ?? "";
    else if (argv[i] === "--strict") out.strict = true;
  }
  return out;
}

const args = parseArgs(process.argv.slice(2));
const head = args.head || git("rev-parse", "HEAD");

let base = args.base;
if (!base) {
  // 默认与远端 main 比。先试 origin/main，取不到就试 main。
  base = git("merge-base", "origin/main", head) || git("merge-base", "main", head);
}
if (!base) {
  console.log("取不到基线（origin/main 或 main 都不存在）→ 跳过检查。");
  process.exit(0);
}

const mergeBase = git("merge-base", base, head) || base;
const changed = git("diff", "--name-only", mergeBase, head)
  .split("\n")
  .map((s) => s.trim())
  .filter(Boolean);

if (changed.length === 0) {
  console.log("本 PR 无文件改动 → 跳过。");
  console.log("THREAD_DECLARATION=not_applicable");
  process.exit(0);
}

const business = changed.filter((f) => BUSINESS_PREFIXES.some((p) => f.startsWith(p)));
const declarations = changed.filter(
  (f) => f.startsWith(DECLARATION_DIR) && !NON_DECLARATION.has(f.slice(DECLARATION_DIR.length)),
);

console.log("=== 线程声明检查（软检查，不阻断）===");
console.log(`基线 ${mergeBase.slice(0, 8)} → ${head.slice(0, 8)}｜改动 ${changed.length} 个文件`);
console.log(`业务文件改动：${business.length} 个`);
for (const f of business.slice(0, 12)) console.log(`   ${f}`);
if (business.length > 12) console.log(`   …另有 ${business.length - 12} 个`);
console.log(`本 PR 的线程声明：${declarations.length ? declarations.join(", ") : "未找到"}`);
console.log();

if (business.length === 0) {
  console.log("✓ 未改业务文件（只动 docs / scripts / .github / 根配置）→ 不需要声明。");
  console.log("THREAD_DECLARATION=not_applicable");
  process.exit(0);
}

if (declarations.length > 0) {
  console.log("✓ 已声明。注意：声明与实际相符由审计线程抽查 —— 换了工作区/分支/文件记得同步更新。");
  console.log("THREAD_DECLARATION=ok");
  process.exit(0);
}

console.log("⚠ 改了业务文件，但本 PR 没有 docs/threads/ 下的声明。");
console.log();
console.log("这不是错误，是提醒 —— 多线程并行时，冲突的高发区是「正在做但还没提 PR」的工作，");
console.log("而 preflight.mjs 只看已提的 PR。声明能让别人在动手前就看到你在改什么。");
console.log();
console.log("补上（2 分钟）：");
console.log("  1. cp docs/threads/_template.md docs/threads/<你的线程名>.md");
console.log("  2. 填：工作区 / 分支 / 正在改哪些文件 / 基线 sha / 状态 / 最后更新");
console.log("  3. 和本 PR 一起提交");
console.log();
console.log("规范见 docs/threads/README.md。");
console.log();
// 机器可读结论（供 workflow 判断，避免 grep 中文）
console.log("THREAD_DECLARATION=need");

process.exit(args.strict ? 1 : 0);
