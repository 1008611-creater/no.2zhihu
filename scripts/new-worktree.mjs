#!/usr/bin/env node
/**
 * 为当前会话创建独立的 git worktree。
 *
 * ## 解决什么问题
 *
 * 多会话共用一个工作副本时，你**未提交**的改动是「公共资源」：
 * 别人一句 `git reset --hard` 就把它抹掉，而且**不可恢复** ——
 * 未 `git add` 的内容从未生成 git 对象，`git fsck --lost-found` 也找不回来。
 *
 * worktree 让每个会话有自己的工作目录，共享同一个 `.git` 对象库：
 * 别人的 reset 只影响他自己的目录。
 *
 * ## 用法
 *
 *   node scripts/new-worktree.mjs <会话名> [--base <ref>] [--no-link] [--dry-run]
 *
 *   --base <ref>   从哪个提交起分支，默认 origin/main（退回 main）
 *   --no-link      不链接主仓库的 node_modules
 *   --dry-run      只打印将执行的命令
 *
 * ## 会话名约定
 *
 * 用小写字母、数字、连字符。会建在 `.tools/<会话名>`，分支名 `feat/<会话名>`。
 * `.tools/` 已被 gitignore，不会污染仓库。
 */

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const ANSI = Boolean(process.stdout.isTTY);
const wrap = (code, s) => (ANSI ? `\u001b[${code}m${s}\u001b[0m` : s);
const red = (s) => wrap(31, s);
const green = (s) => wrap(32, s);
const yellow = (s) => wrap(33, s);
const dim = (s) => wrap(2, s);
const bold = (s) => wrap(1, s);

const argv = process.argv.slice(2);
const opts = { name: null, base: null, link: true, dryRun: false };

for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === "--base") opts.base = argv[++i];
  else if (a === "--no-link") opts.link = false;
  else if (a === "--dry-run") opts.dryRun = true;
  else if (!a.startsWith("--")) opts.name = a;
}

if (!opts.name) {
  console.error("用法: node scripts/new-worktree.mjs <会话名> [--base <ref>] [--no-link] [--dry-run]");
  process.exit(2);
}

if (!/^[a-z0-9][a-z0-9-]{0,40}$/.test(opts.name)) {
  console.error(red("✗ 会话名只能用 小写字母/数字/连字符，且不以连字符开头"));
  process.exit(2);
}

// ---------------------------------------------------------------- 定位仓库

const top = spawnSync("git", ["rev-parse", "--show-toplevel"], { encoding: "utf8" });
if (top.status !== 0) {
  console.error(red("✗ 当前目录不在 git 仓库里"));
  process.exit(2);
}
const REPO = top.stdout.trim();

function git(args) {
  return spawnSync("git", args, {
    cwd: REPO,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
}

// ---------------------------------------------------------------- 基线

function resolveRef(candidates) {
  for (const ref of candidates) {
    const r = git(["rev-parse", "--verify", "--quiet", `${ref}^{commit}`]);
    if (r.status === 0 && r.stdout.trim()) return ref;
  }
  return null;
}

const baseRef = resolveRef(opts.base ? [opts.base] : ["origin/main", "main"]);
if (!baseRef) {
  console.error(red("✗ 找不到基线分支（试过 origin/main / main）"));
  process.exit(2);
}

const baseSha = git(["rev-parse", "--short", baseRef]).stdout.trim();

// ---------------------------------------------------------------- 目标路径

const wtPath = path.join(REPO, ".tools", opts.name);
const branch = `feat/${opts.name}`;

console.log();
console.log(bold("═".repeat(60)));
console.log(bold("  创建会话 worktree"));
console.log(bold("═".repeat(60)));
console.log(dim(`  仓库    ${REPO}`));
console.log(dim(`  会话    ${opts.name}`));
console.log(dim(`  目录    .tools/${opts.name}`));
console.log(dim(`  分支    ${branch}`));
console.log(dim(`  基线    ${baseRef} @ ${baseSha}`));
console.log();

// ---------------------------------------------------------------- 冲突检查

if (fs.existsSync(wtPath)) {
  console.error(red(`✗ ${wtPath} 已存在`));
  console.error(dim("  换个会话名，或先删除该目录："));
  console.error(dim(`    git worktree remove .tools/${opts.name}`));
  process.exit(1);
}

const existingBranches = git(["branch", "--list", branch]).stdout.trim();
if (existingBranches) {
  console.error(red(`✗ 分支 ${branch} 已存在`));
  console.error(dim("  换个会话名，或先删掉旧分支"));
  process.exit(1);
}

const wl = git(["worktree", "list"]).stdout;
console.log(dim("  现有 worktree："));
for (const line of wl.split("\n").filter(Boolean)) {
  console.log(dim(`      ${line}`));
}
console.log();

// ---------------------------------------------------------------- 执行

const cmds = [
  ["git", ["worktree", "add", "-b", branch, wtPath, baseRef]],
];

if (opts.dryRun) {
  console.log(yellow("  --dry-run，只打印不执行："));
  for (const [exe, args] of cmds) console.log(dim(`      ${exe} ${args.join(" ")}`));
  if (opts.link) console.log(dim(`      链接 node_modules -> ${wtPath}/node_modules`));
  console.log();
  process.exit(0);
}

console.log(bold("  [1/3] 创建 worktree"));
const add = git(["worktree", "add", "-b", branch, wtPath, baseRef]);
if (add.status !== 0) {
  console.error(red("  ✗ 创建失败"));
  console.error(dim(`    ${(add.stderr || "").trim()}`));
  console.error();
  console.error(yellow("  可能是沙箱拦截了 git 写 .git/worktrees/。手工替代方案："));
  console.error(dim(`      git clone --local --no-hardlinks . ../${opts.name}-work`));
  console.error(dim(`      cd ../${opts.name}-work && git checkout -b ${branch} ${baseRef}`));
  process.exit(1);
}
console.log(green(`  ✓ ${wtPath}`));

console.log();
console.log(bold("  [2/3] 链接依赖与本地环境"));

// node_modules：Windows 上 junction 不需要管理员权限
if (opts.link) {
  const srcNm = path.join(REPO, "node_modules");
  const dstNm = path.join(wtPath, "node_modules");
  if (fs.existsSync(srcNm) && !fs.existsSync(dstNm)) {
    try {
      fs.symlinkSync(srcNm, dstNm, "junction");
      console.log(green("  ✓ node_modules 已链接（省去重复安装）"));
    } catch (e) {
      console.log(yellow(`  ⚠ node_modules 链接失败：${e.message}`));
      console.log(dim("    需要在该目录手动 npm install"));
    }
  } else if (!fs.existsSync(srcNm)) {
    console.log(yellow("  ⚠ 主仓库没有 node_modules，需要手动 npm install"));
  } else {
    console.log(dim("  · node_modules 已存在，跳过"));
  }
} else {
  console.log(dim("  · --no-link，跳过 node_modules"));
}

// .env.local：构建需要
const srcEnv = path.join(REPO, ".env.local");
const dstEnv = path.join(wtPath, ".env.local");
if (fs.existsSync(srcEnv) && !fs.existsSync(dstEnv)) {
  try {
    fs.copyFileSync(srcEnv, dstEnv);
    console.log(green("  ✓ .env.local 已复制"));
  } catch (e) {
    console.log(yellow(`  ⚠ .env.local 复制失败：${e.message}`));
  }
} else if (!fs.existsSync(srcEnv)) {
  console.log(dim("  · 主仓库没有 .env.local"));
} else {
  console.log(dim("  · .env.local 已存在，跳过"));
}

console.log();
console.log(bold("  [3/3] 完成"));
console.log();

console.log(bold("═".repeat(60)));
console.log(bold("  接下来"));
console.log(bold("═".repeat(60)));
console.log();
console.log(`  1. 切到新目录：`);
console.log(dim(`       cd ${path.relative(process.cwd(), wtPath) || wtPath}`));
console.log();
console.log(`  2. 干活，然后**尽早提交**：`);
console.log(dim(`       git add -- <你的文件>     # 别用 git add -A`));
console.log(dim(`       git commit -m "..."`));
console.log(dim(`       git push -u origin ${branch}`));
console.log();
console.log(`  3. 提交前校验（能不能安全合并）：`);
console.log(dim(`       node scripts/verify-merge.mjs ${branch}`));
console.log();
console.log(`  4. 用完后清理：`);
console.log(dim(`       git worktree remove .tools/${opts.name}`));
console.log();
console.log(dim("  提醒：这个目录只属于你。别人的 reset --hard 碰不到这里。"));
console.log();
