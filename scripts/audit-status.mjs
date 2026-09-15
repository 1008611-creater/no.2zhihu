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
 *   · 护栏用 REST API（strict / 必过检查 / auto-merge 都是线上实时值）
 *
 * ⚠️ 本脚本会自我过期的两处（改架构时记得回来同步）
 *   · 部署 workflow 的名字：2026-09-15 起 `deploy.yml` 已删除，
 *     部署并入 `ci.yml` 的 `deploy` job（needs: build，只在 push 到 main 时跑）。
 *     早期版本本脚本查的是 deploy.yml，于是**报的是历史运行**，会误导判断。
 *   · 分支保护：`strict` 已关闭（改用「关 strict + auto-merge」），
 *     所以「PR 是 BEHIND」不再是问题，不需要逐个 update-branch。
 *
 * 用法：
 *   node scripts/audit-status.mjs              # 全量
 *   node scripts/audit-status.mjs --no-remote  # 跳过 ssh（离线/服务器不可达时）
 */
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";

const GIT = process.env.GIT_BIN || "git";
const GH = process.env.GH_BIN || "gh";
const REPO = "1008611-creater/no.2zhihu";
const REMOTE = `https://github.com/${REPO}.git`;
const SSH_TARGET = process.env.DEPLOY_SSH || "root@114.134.185.16";
const SSH_KEY = process.env.DEPLOY_KEY || `${process.env.USERPROFILE || ""}\\.ssh\\ans_portal_ed25519`;

// 部署所在的 workflow 文件（不是 workflow 名）。部署并入 ci.yml 后就是它。
const DEPLOY_WORKFLOW = "ci.yml";

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

/** `gh api <path>` → JSON（用于 REST，它不接受 --json 字段列表）。 */
const ghApi = (path) => {
  const out = sh(GH, ["api", path]);
  try {
    return JSON.parse(out);
  } catch {
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
    console.log(`   → 部署是 ${DEPLOY_WORKFLOW} 的 deploy job（push 到 main 自动触发 · 幂等）；`);
    console.log("     落后时先看 Actions 里这次 push 的 ci 运行，**不要手动 ssh 构建**");
    console.log("     （会与 CI 抢 .next，实测撞过一次 EACCES）。");
  }
} else {
  console.log("线上                      （跳过：--no-remote 或无密钥）");
}

// ── 2. 护栏（决定「要不要同步分支」「PR 会不会自己合」）────────
const prot = ghApi(`repos/${REPO}/branches/main/protection`);
const repoInfo = ghApi(`repos/${REPO}`);
console.log("\n" + "─".repeat(72));
console.log("护栏（这三项决定策略，别凭记忆）");
console.log("─".repeat(72));
if (prot) {
  const strict = prot.required_status_checks?.strict;
  console.log(`  strict（分支须与 main 同步才能合）  ${strict ? "开 ⚠ 会产生 N² 返工" : "关 ✓ 不需要逐个 update-branch"}`);
  console.log(`  必过检查                            ${(prot.required_status_checks?.contexts || []).join(", ") || "（无）"}`);
  console.log(`  管理员也受约束                      ${prot.enforce_admins?.enabled ? "是" : "否"}`);
} else {
  console.log("  分支保护                          取不到（无权限或未设置）");
}
if (repoInfo) {
  console.log(`  auto-merge 能力                     ${repoInfo.allow_auto_merge ? "已开 ⚠ PR 可能在 CI 变绿后自行合并" : "关闭"}`);
}

// ── 3. 队列 ───────────────────────────────────────────────────
const prs = ghJson(["pr", "list", "--state", "open", "--limit", "30",
  "number,title,headRefName,headRefOid,mergeable,mergeStateStatus"]);
if (!Array.isArray(prs)) {
  console.log("\n（gh 取队列失败，检查 gh 登录）");
  process.exit(0);
}
console.log(`\n在途 PR：${prs.length} 个`);
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
      // 取不到对象时**不能**判成干净 —— GitHub 的 mergeable 作兜底（踩过：#11 是
      // CONFLICTING 却被判 PASS）
      conflict = p.mergeable === "CONFLICTING" ? "冲突(GH)" : "取不到对象";
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

// ── 4. 自动化状态 ─────────────────────────────────────────────
console.log("\n" + "─".repeat(72));
console.log("自动化（先看这里，再决定要不要手动操作）");
console.log("─".repeat(72));
const runs = ghJson(["run", "list", `--workflow=${DEPLOY_WORKFLOW}`, "--limit", "5",
  "status,conclusion,headSha,createdAt"]);
if (Array.isArray(runs) && runs.length) {
  console.log(`\n${DEPLOY_WORKFLOW}（build → 冒烟 → deploy，仅 push 到 main 时部署 · 幂等）`);
  for (const r of runs) {
    console.log(`   ${r.createdAt.slice(11, 16)}  ${r.status}/${r.conclusion ?? "-"}  ${r.headSha.slice(0, 8)}`);
  }
  console.log("   → 合并不需要手动部署；部署失败再介入。");
} else {
  console.log(`\n${DEPLOY_WORKFLOW}  取不到运行记录`);
}

// ── 5. 建议动作 ───────────────────────────────────────────────
console.log("\n" + "─".repeat(72));
console.log("建议动作");
console.log("─".repeat(72));
if (!row.length) {
  console.log("  队列空 → 没有可合并项。");
} else {
  const clean = row.filter((r) => r.conflict === "干净");
  const dirty = row.filter((r) => r.conflict !== "干净");
  if (clean.length) {
    console.log(`  · ${clean.length} 个无冲突 → 可批量处理：`);
    console.log("      node scripts/audit-precheck.mjs        # 先机械预检");
    console.log("      node scripts/audit-merge.mjs           # 干跑看会做什么");
    console.log("      node scripts/audit-merge.mjs --apply   # 真合并");
  }
  if (dirty.length) {
    console.log(`  · ${dirty.length} 个有冲突 → 需人工 rebase：#${dirty.map((d) => d.n).join(" #")}`);
    console.log("      冲突多集中在 docs/architecture.md、docs/collaboration.md、lib/server/mirror.ts");
    console.log("      ⚠ 语义冲突（重构 vs 同区域新增）不要机械解，在 PR 上写清成因交给开发线程。");
  }
}
console.log("\n  ⚠ 动笔写审计结论前先跑本脚本 —— 实测提示词写完 10 分钟就有 2 项被别的线程解决了。");
console.log();
