#!/usr/bin/env node
/**
 * `lib/domain/voice.ts` 的自测 —— 把验收标准逐条变成可复现的断言。
 *
 * 为什么不用测试框架：仓库没有测试栈，装一套 jest/vitest 的收益远小于成本；
 * 而这一层的判据全是纯函数，用 node 直跑 + 断言即可，评委也能一条命令复现。
 *
 * 运行：node scripts/voice-selftest.mjs
 *
 * 覆盖（对应审计提示词第二批 · 问题 4 的验收标准）：
 *   1. ≥6 个正例 + ≥6 个反例（正例含「真人会写但看似命中」的句子）
 *   2. ≥10 个中文 S1 命中实例
 *   3. stripClosing 不误删有实质信息的结论句（上一轮踩过的坑）
 *   4. 每个被禁构造都有正面出口（AI_TRACE_REWRITES 覆盖度检查）
 *   5. 真实语料上的触发率测算（public/square-library.json，66 篇真实生成结果）
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, ".voice-selftest");

/* ------------------------------ 编译 voice.ts ------------------------------ */

const ts = createRequire(import.meta.url)("typescript");
const src = fs.readFileSync(path.join(ROOT, "lib/domain/voice.ts"), "utf8");
const js = ts.transpileModule(src, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
    removeComments: false,
  },
  fileName: "voice.ts",
}).outputText;

fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, "voice.cjs"), js, "utf8");
const V = createRequire(import.meta.url)(path.join(OUT, "voice.cjs"));

/* ------------------------------ 宽松人格：只让「AI 痕迹层」说话 ------------------------------ */

const permissive = {
  handle: "selftest",
  displayName: "自测人格",
  headline: "自测用",
  accent: "blue",
  knows: [],
  stance: [],
  doesNotKnow: [],
  catchphrases: [],
  voice: {
    sentenceLength: "mixed",
    wordRange: [1, 100000],
    tone: [],
    usesLists: true,
    emotion: 0.5,
    exampleStyle: "",
    summary: "",
    // 段落区间放宽到 1–200，保证「篇幅 / 段落数」两条旧判据不参与，
    // 这样测出来的命中全部来自本次新增的 AI 痕迹层。
    punctuation: "整篇 1–200 段",
  },
  corpus: { sampleSize: 0, capturedAt: "", real: false, sources: [] },
};

/* ------------------------------ 断言 ------------------------------ */

let pass = 0;
const failures = [];

function check(label, ok, detail = "") {
  if (ok) {
    pass++;
  } else {
    failures.push(`${label}${detail ? " —— " + detail : ""}`);
  }
}

const ids = (hits) => [...new Set(hits.map((h) => h.id))].join(",");

/* ------------------------------ 1. 反例：应当被判定的构造 ------------------------------ */

const BAD = [
  { text: "这不是钱的问题，而是信任的问题。", id: "§1" },
  { text: "与其说这是技术问题，不如说是管理问题。", id: "§1" },
  { text: "账算得很清楚。这才是关键。", id: "§2" },
  { text: "不解释。不铺垫。不妥协。", id: "§2" },
  { text: "本质上，这是一个资源分配的问题。", id: "§3" },
  { text: "先说结论：这个项目不值得投。", id: "§4" },
  { text: "有人可能会说这是运气，我不这么看。", id: "§5" },
  { text: "研究表明，九成的创业公司活不过三年。", id: "§17" },
  { text: "这个安排体现了团队的用心。", id: "§15" },
  { text: "这种体验令人惊艳，不容错过。", id: "§16" },
  { text: "这件事标志着行业进入了新阶段。", id: "§13" },
  { text: "希望对你有所帮助。", id: "§22" },
  { text: "这一步很关键 → 后面就顺了。", id: "§20" },
];

console.log("== 反例（应当命中） ==");
for (const c of BAD) {
  const hits = V.detectAiTraces(c.text);
  const got = ids(hits);
  const ok = got.includes(c.id);
  check(`反例「${c.text.slice(0, 16)}」应命中 ${c.id}`, ok, `实际命中 [${got || "无"}]`);
  console.log(`${ok ? "✓" : "✗"} ${c.id.padEnd(5)} ${c.text}  → [${got || "无"}]`);
}

/* ------------------------------ 2. 正例：真人会写、看似命中 ------------------------------ */

const GOOD = [
  { text: "他——我指的是那个老同学——后来去了深圳。", why: "破折号插入语，正常用法" },
  { text: "其实我也说不好，可能就是运气。", why: "口语里的「可能」，单词不构成堆叠" },
  { text: "首先我得说清楚，这事儿跟钱没关系。", why: "「首先」当正常叙述，不是报幕" },
  { text: "这事儿没完。", why: "段末短句，但不是盖章模板" },
  { text: "我不是说这行不能干，我是说别拿全部身家去干。", why: "看似「不是…而是…」，实则不含「而是」" },
  { text: "研究表明，据《中国统计年鉴 2023》，这个数字是 4.2%。", why: "带真实出处，§17 应放行" },
  { text: "去年朋友那家店房租从 8 万涨到 14 万，撑了七个月。", why: "具体数字，无任何痕迹" },
  { text: "需要注意的是，这条不适用于所有情况。", why: "单条 S2，不该单独触发" },
  { text: "我干这行十二年，见过的失败比成功的多。", why: "第一人称经验" },
];

console.log("\n== 正例（不应判定） ==");
for (const c of GOOD) {
  const hits = V.detectAiTraces(c.text);
  const s1 = hits.filter((h) => h.severity === "S1");
  const s2 = hits.filter((h) => h.severity === "S2");
  const ok = s1.length === 0 && s2.length < 2;
  check(`正例「${c.text.slice(0, 16)}」不应判定`, ok, `S1=[${ids(s1)}] S2=[${ids(s2)}]`);
  console.log(`${ok ? "✓" : "✗"} ${c.text}  → S1=[${ids(s1) || "无"}] S2=[${ids(s2) || "无"}]  （${c.why}）`);
}

/* ------------------------------ 3. 中文 S1 实例清单 ------------------------------ */

console.log("\n== 中文 S1 命中实例（要求 ≥10） ==");
const s1Samples = [];
for (const c of BAD) {
  for (const h of V.detectAiTraces(c.text)) {
    if (h.severity === "S1") s1Samples.push({ id: h.id, what: h.what, sample: h.samples[0] });
  }
}
const uniqS1 = [];
for (const s of s1Samples) if (!uniqS1.some((x) => x.id === s.id)) uniqS1.push(s);
for (const s of uniqS1) console.log(`  ${s.id.padEnd(5)} ${s.what.padEnd(30)} 「${s.sample}」`);
check(`中文 S1 实例 ≥10`, uniqS1.length >= 10, `实际 ${uniqS1.length} 条`);

/* ------------------------------ 4. 正面出口覆盖度 ------------------------------ */

console.log("\n== 被禁构造的正面出口 ==");
for (const x of V.AI_TRACE_REWRITES) console.log(`  × ${x.avoid}\n    → ${x.instead}`);
check(
  "每条禁令都有正面出口",
  V.AI_TRACE_REWRITES.every((x) => x.avoid && x.instead && x.instead.length > 8),
);
check("正面出口 ≥10 条", V.AI_TRACE_REWRITES.length >= 10, `实际 ${V.AI_TRACE_REWRITES.length}`);

/* ------------------------------ 5. stripClosing 回归 ------------------------------ */

console.log("\n== stripClosing 回归 ==");
const KEEP = [
  "总之我劝你别碰这个，去年我朋友就亏了六十万。",
  "说完了，剩下的看你自己。",
];
const DROP = ["总之，未来可期。", "希望以上回答对你有帮助。", "以上是我的看法，仅供参考。"];

for (const t of KEEP) {
  const out = V.stripClosing(`前面还有一段正文。\n\n${t}`);
  const kept = out.includes(t);
  check(`保留有实质信息的结论「${t}」`, kept, `实际输出「${out}」`);
  console.log(`${kept ? "✓" : "✗"} 保留：${t}`);
}
for (const t of DROP) {
  const out = V.stripClosing(`前面还有一段正文。\n\n${t}`);
  const dropped = !out.includes(t);
  check(`删掉纯套话收尾「${t}」`, dropped, `实际输出「${out}」`);
  console.log(`${dropped ? "✓" : "✗"} 删掉：${t}`);
}

// 只删连接词、不吞标点（上一轮踩过的坑）
const glued = V.stripAiCliches("首先，算启动成本。其次，算时间成本。");
check("stripAiCliches 不把两句粘成一句", glued === "算启动成本。算时间成本。", `实际「${glued}」`);
console.log(`${glued === "算启动成本。算时间成本。" ? "✓" : "✗"} 句首连接词剥离：${glued}`);

/* ------------------------------ 6. needsRewrite 触发率（真实语料） ------------------------------ */

/**
 * 触发率必须用**真实人格**算，不能用宽松人格。
 *
 * 原因：旧判据里有两条依赖人格 —— 「篇幅」看 wordRange、「段落数」看 punctuation 解析出的区间。
 * 用宽松人格会把这两条人为关掉，算出来的「旧触发率」必然是 0，那这个对比就没有意义了。
 * 所以这里用 tsc 把 lib/domain/skills.ts（连带 personas/）编译出来，拿到真实人格。
 */
function loadRealPersonas() {
  try {
    const { execFileSync } = createRequire(import.meta.url)("node:child_process");
    const outDir = path.join(OUT, "ts");
    execFileSync(
      process.execPath,
      [
        path.join(ROOT, "node_modules/typescript/bin/tsc"),
        path.join(ROOT, "lib/domain/skills.ts"),
        "--outDir", outDir,
        "--module", "commonjs",
        "--target", "ES2022",
        "--moduleResolution", "node",
        "--skipLibCheck",
        "--esModuleInterop",
      ],
      { cwd: ROOT, stdio: "pipe" },
    );
    const found = [];
    const walk = (d) => {
      for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        const p = path.join(d, e.name);
        if (e.isDirectory()) walk(p);
        else if (e.name === "skills.js") found.push(p);
      }
    };
    walk(outDir);
    if (!found.length) return null;
    const mod = createRequire(import.meta.url)(found[0]);
    return mod.PERSONA_SKILLS ?? null;
  } catch (err) {
    console.log("  （真实人格编译失败，触发率退化为宽松人格口径：" + String(err).slice(0, 120) + "）");
    return null;
  }
}

const libPath = path.join(ROOT, "public/square-library.json");
if (fs.existsSync(libPath)) {
  const lib = JSON.parse(fs.readFileSync(libPath, "utf8"));
  const bodies = [];
  const walk = (v) => {
    if (!v || typeof v !== "object") return;
    if (Array.isArray(v)) return v.forEach(walk);
    if (typeof v.body === "string" && v.body.length > 40) bodies.push(v);
    for (const k of Object.keys(v)) walk(v[k]);
  };
  walk(lib.entries ?? lib);

  const skills = loadRealPersonas();
  const byName = new Map((skills ?? []).map((s) => [s.name, s]));
  const byHandle = new Map((skills ?? []).map((s) => [s.persona?.handle, s]));

  const OLD = (c) =>
    c.cliches.length > 0 || c.hasListMarkers || c.paragraphsOutOfRange || c.lengthOutOfRange;
  const NEW = (c) =>
    OLD(c) || c.s1.length > 0 || c.s2.length >= 2 || (c.paragraphs >= 4 && c.paragraphCv < 0.2);

  let oldHits = 0;
  let newHits = 0;
  let withPersona = 0;
  const tally = new Map();
  const addTally = (id) => tally.set(id, (tally.get(id) ?? 0) + 1);

  for (const b of bodies) {
    const skill =
      byHandle.get(b.handle) ??
      byName.get(b.skillName) ??
      (skills ?? []).find((s) => s.persona && b.skillName?.includes(s.persona.displayName));
    const persona = skill?.persona ?? permissive;
    if (skill?.persona) withPersona++;
    const c = V.checkVoice(b.body, persona);
    if (OLD(c)) oldHits++;
    if (NEW(c)) newHits++;
    for (const h of c.traces) addTally(h.id);
  }

  const pct = (n) => ((n / Math.max(1, bodies.length)) * 100).toFixed(1);
  console.log("\n== 真实语料触发率（public/square-library.json） ==");
  console.log(`  样本 ${bodies.length} 篇（匹配到真实人格 ${withPersona} 篇）`);
  console.log(`  旧判据（词汇黑名单 / 分点 / 篇幅 / 段数）：${oldHits} 篇（${pct(oldHits)}%）`);
  console.log(`  新判据（+ 构造级 S1 / S2 共现 / 段落长度方差）：${newHits} 篇（${pct(newHits)}%）`);
  console.log(`  → 触发率上升 ${(Number(pct(newHits)) - Number(pct(oldHits))).toFixed(1)} 个百分点`);
  console.log("  命中分布：" + [...tally.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}×${v}`).join("  "));

  // 额度测算：判据更严 ≠ 额度失控 —— lib/server/mirror.ts 的 MAX_REWRITES_PER_RUN 封顶 2 次。
  const perRunOld = (4 * oldHits) / Math.max(1, bodies.length);
  console.log(
    `  额度测算：单场 4 位答主、每位最多重写 1 次，但单场预算封顶 MAX_REWRITES_PER_RUN=2 —— ` +
      `所以额外直答调用**上限 2 次/场**（旧口径下按触发率期望 ${perRunOld.toFixed(2)} 次/场，上限 4 次）。` +
      `日额度 100 次：旧口径约 ${Math.floor(100 / Math.max(0.01, perRunOld))} 场，新口径约 50 场。`,
  );
  // 关键不变量：新判据必须是旧判据的**超集** —— 只准多抓，不准漏掉旧判据本来能抓的。
  check("新判据是旧判据的超集（没有丢检）", newHits >= oldHits, `${newHits} < ${oldHits}`);
  check("新增判据在真实语料上确实有增量", newHits > oldHits, `新旧相同（${newHits}）`);
} else {
  console.log("\n（未找到 public/square-library.json，跳过真实语料触发率测算）");
}

/* ------------------------------ 汇总 ------------------------------ */

console.log(`\n===== 通过 ${pass} 项，失败 ${failures.length} 项 =====`);
if (failures.length) {
  for (const f of failures) console.log("  ✗ " + f);
  process.exit(1);
}
