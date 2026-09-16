#!/usr/bin/env node
/**
 * `lib/domain/mesh.ts` 的自测 —— 现在只测「我的 Mesh」这一张网。
 *
 * 运行：node scripts/mesh-selftest.mjs
 *
 * 2026-09-17：本场关系图（`buildMesh`）已下线（owner：「这场生成出来的关系，
 * 功能一直没太做好，可以先删」）。原来那份脚本的一半断言都在测它，一并删掉；
 * 它的**删除本身**由 `check-square-crowd.mjs` 的守卫⑥守住（不许留死链、不许留假承诺）。
 *
 * 这里剩下的是 `/me`「我的 Mesh」的验收：
 *   1. 同一份历史必须得到同一张网（评委要能复现同一个画面）
 *   2. 空历史 → 空图（不是报错、也不是编一条出来）
 *   3. 问题节点数 == 历史条数，一人一问不重不漏
 *   4. 关键词全部来自真实 `skill.keywords`，一个都不许编
 *   5. 关键词节点数受 MAX_KEYWORDS 限制（不画成毛线团）
 *   6. 每条边的两端节点都必须真实存在（不许有悬空边）
 *   7. 边的数量 == 各问题命中的保留关键词之和（多一条少一条都说明口径漂了）
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, ".mesh-selftest");

/* ------------------------------ 编译 ------------------------------ */

execFileSync(
  process.execPath,
  [
    path.join(ROOT, "node_modules/typescript/bin/tsc"),
    path.join(ROOT, "lib/domain/mesh.ts"),
    path.join(ROOT, "lib/domain/skills.ts"),
    "--outDir", OUT,
    "--module", "commonjs",
    "--target", "ES2022",
    "--moduleResolution", "node",
    "--skipLibCheck",
    "--esModuleInterop",
  ],
  { cwd: ROOT, stdio: "pipe" },
);

const find = (name) => {
  const hits = [];
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name === name) hits.push(p);
    }
  };
  walk(OUT);
  if (!hits.length) throw new Error("compiled " + name + " not found");
  return hits[0];
};

const req = createRequire(import.meta.url);
const { buildCorpusMesh } = req(find("mesh.js"));
const { PERSONA_SKILLS } = req(find("skills.js"));

/* ------------------------------ 断言 ------------------------------ */

let pass = 0;
const failures = [];
const check = (label, ok, detail = "") => {
  if (ok) pass++;
  else failures.push(`${label}${detail ? " —— " + detail : ""}`);
};

/* --------------------------- 用真实人格造一份历史 --------------------------- */

const HANDLES = ["banfoxianren", "shui-qian-xiao-xi", "wen-yi-fei-31", "mulianghai"];
const skills = HANDLES.map((h) => {
  const base = PERSONA_SKILLS.find((s) => s.persona?.handle === h);
  return {
    ...base,
    query: "网络小说怎么写",
    confidence: 0.8,
    sources: [
      { title: "网文写作十年，说点真话", author: "老张", url: "https://www.zhihu.com/question/1/answer/1", excerpt: "网络小说的节奏与爽点结构，跟传统文学完全是两套评价体系。", voteUp: 3200, editTime: 0, confidence: 0.8 },
      { title: "从工厂到互联网：我这十年", author: "小李", url: "https://www.zhihu.com/question/1/answer/2", excerpt: "互联网商业模式的变化，本质上反映的是供应链成本结构的变化。", voteUp: 1800, editTime: 0, confidence: 0.8 },
    ],
  };
});

const makeMirror = (id, title) => ({
  id,
  title,
  origin: "typed",
  createdAt: 1700000000000,
  routing: { mode: "auto", intent: "how", picks: skills.map((s) => ({ skillId: s.id, reason: "", score: 1 })), summary: "", queries: [] },
  skills,
  answers: skills.map((s) => ({
    id: `ans-${id}-${s.id}`,
    skillId: s.id,
    skillName: s.name,
    accent: s.accent,
    handle: s.persona?.handle,
    body: "正文",
    evidence: [],
    createdAt: 1700000000000,
    status: "ai",
    generatedBy: "zhida",
    round: 0,
  })),
  gaps: [],
  handoff: { status: "not-ready", note: "" },
  contributions: [],
});

const history = [
  makeMirror("mirror-a", "网络小说怎么写"),
  makeMirror("mirror-b", "30 岁从大厂转行做独立开发，值得吗"),
  makeMirror("mirror-c", "为什么现在很多年轻人不想结婚"),
];

/* 验收 1：可复现 */
const before = buildCorpusMesh(history);
const after = buildCorpusMesh(history);
check(
  "同一份历史得到同一张网（节点数 / 边数 / 类型分布一致）",
  before.nodes.length === after.nodes.length &&
    before.edges.length === after.edges.length &&
    JSON.stringify(before.nodes.map((n) => n.type).sort()) ===
      JSON.stringify(after.nodes.map((n) => n.type).sort()),
);

/* 验收 2：空历史 */
const empty = buildCorpusMesh([]);
check("空历史得到空图（不报错、也不编一条出来）", empty.nodes.length === 0 && empty.edges.length === 0);

const byType = (g, t) => g.nodes.filter((n) => n.type === t);
const ids = new Set(before.nodes.map((n) => n.id));

/* 验收 3：一人一问 */
const qCount = byType(before, "question").length;
check("问题节点数 == 历史条数", qCount === history.length, `${qCount} vs ${history.length}`);
check("问题节点 id 不重复", qCount === new Set(byType(before, "question").map((n) => n.id)).size);

/* 验收 4：关键词不许编 */
const realKw = new Set(history.flatMap((m) => m.skills.flatMap((s) => s.keywords.slice(0, 3).map((k) => k.trim()))));
const kws = byType(before, "keyword");
check(
  "关键词全部来自真实 skill.keywords",
  kws.length > 0 && kws.every((n) => realKw.has(n.label)),
  kws.filter((n) => !realKw.has(n.label)).map((n) => n.label).join(","),
);

/* 验收 5：不许画成毛线团 */
check("关键词节点数 ≤ 24（MAX_KEYWORDS）", kws.length <= 24, `实际 ${kws.length}`);

/* 验收 6：不许有悬空边 */
const dangling = before.edges.filter((e) => !ids.has(e.source) || !ids.has(e.target));
check("没有悬空边（每条边的两端节点都存在）", dangling.length === 0, `${dangling.length} 条悬空`);

/* 验收 7：边数与口径一致 —— 每个问题连到它命中的保留关键词 */
const keptKw = new Set(kws.map((n) => n.id));
let expected = 0;
for (const m of history) {
  const hit = new Set();
  for (const s of m.skills) for (const k of s.keywords.slice(0, 3)) if (k.trim()) hit.add(`ck:${k.trim()}`);
  expected += [...hit].filter((id) => keptKw.has(id)).length;
}
check("边数 == 各问题命中的保留关键词之和", before.edges.length === expected, `${before.edges.length} vs ${expected}`);

console.log("\n== 我的 Mesh（buildCorpusMesh） ==");
console.log(`  ${before.nodes.length} 节点 / ${before.edges.length} 条边`);
for (const t of ["question", "keyword"]) {
  console.log(`  ${t.padEnd(9)} ${byType(before, t).length}`);
}
console.log(`  类型分布 ${JSON.stringify(
  before.nodes.reduce((a, n) => ((a[n.type] = (a[n.type] ?? 0) + 1), a), {}),
)}`);

console.log(`\n===== 通过 ${pass} 项，失败 ${failures.length} 项 =====`);
if (failures.length) {
  for (const f of failures) console.log("  ✗ " + f);
  process.exit(1);
}
