#!/usr/bin/env node
/**
 * 离线蒸馏路径的单元测试（零网络调用）。
 *
 * 为什么需要它：`test-persona.cjs` 覆盖的是**公开搜索路径**
 * （lib/server/persona.ts 的 distillPersona，只被 api/mirror/invite 调用）；
 * 而**离线路径**（persona-crawler → distill-personas）此前零测试 ——
 * 它恰好是「会整体覆盖 lib/domain/personas/*.ts」的那条路径。
 *
 * 2026-09-15 修掉的问题正出在这里：buildTs 生成的 voice 不含
 * opening / punctuation / avoid / exemplars 四个文风指纹字段，且整体覆盖写入，
 * 跑一次蒸馏就会把 16 位答主人工填好的指纹全部抹掉、文风退化回「GPT 直答」。
 * 本测试就是守这条线的回归网。
 *
 * 用法：node scripts/test-distill.mjs
 */

import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, rmSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  asArray,
  buildCorpus,
  buildTs,
  distillOne,
  extractRaw,
  parseDistill,
  readCorpus,
  readPreserved,
  stringsIn,
  wordRangeFor,
} from "./distill-personas.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PERSONA_DIR = join(ROOT, "lib", "domain", "personas");
const RAW_DIR = join(ROOT, ".personas-raw");

let checks = 0;
function ok(cond, name) {
  checks++;
  assert.ok(cond, name);
  console.log("  ✓ " + name);
}
function section(t) {
  console.log("\n" + t);
}

/* ------------------------------------------------------------------ 1. 字符串解析器 */
section("1. 字符串字面量解析（不 eval）");
ok(stringsIn('["甲", "乙"]').length === 2, "基本数组");
ok(stringsIn('["他说：\\"行\\"", "第二条"]').length === 2, "含转义引号的数组");
ok(stringsIn("[]").length === 0, "空数组");
ok(stringsIn(null).length === 0, "null 输入不炸");
ok(stringsIn('["a\\\\", "b"]')[0] === "a\\", "尾部反斜杠转义正确");

/* ------------------------------------------------------------------ 2. 字段抠取 */
section("2. extractRaw 从 TS 源里抠字段值");
const sampleSrc = [
  "export const persona: Persona = {",
  "  voice: {",
  '    opening: "我干这行十几年，这种事见过不少。",',
  '    punctuation: "几乎不用破折号；括号用来吐槽。",',
  "    avoid: [",
  '      "综上所述，我们可以看出",',
  '      "作为一个人工智能",',
  "    ],",
  "    exemplars: [",
  '      "第一句像这样。第二句收住。",',
  "    ],",
  "  },",
  "};",
].join("\n");
ok(stringsIn(extractRaw(sampleSrc, "opening"))[0] === "我干这行十几年，这种事见过不少。", "opening 抠取");
ok(stringsIn(extractRaw(sampleSrc, "punctuation")).length === 1, "punctuation 抠取");
ok(stringsIn(extractRaw(sampleSrc, "avoid")).length === 2, "avoid 数组抠取（两条）");
ok(stringsIn(extractRaw(sampleSrc, "exemplars")).length === 1, "exemplars 数组抠取");
ok(extractRaw(sampleSrc, "notThere") === null, "不存在的字段返回 null");

/* ------------------------------------------------------------------ 3. parseDistill */
section("3. parseDistill（模型输出 → 四要素）");
const valid = JSON.stringify({
  headline: "测试身份", knows: ["领域A"], stance: ["立场B"], tone: ["t1"],
  sentenceLength: "mixed", usesLists: false, emotion: 0.4,
  exampleStyle: "举例", voiceSummary: "文风摘要",
  doesNotKnow: ["不懂C"], catchphrases: ["口头禅"],
  opening: "第一句这样写。", punctuation: "每段 2-3 句。",
});
const parsed = parseDistill(valid);
ok(parsed && parsed.opening === "第一句这样写。", "新字段 opening 被收下");
ok(parsed && parsed.punctuation === "每段 2-3 句。", "新字段 punctuation 被收下");
ok(parseDistill(JSON.stringify({ knows: [], voiceSummary: "v" })) === null, "缺 knows → null");
ok(parseDistill(JSON.stringify({ knows: ["k"], voiceSummary: "" })) === null, "缺 voiceSummary → null");
ok(parseDistill("not json at all") === null, "非 JSON → null");
ok((parseDistill(JSON.stringify({ knows: ["k"], voiceSummary: "v" })) || {}).opening === "", "模型没给 opening 时回落为空串（不是 undefined）");

/* ------------------------------------------------------------------ 4. wordRangeFor */
section("4. wordRangeFor（从真实长度算区间）");
const wr = wordRangeFor([100, 200, 300, 400, 500].map((n) => ({ body: "x".repeat(n) })));
ok(Array.isArray(wr) && wr[0] >= 80 && wr[1] <= 600 && wr[1] > wr[0], "分位数区间合理且被夹到 80-600");
const wrMin = wordRangeFor([10, 20].map((n) => ({ body: "x".repeat(n) })));
ok(wrMin[0] >= 80, "极短语料仍不低于下限 80");

/* ------------------------------------------------------------------ 5. 真实答主：指纹必须抠得到 */
section("5. readPreserved 对 16 位真实答主（源文件有 → 必须抠到）");
const handles = readdirSync(PERSONA_DIR)
  .filter((f) => f.endsWith(".ts") && f !== "index.ts")
  .map((f) => f.replace(/\.ts$/, ""));
ok(handles.length >= 16, "名册至少 16 位（实际 " + handles.length + "）");

let missing = [];
for (const h of handles) {
  const src = readFileSync(join(PERSONA_DIR, h + ".ts"), "utf8");
  const p = readPreserved(h);
  const want = {
    opening: /(^|\n)\s*opening\s*:/.test(src),
    punctuation: /(^|\n)\s*punctuation\s*:/.test(src),
    avoid: /(^|\n)\s*avoid\s*:/.test(src),
    exemplars: /(^|\n)\s*exemplars\s*:/.test(src),
  };
  if (want.opening && !p.opening) missing.push(h + ":opening");
  if (want.punctuation && !p.punctuation) missing.push(h + ":punctuation");
  if (want.avoid && p.avoid.length === 0) missing.push(h + ":avoid");
  if (want.exemplars && p.exemplars.length === 0) missing.push(h + ":exemplars");
}
ok(missing.length === 0, "全部 " + handles.length + " 位答主的指纹都能抠到" + (missing.length ? "（缺：" + missing.join(",") + "）" : ""));

/* ------------------------------------------------------------------ 6. buildTs 合并写入 */
section("6. buildTs 合并写入（跑蒸馏不能抹掉指纹）");
const probe = handles[0];
const kept = readPreserved(probe);
const fake = {
  headline: "测试身份", knows: ["领域A"], stance: ["立场B"], tone: ["t1", "t2"],
  sentenceLength: "mixed", usesLists: false, emotion: 0.5,
  exampleStyle: "举例方式", voiceSummary: "文风摘要",
  doesNotKnow: ["不懂C"], catchphrases: ["口头禅"],
  opening: "",                       // 模型没给 → 应回退旧值
  punctuation: "蒸馏出来的标点。",      // 模型给了 → 应用蒸馏值
};
const built = buildTs(probe, "测试名", "blue", fake,
  { wordRange: [120, 300], sampleSize: 9, capturedAt: "2026-09-15T00:00:00Z", sources: [] }, kept);

ok(built.includes("punctuation: \"蒸馏出来的标点。\""), "punctuation 优先用蒸馏值");
ok(built.includes("opening: ") && kept.opening.length > 0, "opening 缺蒸馏值时回退旧值");
ok(kept.avoid.length === 0 || built.includes("avoid: ["), "avoid 被保留（" + kept.avoid.length + " 条）");
ok(kept.exemplars.length === 0 || built.includes("exemplars: ["), "exemplars 被保留（" + kept.exemplars.length + " 条）");
ok(built.includes("summary: \"文风摘要\""), "summary 用蒸馏值");
ok(built.includes("wordRange: [120, 300]"), "wordRange 用蒸馏值");
ok(built.includes("real: true"), "corpus.real 置为 true");

/* ------------------------------------------------------------------ 7. 坏输入 */
section("7. 坏输入不炸");
ok(readCorpus("__no_such_handle__") === null, "不存在的 handle → null");

/* ------------------------------------------------------------------ 8. 端到端 dry-run */
section("8. 端到端 dry-run（mock 直答，零网络，且绝不写文件）");
const TEST_HANDLE = handles.includes("zhang-jia-wei") ? "zhang-jia-wei" : handles[0];
const personaPath = join(PERSONA_DIR, TEST_HANDLE + ".ts");
const beforeBytes = readFileSync(personaPath, "utf8");
const rawDir = join(RAW_DIR, TEST_HANDLE);
const hadRaw = existsSync(rawDir);
let cleaned = false;

const realFetch = globalThis.fetch;
try {
  mkdirSync(rawDir, { recursive: true });
  writeFileSync(
    join(rawDir, "__fixture__.txt"),
    "问题：这是一个测试问题\n链接：https://www.zhihu.com/question/1/answer/1\n赞同：123\n---\n" +
      "这是一段用于测试的正文。".repeat(30),
    "utf8",
  );

  const reply = (obj) => ({
    ok: true,
    status: 200,
    text: async () => JSON.stringify({ choices: [{ message: { content: JSON.stringify(obj) } }] }),
  });

  // 8.1 模型给了 opening/punctuation → 都用蒸馏值
  globalThis.fetch = async () => reply({
    headline: "测试", knows: ["领域"], stance: ["立场"], tone: ["t"], sentenceLength: "mixed",
    usesLists: false, emotion: 0.5, exampleStyle: "e", voiceSummary: "v",
    doesNotKnow: ["x"], catchphrases: ["c"],
    opening: "蒸馏出来的开头。", punctuation: "蒸馏出来的标点。",
  });
  const r1 = await distillOne(TEST_HANDLE, 0, "fake-secret", true);
  ok(r1.ok === true && r1.dryRun === true, "dry-run 跑通且标记 dryRun");
  ok(r1.openingFrom === "distill" && r1.punctuationFrom === "distill", "两个字段都取蒸馏值");
  ok(r1.preservedAvoid === kept.avoid.length, "dry-run 报告保留 avoid " + r1.preservedAvoid + " 条");
  ok(r1.preservedExemplars === kept.exemplars.length, "dry-run 报告保留 exemplars " + r1.preservedExemplars + " 条");

  // 8.2 模型没给 opening → 回退旧值
  globalThis.fetch = async () => reply({
    headline: "测试", knows: ["领域"], stance: [], tone: [], sentenceLength: "short",
    usesLists: true, emotion: 0.2, exampleStyle: "e2", voiceSummary: "v2",
    doesNotKnow: [], catchphrases: [],
  });
  const r2 = await distillOne(TEST_HANDLE, 0, "fake-secret", true);
  ok(r2.openingFrom === "existing", "模型没给 opening → 回退旧值");

  // 8.3 直答返回合法响应、但 content 不是四要素 JSON → parse 失败
  //     注意：必须让 callZhida 成功，否则会先被归到 zhida 失败，测不到 parse 这一层
  globalThis.fetch = async () => ({
    ok: true,
    status: 200,
    text: async () => JSON.stringify({ choices: [{ message: { content: "这不是 JSON" } }] }),
  });
  const r3 = await distillOne(TEST_HANDLE, 0, "fake-secret", true);
  ok(r3.ok === false && r3.reason === "parse", "内容不是四要素 → 如实返回 parse 失败");

  // 8.3b 响应体本身不是 JSON → 归到 zhida 层失败
  globalThis.fetch = async () => ({ ok: true, status: 200, text: async () => "这不是 JSON" });
  const r3b = await distillOne(TEST_HANDLE, 0, "fake-secret", true);
  ok(r3b.ok === false && r3b.reason === "zhida", "响应体不是 JSON → 归 zhida 层失败");

  // 8.4 直答 HTTP 失败 → 如实失败
  globalThis.fetch = async () => ({ ok: false, status: 500, text: async () => "boom" });
  const r4 = await distillOne(TEST_HANDLE, 0, "fake-secret", true);
  ok(r4.ok === false && r4.reason === "zhida", "HTTP 失败 → 如实返回 zhida 失败");

  // 8.5 关键断言：整轮 dry-run 下来，人格文件一个字节都没变
  ok(readFileSync(personaPath, "utf8") === beforeBytes, "dry-run 全程未改动人格文件（逐字节一致）");
} finally {
  globalThis.fetch = realFetch;
  if (!hadRaw) {
    try {
      rmSync(rawDir, { recursive: true, force: true });
      cleaned = true;
    } catch {
      /* 删不掉也无妨：.personas-raw/ 已 gitignore */
    }
  }
}
if (!cleaned && !hadRaw) console.log("  （提示：临时语料目录未能删除，已 gitignore，可手动清理）");

console.log("\nPASS: " + checks + " 项断言（离线蒸馏路径：指纹抠取 / 合并写入 / dry-run 安全 / 坏输入），全程零网络调用");
