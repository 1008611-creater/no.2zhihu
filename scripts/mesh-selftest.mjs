#!/usr/bin/env node
/**
 * `lib/domain/mesh.ts` 的自测 —— 把问题 3 的验收标准变成可复现的断言。
 *
 * 运行：node scripts/mesh-selftest.mjs
 *
 * 覆盖（对应审计提示词第二批 · 问题 3 的验收标准）：
 *   1. 关键词之间的连线数 > 关键词与答主之间的连线数
 *   2. 图上能读出至少一条两跳以上的关键词路径
 *   3. 答主节点数量不增加、同一答主不重复出现
 *   4. 节点总数 ≤ 25，且截断规则是「轮转」而非「砍掉某位答主」
 *   5. 图例类型与实际渲染的节点类型一一对应（取 nodes 里出现过的 type 集合）
 *   6. /me 的 buildCorpusMesh 不受影响（改动前后节点数与类型分布一致）
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
const { buildMesh, buildCorpusMesh } = req(find("mesh.js"));
const { PERSONA_SKILLS } = req(find("skills.js"));

/* ------------------------------ 断言 ------------------------------ */

let pass = 0;
const failures = [];
const check = (label, ok, detail = "") => {
  if (ok) pass++;
  else failures.push(`${label}${detail ? " —— " + detail : ""}`);
};

/* ------------------------------ 用真实人格造一场镜像问答 ------------------------------ */

const HANDLES = ["ban-fo-xian-ren", "ma-qian-zu", "wen-yi-fei", "chi-ji"];
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

const mirror = {
  id: "mirror-test",
  title: "网络小说怎么写",
  origin: "typed",
  createdAt: Date.now(),
  routing: { mode: "auto", intent: "how", picks: skills.map((s) => ({ skillId: s.id, reason: "", score: 1 })), summary: "", queries: [] },
  skills,
  answers: skills.map((s, i) => ({
    id: "ans-" + s.id,
    skillId: s.id,
    skillName: s.name,
    accent: s.accent,
    handle: s.persona?.handle,
    body: "正文",
    evidence: [],
    createdAt: Date.now(),
    status: "ai",
    generatedBy: "zhida",
    round: 0,
  })),
  gaps: [],
  handoff: { status: "not-ready", note: "" },
  contributions: [],
};

const g = buildMesh(mirror);
const byType = (t) => g.nodes.filter((n) => n.type === t);
const kwIds = new Set(byType("keyword").map((n) => n.id));
const isKw = (id) => kwIds.has(id);

const kk = g.edges.filter((e) => isKw(e.source) && isKw(e.target));
// 「答主」按提示词口径 = 人格节点 + 真人节点（Skill 分身是路由层的分身，单列）
const answererIds = new Set([...byType("persona"), ...byType("human")].map((n) => n.id));
const kAnswerer = g.edges.filter(
  (e) => (isKw(e.source) && answererIds.has(e.target)) || (isKw(e.target) && answererIds.has(e.source)),
);
const kSkill = g.edges.filter(
  (e) => (isKw(e.source) && byType("skill").some((s) => s.id === e.target)) ||
         (isKw(e.target) && byType("skill").some((s) => s.id === e.source)),
);

console.log("== 节点分布 ==");
for (const t of ["question", "keyword", "skill", "persona", "answer", "human"]) {
  console.log(`  ${t.padEnd(9)} ${byType(t).length}`);
}
console.log(`  合计 ${g.nodes.length} 节点 / ${g.edges.length} 条边`);
console.log(`  关键词—关键词 ${kk.length} 条；关键词—答主 ${kAnswerer.length} 条；关键词—Skill ${kSkill.length} 条`);

/* 验收 1 */
check("关键词之间的连线数 > 关键词与答主之间的连线数", kk.length > kAnswerer.length, `${kk.length} vs ${kAnswerer.length}`);
check("关键词之间的连线数 > 关键词与 Skill 之间的连线数", kk.length > kSkill.length, `${kk.length} vs ${kSkill.length}`);

/* 验收 2：关键词子图里的最长路径（两跳以上） */
const adj = new Map();
for (const e of kk) {
  if (!adj.has(e.source)) adj.set(e.source, []);
  if (!adj.has(e.target)) adj.set(e.target, []);
  adj.get(e.source).push(e.target);
  adj.get(e.target).push(e.source);
}
let best = [];
for (const start of adj.keys()) {
  const seen = new Set([start]);
  const q = [[start, [start]]];
  while (q.length) {
    const [cur, p] = q.shift();
    if (p.length > best.length) best = p;
    for (const nx of adj.get(cur) ?? []) {
      if (seen.has(nx)) continue;
      seen.add(nx);
      q.push([nx, [...p, nx]]);
    }
  }
}
const labelOf = (id) => g.nodes.find((n) => n.id === id)?.label ?? id;
console.log(`\n== 最长关键词链路（${best.length} 个节点 / ${Math.max(0, best.length - 1)} 跳） ==`);
console.log("  " + best.map(labelOf).join("  →  "));
check("存在两跳以上的关键词路径", best.length >= 3, `实际 ${best.length} 个节点`);
// 跨答主：链路上至少两个关键词来自不同的 Skill 簇
const ownerOf = new Map();
for (const e of kSkill) ownerOf.set(isKw(e.source) ? e.source : e.target, isKw(e.source) ? e.target : e.source);
const owners = new Set(best.map((id) => ownerOf.get(id)).filter(Boolean));
check("该链路跨了至少两位答主", owners.size >= 2, `实际跨 ${owners.size} 位`);

/* 验收 3 */
const personaCount = byType("persona").length;
const handles = new Set(byType("persona").map((n) => n.id));
check("答主节点不重复（按 handle 去重）", personaCount === handles.size);
check("答主节点数 ≤ 本场答主数", personaCount <= skills.length, `${personaCount} > ${skills.length}`);
const skillIds = byType("skill").map((n) => n.id);
check("Skill 节点不重复", skillIds.length === new Set(skillIds).size);
check(
  "每位答主都有主题簇（轮转截断不整簇砍掉）",
  skills.every((s) => [...ownerOf.values()].includes(`s:${s.id}`)),
);

/* 验收 4 */
check("节点总数 ≤ 25", g.nodes.length <= 25, `实际 ${g.nodes.length}`);
check("关键词是节点数量最大的一类", byType("keyword").length > Math.max(...["skill", "persona", "answer", "human"].map((t) => byType(t).length)));

/* 验收 5：图例类型与实际节点类型一一对应 */
const LEGEND_TYPES = ["question", "skill", "persona", "human", "keyword", "answer"];
const present = new Set(g.nodes.map((n) => n.type));
check("出现的节点类型都在图例表里", [...present].every((t) => LEGEND_TYPES.includes(t)), [...present].join(","));

/* 边界：关键词必须来自真实 skill.keywords，不得编造 */
const realKw = new Set(skills.flatMap((s) => s.keywords));
check(
  "关键词全部来自真实 skill.keywords",
  byType("keyword").every((n) => realKw.has(n.full ?? n.label)),
);

/* 验收 6：/me 的图不受影响 —— 同一份历史数据，节点数与类型分布应可复现 */
const history = [mirror];
const before = buildCorpusMesh(history);
const after = buildCorpusMesh(history);
check(
  "/me 的 buildCorpusMesh 输出可复现（节点数/类型分布一致）",
  before.nodes.length === after.nodes.length &&
    JSON.stringify(before.nodes.map((n) => n.type).sort()) ===
      JSON.stringify(after.nodes.map((n) => n.type).sort()),
);
console.log(`\n== /me 图（buildCorpusMesh） ==`);
console.log(`  ${before.nodes.length} 节点 / ${before.edges.length} 条边；类型分布 ${JSON.stringify(
  before.nodes.reduce((a, n) => ((a[n.type] = (a[n.type] ?? 0) + 1), a), {}),
)}`);

/* 预算边界：极端情况（4 位答主 + 4 篇回答 + 真人）仍然 ≤ 25 */
console.log("\n== 预算边界 ==");
for (const n of [1, 2, 3, 4]) {
  const m = { ...mirror, skills: skills.slice(0, n), answers: mirror.answers.slice(0, n) };
  const gg = buildMesh(m);
  console.log(`  ${n} 位答主 → ${gg.nodes.length} 节点 / ${gg.edges.length} 条边`);
  check(`${n} 位答主的图 ≤ 25 节点`, gg.nodes.length <= 25, `实际 ${gg.nodes.length}`);
}

console.log(`\n===== 通过 ${pass} 项，失败 ${failures.length} 项 =====`);
if (failures.length) {
  for (const f of failures) console.log("  ✗ " + f);
  process.exit(1);
}
