#!/usr/bin/env node
/**
 * PR 合并前预检 —— 把「审计基线」里可机械判定的部分自动化。
 *
 * 为什么需要它
 *   审计线程的时间应该花在「判断改动对不对」上，而不是「逐行找有没有把密钥提交进去」。
 *   今天（2026-09-15）这几类问题全是靠肉眼读 diff 发现的，而它们**都是机械可判定的**：
 *     · 凭证进了 tracked 文件 / 客户端 bundle      （审计基线 1）
 *     · lib/domain 读了 process.env / server-only  （审计基线 2）
 *     · 客户端直接 import lib/zhihu                （审计基线 2）
 *     · PR 意外删除了 main 上的文件                （静默回退）
 *     · 新增导出符号只有定义、没有调用点            （三方合并后「接线断裂」）
 *
 *   本脚本只做**可机械判定**的部分，判不了的一律报「需人工」——
 *   它的目标不是替代审计，是让审计只看需要人看的地方。
 *
 * 用法
 *   node scripts/audit-precheck.mjs          # 预检所有 OPEN PR
 *   node scripts/audit-precheck.mjs 26 11    # 只预检指定 PR
 *
 * 退出码：有 FAIL 时返回 1（可用于 CI）。
 */
import { execFileSync } from "node:child_process";

const GIT = process.env.GIT_BIN || "git";
const GH = process.env.GH_BIN || "gh";
const REMOTE = "https://github.com/1008611-creater/no.2zhihu.git";
const BASE_BRANCH = "main";

function sh(bin, argv) {
  try {
    return execFileSync(bin, argv, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  } catch (e) {
    return `__ERR__ ${String(e.stderr || e.message).split("\n")[0].slice(0, 140)}`;
  }
}
const git = (...a) => sh(GIT, a);
const gh = (...a) => sh(GH, a);

/** 取 OPEN PR（或指定编号）。 */
function listPrs(want) {
  if (want.length) {
    return want.map((n) => {
      const raw = gh("pr", "view", String(n), "--json",
        "number,title,headRefName,headRefOid,mergeable,mergeStateStatus,baseRefName");
      try { return JSON.parse(raw); } catch { return null; }
    }).filter(Boolean);
  }
  const raw = gh("pr", "list", "--state", "open", "--limit", "30", "--json",
    "number,title,headRefName,headRefOid,mergeable,mergeStateStatus,baseRefName");
  try { return JSON.parse(raw); } catch { return []; }
}

/* ───────────────────────── 判据（可维护处） ───────────────────────── */

/** 真凭证：出现即 FAIL。刻意排除占位符与文档示例。 */
const SECRET_RULES = [
  { re: /ZHIHU_ACCESS_SECRET\s*=\s*\S+/, what: "知乎 Access Secret 赋值" },
  { re: /ZHIHU_OAUTH_APP_KEY\s*=\s*\S+/, what: "知乎 App Key 赋值" },
  { re: /-----BEGIN\s+(?:RSA\s+|OPENSSH\s+|EC\s+)?PRIVATE KEY-----/, what: "私钥块" },
  { re: /\bghp_[A-Za-z0-9]{20,}/, what: "GitHub PAT" },
  { re: /\bgithub_pat_[A-Za-z0-9_]{20,}/, what: "GitHub fine-grained PAT" },
  { re: /\bsk-[A-Za-z0-9]{24,}/, what: "OpenAI 风格 key" },
  { re: /\bAKIA[0-9A-Z]{16}\b/, what: "AWS Access Key" },
];

/** 这些路径天然含示例/文档，不参与凭证扫描。 */
const SECRET_ALLOW = [
  /\.env\.example$/, /\.md$/, /README/i, /docs\//, /\.gitignore$/,
  /audit-precheck\.mjs$/, // 本脚本自身的规则表
];

const isPlaceholder = (line) =>
  /your[-_ ]|xxxx|placeholder|<[^>]+>|\$\{|\.\.\.|示例|占位|redact|REDACTED|\.\.\.\./i.test(line);

/** 分层规则（AGENTS.md §2 + 审计基线 2）。 */
const LAYER_RULES = [
  {
    match: (f) => f.startsWith("lib/domain/"),
    re: /process\.env/,
    what: "lib/domain 不得读 process.env",
  },
  {
    match: (f) => f.startsWith("lib/domain/"),
    re: /import\s+["']server-only["']/,
    what: "lib/domain 不得依赖 server-only",
  },
  {
    match: (f) => /^(components|app)\//.test(f) && !f.startsWith("app/api/"),
    re: /^\s*import\s+(?!type\b)[^;]*from\s+["']@\/lib\/zhihu["']/m,
    what: "客户端侧只允许 `import type` 取 lib/zhihu",
  },
];

/* ───────────────────────── 检查实现 ───────────────────────── */

/**
 * 取 PR 相对 merge-base 的新增行（只看 + 行）。
 *
 * ⚠ 必须用**权威 mainSha** 算 merge-base，不能用本地 `origin/main` ——
 * 沙箱下 refs 常落不了盘，`origin/main` 会陈旧，算出的 merge-base 偏早，
 * 于是 diff 里混进大量不属于该 PR 的改动（实测：只改 scripts/ 的 PR 被报
 * 「lib/domain 读了 process.env」）。
 */
function addedLines(sha, mainSha) {
  const mb = git("merge-base", mainSha, sha);
  if (mb.startsWith("__ERR__")) return null;
  const diff = git("diff", "--unified=0", mb, sha);
  if (diff.startsWith("__ERR__")) return null;
  const out = [];
  let file = null;
  for (const line of diff.split("\n")) {
    if (line.startsWith("+++ b/")) { file = line.slice(6); continue; }
    if (line.startsWith("+") && !line.startsWith("+++")) out.push({ file, text: line.slice(1) });
  }
  return out;
}

function checkPr(pr, mainSha) {
  const res = { number: pr.number, title: pr.title, fails: [], warns: [], notes: [] };
  const sha = pr.headRefOid;

  // 1. 冲突。GitHub 的 mergeable 作兜底 —— merge-tree 取不到对象时仍能判，
  //    否则「取不到对象」会被误当成「无冲突」（实测 #11 是 CONFLICTING 却判了 PASS）。
  if (pr.mergeable === "CONFLICTING") {
    res.fails.push(`GitHub 判定与 main 冲突（mergeStateStatus=${pr.mergeStateStatus}）`);
  }
  const mt = git("merge-tree", "--write-tree", "--name-only", mainSha, sha);
  if (mt.startsWith("__ERR__")) {
    res.warns.push("取不到对象 —— 冲突未独立复核（需先 fetch 该 sha）");
  } else {
    const conflicts = mt.split("\n").filter(Boolean).slice(1);
    if (conflicts.length) res.fails.push(`与 main 冲突 ${conflicts.length} 个文件：${conflicts.slice(0, 4).join(", ")}`);
  }

  // 2. 意外删除
  const mb = git("merge-base", mainSha, sha);
  if (!mb.startsWith("__ERR__")) {
    const deleted = git("diff", "--diff-filter=D", "--name-only", mb, sha)
      .split("\n").filter(Boolean);
    if (deleted.length) {
      res.warns.push(`删除了 ${deleted.length} 个文件（需人工确认是否有意）：${deleted.slice(0, 5).join(", ")}${deleted.length > 5 ? " …" : ""}`);
    }
  }

  // 3+4. 扫新增行：凭证 / 分层
  const added = addedLines(sha, mainSha);
  if (!added) {
    res.notes.push("取不到 diff");
  } else {
    const secretHits = new Set();
    const layerHits = new Set();
    for (const { file, text } of added) {
      if (file && !SECRET_ALLOW.some((re) => re.test(file)) && !isPlaceholder(text)) {
        for (const r of SECRET_RULES) {
          if (r.re.test(text)) secretHits.add(`${file} → ${r.what}`);
        }
      }
      if (file) {
        for (const r of LAYER_RULES) {
          if (r.match(file) && r.re.test(text)) layerHits.add(`${file} → ${r.what}`);
        }
      }
    }
    for (const s of secretHits) res.fails.push(`疑似凭证入库：${s}`);
    for (const s of layerHits) res.fails.push(`分层违规：${s}`);
  }

  // 5. 接线检查：新增的 export 是否有调用点（只查函数/常量，跳过 type/interface）
  if (!mb.startsWith("__ERR__")) {
    const diff = git("diff", mb, sha);
    if (!diff.startsWith("__ERR__")) {
      const symbols = new Set();
      for (const line of diff.split("\n")) {
        if (!line.startsWith("+")) continue;
        const m = line.match(/^\+\s*export\s+(?:async\s+)?(?:function|const)\s+([A-Za-z_$][\w$]*)/);
        if (m) symbols.add(m[1]);
      }
      const orphan = [];
      for (const sym of symbols) {
        // 全仓库出现次数：定义 1 次 + 调用 ≥1 次 → ≥2
        const n = git("grep", "-c", "-w", sym, sha).split("\n").filter(Boolean).length;
        const total = git("grep", "-w", sym, sha).split("\n").filter(Boolean)
          .reduce((acc, l) => acc + (parseInt(l.split(":").pop(), 10) || 0), 0);
        if (n <= 1 && total <= 1) orphan.push(sym);
      }
      if (orphan.length) {
        res.warns.push(`新增导出但没有调用点（可能是「定义了没人用」）：${orphan.slice(0, 6).join(", ")}`);
      }
    }
  }

  return res;
}

/* ───────────────────────── 主流程 ───────────────────────── */

const want = process.argv.slice(2).filter((a) => /^\d+$/.test(a));
const mainSha = git("ls-remote", REMOTE, `refs/heads/${BASE_BRANCH}`).split(/\s+/)[0];
if (!mainSha || mainSha.startsWith("__ERR__")) {
  console.error("取不到 main 的权威 sha");
  process.exit(2);
}

const prs = listPrs(want);
if (!prs.length) {
  console.log("没有 OPEN PR。");
  process.exit(0);
}

// 按字面 sha 拉对象（沙箱下 refs 落不了盘）
git("fetch", REMOTE, mainSha, ...prs.map((p) => p.headRefOid));
git("fetch", REMOTE, `${BASE_BRANCH}:refs/remotes/origin/${BASE_BRANCH}`);

console.log("═".repeat(72));
console.log(`PR 合并前预检   main=${mainSha.slice(0, 8)}   ${prs.length} 个 PR`);
console.log("═".repeat(72));

let failCount = 0;
for (const pr of prs) {
  const r = checkPr(pr, mainSha);
  const verdict = r.fails.length ? "FAIL" : r.warns.length ? "WARN" : "PASS";
  if (r.fails.length) failCount++;
  const mark = verdict === "PASS" ? "✓" : verdict === "WARN" ? "!" : "✗";
  console.log(`\n${mark} #${pr.number}  ${verdict}   ${pr.mergeable}/${pr.mergeStateStatus}`);
  console.log(`   ${String(pr.title).slice(0, 70)}`);
  for (const f of r.fails) console.log(`   ✗ ${f}`);
  for (const w of r.warns) console.log(`   ! ${w}`);
  for (const n of r.notes) console.log(`   · ${n}`);
  if (!r.fails.length && !r.warns.length) console.log("   ✓ 机械项全过（仍需人工看改动是否符合意图）");
}

console.log("\n" + "─".repeat(72));
console.log(`机械项：${failCount} 个 FAIL / ${prs.length} 个 PR`);
console.log("⚠ 本脚本只覆盖可机械判定的项。以下仍须人工：");
console.log("   · 改动是否符合 PR 描述与用户意图");
console.log("   · 是否编造数据（铁律 2）、是否保留来源与作者（铁律 3）");
console.log("   · 产品行为是否退化（需要跑起来看，不是读 diff）");
console.log();
process.exit(failCount ? 1 : 0);
