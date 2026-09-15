#!/usr/bin/env node
/**
 * 批量合并 —— merge queue 在本仓库不可用时的替代品。
 *
 * 为什么需要它
 *   GitHub 的 merge queue 在本仓库开不了，有两层原因：
 *     1. Rulesets 的规则类型里没有 merge_queue（API 实测：`Invalid rule 'merge_queue'`）
 *     2. 文档要求「organization 拥有的 public 仓库」，本仓库 owner 是个人账号
 *   而 merge queue 想解决的正是我们的痛点：
 *     main 开了 `strict: true` → 每合并 1 个 PR，其余在途 PR 全部 BEHIND 要重新同步。
 *     队列长度 N 时，每合 1 个产生 N-1 次返工，全压在审计线程身上。
 *
 *   本脚本把「逐个 update-branch → 等 CI → 合并」这条手工串行链路自动化：
 *   一次运行，按顺序处理整条队列，冲突的自动跳过并报告。
 *
 * 用法
 *   node scripts/audit-merge.mjs              # 干跑：只报告会做什么（默认，安全）
 *   node scripts/audit-merge.mjs --apply      # 真合并
 *   node scripts/audit-merge.mjs --apply 26 30  # 只处理指定 PR
 *
 * 安全设计
 *   · 默认 dry-run，必须显式 --apply 才动手
 *   · 有冲突 / CI 失败 / 非 MERGEABLE 的 PR 一律跳过，不做任何「智能解冲突」
 *   · 每次合并后重新取 main，后续 PR 重新判定（因为 strict 会让它们 BEHIND）
 *   · 只合并，**不部署** —— 部署由 deploy.yml 在 push 到 main 时自动触发
 */
import { execFileSync } from "node:child_process";

const GIT = process.env.GIT_BIN || "git";
const GH = process.env.GH_BIN || "gh";
const REMOTE = "https://github.com/1008611-creater/no.2zhihu.git";
const REPO = "1008611-creater/no.2zhihu";
const BASE = "main";

const argv = process.argv.slice(2);
const APPLY = argv.includes("--apply");
const ONLY = argv.filter((a) => /^\d+$/.test(a)).map(Number);
const WAIT_CI_MS = 5 * 60 * 1000; // 单次等 CI 上限
const POLL_MS = 15 * 1000;

function sh(bin, args, opts = {}) {
  try {
    return execFileSync(bin, args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], ...opts }).trim();
  } catch (e) {
    return `__ERR__ ${String(e.stderr || e.message).split("\n")[0].slice(0, 160)}`;
  }
}
const git = (...a) => sh(GIT, a);
const gh = (...a) => sh(GH, a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function ghJson(args, fields) {
  const out = gh(...args, "--json", fields);
  try { return JSON.parse(out); } catch { return null; }
}

const mainSha = () => git("ls-remote", REMOTE, `refs/heads/${BASE}`).split(/\s+/)[0];

function listPrs() {
  const prs = ghJson(["pr", "list", "--state", "open", "--limit", "30"],
    "number,title,headRefName,headRefOid,mergeable,mergeStateStatus");
  if (!Array.isArray(prs)) return [];
  return ONLY.length ? prs.filter((p) => ONLY.includes(p.number)) : prs;
}

function prState(n) {
  return ghJson(["pr", "view", String(n)], "mergeable,mergeStateStatus,statusCheckRollup,headRefOid,title");
}

/** 是否与 main 冲突（merge-tree 为准，GitHub 判定兜底）。 */
function hasConflict(pr, m) {
  // DIRTY 在 GitHub 语义里就是「合并有冲突」，必须一并判 ——
  // 实测踩过：#11/#35 是 DIRTY，却因为 merge-tree 取不到对象被判「未判定」而放行。
  if (pr.mergeable === "CONFLICTING" || pr.mergeStateStatus === "DIRTY") return true;
  const out = git("merge-tree", "--write-tree", "--name-only", m, pr.headRefOid);
  if (out.startsWith("__ERR__")) return null; // 未知
  return out.split("\n").filter(Boolean).length > 1;
}

function checksOk(st) {
  const checks = (st.statusCheckRollup || []).filter((c) => c.name);
  if (!checks.length) return false;
  return checks.every((c) => c.conclusion === "SUCCESS" || c.conclusion === "NEUTRAL" || c.conclusion === "SKIPPED");
}

function pending(st) {
  const checks = (st.statusCheckRollup || []).filter((c) => c.name);
  return checks.some((c) => c.status !== "COMPLETED");
}

async function waitCi(n, deadline) {
  while (Date.now() < deadline) {
    const st = prState(n);
    if (!st) return "unknown";
    if (pending(st)) { await sleep(POLL_MS); continue; }
    return checksOk(st) ? "ok" : "failed";
  }
  return "timeout";
}

/* ───────────────────────── 主流程 ───────────────────────── */

console.log("═".repeat(72));
console.log(`批量合并${APPLY ? "" : "（干跑 —— 加 --apply 才真合并）"}`);
console.log("═".repeat(72));

let prs = listPrs();
if (!prs.length) { console.log("\n没有可处理的 OPEN PR。"); process.exit(0); }

console.log(`\n初始队列 ${prs.length} 个：${prs.map((p) => "#" + p.number).join(" ")}`);

// 按 PR 号从小到大处理（先来的先合）
prs.sort((a, b) => a.number - b.number);

const done = [];
const skipped = [];

for (const pr of prs) {
  const n = pr.number;
  let m = mainSha();
  console.log("\n" + "─".repeat(72));
  console.log(`#${n}  ${String(pr.title).slice(0, 60)}`);

  // 1. 冲突检查（用当前 main 重新判定）
  git("fetch", REMOTE, m, pr.headRefOid);
  const conflict = hasConflict(pr, m);
  if (conflict === true) {
    console.log("   ✗ 与 main 冲突 → 跳过（需人工 rebase，脚本不做自动解冲突）");
    skipped.push({ n, why: "冲突" });
    continue;
  }
  if (conflict === null) console.log("   · 冲突未判定（对象缺失），继续但请留意");

  // 2. 同步 base
  const st0 = prState(n);
  if (st0 && st0.mergeStateStatus === "BEHIND") {
    console.log("   · BEHIND → 同步 base");
    if (APPLY) {
      const r = gh("pr", "update-branch", String(n));
      if (r.startsWith("__ERR__")) {
        console.log(`   ✗ 同步失败 → 跳过：${r.slice(8)}`);
        skipped.push({ n, why: "同步失败" });
        continue;
      }
      console.log("   ✓ 已同步，等 CI…");
    }
  } else {
    console.log(`   · base 状态 ${st0 ? st0.mergeStateStatus : "?"}`);
  }

  if (!APPLY) {
    console.log("   → 干跑：将同步（如需）→ 等 CI → 合并");
    continue;
  }

  // 3. 等 CI
  const verdict = await waitCi(n, Date.now() + WAIT_CI_MS);
  if (verdict !== "ok") {
    console.log(`   ✗ CI ${verdict} → 跳过`);
    skipped.push({ n, why: `CI ${verdict}` });
    continue;
  }
  console.log("   ✓ CI 通过");

  // 4. 合并
  const r = gh("api", "-X", "PUT", `repos/${REPO}/pulls/${n}/merge`, "-f", "merge_method=merge", "-q", ".merged");
  if (r.trim() !== "true") {
    console.log(`   ✗ 合并失败：${r.slice(0, 120)}`);
    skipped.push({ n, why: "合并失败" });
    continue;
  }
  const after = mainSha();
  console.log(`   ✓ 已合并  main → ${after.slice(0, 8)}`);
  console.log("   · 部署由 deploy.yml 自动触发，无需手动 ssh");
  done.push({ n, sha: after.slice(0, 8) });
}

console.log("\n" + "═".repeat(72));
console.log("结果");
console.log("═".repeat(72));
console.log(`  已合并 ${done.length} 个：${done.map((d) => `#${d.n}→${d.sha}`).join("  ") || "（无）"}`);
if (skipped.length) {
  console.log(`  跳过 ${skipped.length} 个：`);
  for (const s of skipped) console.log(`     #${s.n}  ${s.why}`);
}
if (!APPLY) console.log("\n  ⚠ 这是干跑。确认无误后加 --apply 执行。");
console.log(`\n  当前 main = ${mainSha().slice(0, 8)}`);
console.log("  下一步：node scripts/audit-status.mjs 复核线上是否同步\n");
