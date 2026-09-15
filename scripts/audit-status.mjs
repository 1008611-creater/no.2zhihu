#!/usr/bin/env node
/**
 * 审计上线线程的「一键现状」。
 *
 * 为什么需要它：main 在高频变化（实测 50 分钟内前进 6 次），每次动手前都要
 * 重新摸清「main 在哪、线上在哪、队列里有什么、谁和谁冲突、CI 什么状态」——
 * 那是 5-6 条命令 + 手工比对，而且**极容易用过期信息下结论**（本线程踩过三次：
 * 用陈旧的本地 origin/main 判断「分支没并入」、把「PR 从列表消失」当成还没合、
 * 用 `git diff <新main> <旧分支>` 误判成「合并会删 730 行」）。
 *
 * 这个脚本把「摸底」压成一条命令，并且**只采信权威来源**：
 *   · main 用 `git ls-remote`（本地 origin/main 会落不了盘）
 *   · 线上用 ssh 直读服务器 HEAD
 *   · 冲突用 `merge-tree`（不是 diff —— diff 判断不了「合并会不会回退」）
 *
 * 用法：
 *   node scripts/audit-status.mjs              # 全量
 *   node scripts/audit-status.mjs --no-remote  # 跳过 ssh（离线/服务器不可达时）
 */
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";

const GIT = process.env.GIT_BIN || "git";
const GH = process.env.GH_BIN || "gh";
const REMOTE = "https://github.com/1008611-creater/no.2zhihu.git";
const SSH_TARGET = process.env.DEPLOY_SSH || "root@114.134.185.16";
const SSH_KEY = process.env.DEPLOY_KEY || `${process.env.USERPROFILE || ""}\\.ssh\\ans_portal_ed25519`;

const args = new Set(process.argv.slice(2));

function sh(bin, argv, opts = {}) {
  try {
    return execFileSync(bin, argv, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      ...opts,
    }).trim();
  } catch (e) {
    return `__ERR__ ${String(e.stderr || e.message).split("\n")[0].slice(0, 120)}`;
  }
}

const ghJson = (argv) => {
  // 最后一个元素是字段列表；--json 必须排在它前面，否则 gh 不认
  const fields = argv[argv.length - 1];
  const base = argv.slice(0, -1);
  const out = sh(GH, [...base, "--json", fields]);
  try {
    return JSON.parse(out);
  } catch {
    if (out.startsWith("__ERR__")) console.log(`   （gh 失败：${out.slice(8)}）`);
    return null;
  }
};

console.log("═".repeat(72));
console.log("审计上线 · 现状");
console.log("═".repeat(72));

// ── 1. 权威版本 ────────────────────────────────────────────────
const mainSha = sh(GIT, ["ls-remote", REMOTE, "refs/heads/main"]).split(/\s+/)[0] || "?";
console.log(`\nmain（权威 ls-remote）  ${mainSha.slice(0, 8)}`);

let liveSha = null;
if (!args.has("--no-remote") && existsSync(SSH_KEY)) {
  liveSha = sh("ssh", [
    "-i", SSH_KEY, "-o", "StrictHostKeyChecking=no", "-o", "ConnectTimeout=15",
    "-o", "BatchMode=yes", SSH_TARGET,
    "cd /opt/no2zhihu && git rev-parse HEAD",
  ]);
  const drift = liveSha === mainSha ? "同步 ✓" : "**落后**";
  console.log(`线上（服务器 HEAD）      ${String(liveSha).slice(0, 8)}   ${drift}`);
  if (liveSha !== mainSha) {
    console.log("   → deploy.yml 是 push-to-main 自动部署；若落后，先看 Actions 里 deploy 运行状态，");
    console.log("     不要手动 ssh 构建（会与 CI 抢 .next，实测撞过一次 EACCES）。");
  }
} else {
  console.log("线上                      （跳过：--no-remote 或无密钥）");
}

// ── 2. 队列 ───────────────────────────────────────────────────
const prs = ghJson(["pr", "list", "--state", "open", "--limit", "30",
  "number,title,headRefName,headRefOid,mergeable,mergeStateStatus"]);
if (!Array.isArray(prs)) {
  console.log("\n（gh 取队列失败，检查 gh 登录）");
  process.exit(0);
}
console.log(`\n在途 PR：${prs.length} 个`);
if (prs.length > 2) {
  console.log("   ⚠ docs/collaboration.md 约定 WIP ≤ 2；超过这个数，每合 1 个都会让其余全部失效。");
}
console.log();

// 先把各 PR 的对象按字面 sha 拉下来（沙箱下 refs 常落不了盘，不能指望 origin/*）
const wantShas = [...new Set([mainSha, ...prs.map((p) => p.headRefOid)])].filter(Boolean);
if (wantShas.length && mainSha !== "?") {
  const f = sh(GIT, ["fetch", REMOTE, ...wantShas]);
  if (f.startsWith("__ERR__")) console.log(`   （fetch 失败：${f.slice(8)}）`);
}

const row = [];
for (const p of prs) {
  let conflict = "?";
  if (mainSha !== "?") {
    // merge-tree 只看「合并进 main 会不会冲突」，不做写操作
    const out = sh(GIT, ["merge-tree", "--write-tree", "--name-only", mainSha, p.headRefOid]);
    if (out.startsWith("__ERR__")) {
      conflict = "取不到对象";
    } else {
      const lines = out.split("\n").filter(Boolean);
      conflict = lines.length > 1 ? `冲突 ${lines.length - 1}` : "干净";
    }
  }
  const flag = conflict.startsWith("冲突") ? "!!" : "  ";
  console.log(`${flag} #${String(p.number).padEnd(3)} ${conflict.padEnd(10)} ${p.mergeable}/${p.mergeStateStatus}  ${p.headRefName}`);
  console.log(`        ${String(p.title).slice(0, 64)}`);
  row.push({ n: p.number, conflict });
}

// ── 3. 自动化状态（这两条决定「要不要手动做」）────────────────
console.log("\n" + "─".repeat(72));
console.log("自动化（先看这里，再决定要不要手动操作）");
console.log("─".repeat(72));
const runs = ghJson(["run", "list", "--workflow=deploy.yml", "--limit", "5",
  "status,conclusion,headSha,createdAt"]);
if (Array.isArray(runs) && runs.length) {
  console.log("\ndeploy.yml（push 到 main 自动部署 · 幂等）");
  for (const r of runs) {
    console.log(`   ${r.createdAt.slice(11, 16)}  ${r.status}/${r.conclusion ?? "-"}  ${r.headSha.slice(0, 8)}`);
  }
  console.log("   → 合并不需要手动部署；部署失败再介入。");
} else {
  console.log("\ndeploy.yml  取不到运行记录");
}

// ── 4. 建议动作 ───────────────────────────────────────────────
console.log("\n" + "─".repeat(72));
console.log("建议动作");
console.log("─".repeat(72));
if (!row.length) {
  console.log("  队列空 → 没有可合并项。");
} else {
  const clean = row.filter((r) => r.conflict === "干净");
  const dirty = row.filter((r) => r.conflict !== "干净");
  if (clean.length > 1) {
    console.log(`  · ${clean.length} 个无冲突 → 可批量同步后合并：`);
    console.log("      gh workflow run sync-pr-branches.yml   # 一次同步全部（勿逐个 update-branch）");
  }
  if (dirty.length) {
    console.log(`  · ${dirty.length} 个有冲突 → 需人工 rebase：#${dirty.map((d) => d.n).join(" #")}`);
    console.log("      冲突多集中在 docs/architecture.md、docs/collaboration.md、lib/server/mirror.ts");
  }
}
console.log("\n  ⚠ 动笔写审计结论前先跑本脚本 —— 实测提示词写完 10 分钟就有 2 项被别的线程解决了。");
console.log();
