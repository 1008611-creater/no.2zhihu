#!/usr/bin/env node
/**
 * PR 队列体检 —— 一条命令回答「现在能不能再提一个 PR」。
 *
 * 为什么需要它：本仓库实测过「两条线程各自独立做完同一个 IA 重构」（PR #9 / #12，
 * 改同一批 7 个文件），冲突矩阵只能告诉你「它们冲突」，不能告诉你「它们不该同时存在」。
 * 而 main 开了分支保护 `strict: true`（分支必须与 main 同步才能合）之后，
 * **每合并 1 个 PR，其余所有在途 PR 全部失效、必须 rebase** ——
 * 队列长度 N 时，每合 1 个产生 N-1 次返工。这是本仓库审计/上线速度跟不上的根因。
 *
 * 所以提交前先看队列，而不是提交后被队列堵住。
 *
 * 用法：
 *   node scripts/pr-queue.mjs              # 体检当前仓库
 *   node scripts/pr-queue.mjs --json       # 机器可读
 *   GH=/path/to/gh node scripts/pr-queue.mjs
 *
 * 退出码：0 = 队列健康；1 = 超出 WIP 上限（建议先合掉再开新分支）；2 = 无法读取仓库信息
 */

import { execFileSync } from "node:child_process";

/** WIP 上限：同一时间最多允许几个在途 PR。超过它就是「越努力越慢」。 */
const WIP_LIMIT = 2;

const GH = process.env.GH || "gh";

function gh(args) {
  return execFileSync(GH, args, { encoding: "utf-8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

function ghJson(args) {
  const out = gh(args);
  return out ? JSON.parse(out) : null;
}

/** 仓库标识取自当前 git remote，避免硬编码 owner/repo。 */
function repoSlug() {
  const url = execFileSync("git", ["remote", "get-url", "origin"], { encoding: "utf-8" }).trim();
  // 仓库名里可能带点（no.2zhihu），所以不能用 [^/.]+
  const m = url.match(/github\.com[:/]([^/]+)\/([^/]+?)(?:\.git)?\/?$/);
  if (!m) throw new Error(`无法从 origin 解析出 GitHub 仓库：${url}`);
  return `${m[1]}/${m[2]}`;
}

function minutesSince(iso) {
  return Math.round((Date.now() - new Date(iso).getTime()) / 60000);
}

function fmtAge(min) {
  if (min < 60) return `${min}m`;
  return `${Math.floor(min / 60)}h${String(min % 60).padStart(2, "0")}m`;
}

/** dirty / behind 都是「必须先同步再合」的状态，这里统一叫「需返工」。 */
const NEEDS_REBASE = new Set(["dirty", "behind"]);

function main() {
  const slug = repoSlug();
  const open = ghJson([
    "pr", "list", "--repo", slug, "--state", "open", "--limit", "50",
    "--json", "number,title,headRefName,createdAt,additions,deletions,changedFiles",
  ]) ?? [];

  const prs = open.map((p) => {
    const d = ghJson(["api", `repos/${slug}/pulls/${p.number}`]) ?? {};
    return {
      number: p.number,
      title: p.title,
      head: p.headRefName,
      ageMin: minutesSince(p.createdAt),
      state: d.mergeable_state ?? "unknown",
      files: (d.changed_files ?? p.changedFiles ?? 0),
      additions: d.additions ?? p.additions ?? 0,
      deletions: d.deletions ?? p.deletions ?? 0,
      fileList: [],
    };
  });

  // 文件清单要单独取（list 接口不带 files）
  for (const pr of prs) {
    const f = ghJson(["api", `repos/${slug}/pulls/${pr.number}/files?per_page=100`]) ?? [];
    pr.fileList = f.map((x) => x.filename);
  }

  if (process.argv.includes("--json")) {
    process.stdout.write(JSON.stringify({ slug, wipLimit: WIP_LIMIT, prs }, null, 2) + "\n");
    return prs.length > WIP_LIMIT ? 1 : 0;
  }

  const line = "═".repeat(74);
  console.log(`\n${line}\n  PR 队列体检   ${slug}   ${new Date().toLocaleString("zh-CN")}\n${line}`);

  const over = prs.length > WIP_LIMIT;
  console.log(`在途 PR：${prs.length} 个   （WIP 上限 ${WIP_LIMIT}）${over ? `  ⚠️ 超出 ${prs.length - WIP_LIMIT} 个` : "  ✓ 健康"}`);
  if (prs.length === 0) {
    console.log("\n  队列空 —— 可以放心开新分支。\n");
    return 0;
  }

  const dirty = prs.filter((p) => NEEDS_REBASE.has(p.state));
  console.log(`需先同步 main：${dirty.length} / ${prs.length}\n`);

  const width = Math.max(...prs.map((p) => p.head.length));
  for (const p of [...prs].sort((a, b) => b.ageMin - a.ageMin)) {
    const flag = NEEDS_REBASE.has(p.state) ? "需返工" : "  可合";
    console.log(
      `  #${String(p.number).padEnd(3)} ${flag}  ${fmtAge(p.ageMin).padStart(6)}  ` +
      `+${p.additions}/-${p.deletions}  ${String(p.files).padStart(3)} 文件  ` +
      `${p.head.padEnd(width)}  ${p.title.slice(0, 34)}`,
    );
  }

  // 两两之间的文件重叠 —— 比读标题准，重叠 = 语义撞车点
  const overlaps = [];
  for (let i = 0; i < prs.length; i++) {
    for (let j = i + 1; j < prs.length; j++) {
      const a = new Set(prs[i].fileList);
      const shared = prs[j].fileList.filter((f) => a.has(f));
      if (shared.length) overlaps.push({ a: prs[i], b: prs[j], shared });
    }
  }

  console.log("\n文件重叠（改同一批文件的 PR 对 —— 强信号：可能在重复劳动）");
  if (!overlaps.length) {
    console.log("  无 —— 各 PR 改的文件互不相交");
  } else {
    for (const o of overlaps.sort((x, y) => y.shared.length - x.shared.length)) {
      console.log(`  #${o.a.number} ↔ #${o.b.number}   ${o.shared.length} 个文件：${o.shared.slice(0, 4).join("、")}${o.shared.length > 4 ? " …" : ""}`);
      if (o.shared.length >= 3) {
        console.log(`        ↑ 重叠 ${o.shared.length} 个文件，先确认是不是同一件事的两个版本`);
      }
    }
  }

  const oldest = [...prs].sort((a, b) => b.ageMin - a.ageMin)[0];
  console.log(`\n最老在途：${oldest.head} 已挂 ${fmtAge(oldest.ageMin)}（#${oldest.number}）`);

  console.log(`\n${line}`);
  if (over) {
    console.log("  结论：⚠️ 队列已超上限 —— 先把在途的清掉，再开新分支。");
    console.log("        队列越长，每个 PR 的返工次数越多，合并会越来越慢（正反馈）。");
  } else {
    console.log("  结论：✓ 可以提新 PR。提交前再跑一次 verify-merge.mjs。");
  }
  console.log(`${line}\n`);
  return over ? 1 : 0;
}

try {
  process.exit(main());
} catch (e) {
  console.error(`\n!! 读取 PR 队列失败：${e.message}\n   先确认 gh 已登录（gh auth status）且有该仓库权限。\n`);
  process.exit(2);
}
