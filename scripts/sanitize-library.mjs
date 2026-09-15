#!/usr/bin/env node
/**
 * 把 public/square-library.json 里已有的回答正文过一遍回答完整性守卫。
 *
 * 什么时候需要它：`scripts/build-library.mjs` 是「生成」入口，而这份 JSON 是
 * **长期躺在仓库里、直接给评委看的静态数据** —— 一旦有脏数据写进去，后面每次演示
 * 都会原样复现，而且没人会再跑一遍生成。这个脚本负责「修已经落盘的那份」。
 *
 * 为什么不手工改 JSON：规则必须只有一处来源。这里直接 import 生产用的守卫
 * （`lib/domain/answerIntegrity.ts`），所以修完的内容 == 重新生成一遍会得到的内容。
 *
 * 为什么丢弃回答时连答主席位一起摘掉：`skills` 与 `answers` 必须一一对应，
 * 否则广场上会出现「阵容里列着 3 位答主、实际只有 2 张回答卡」的自相矛盾。
 *
 * 用法：node scripts/sanitize-library.mjs
 * 幂等：对已经干净的 JSON 再跑一次，不会有任何改动。
 */

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  stripAssistantBoilerplate,
  hasAssistantBoilerplate,
  MIN_ANSWER_CHARS,
} from "../lib/domain/answerIntegrity.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "public", "square-library.json");

const data = JSON.parse(readFileSync(OUT, "utf8"));
let cleaned = 0;
let dropped = 0;

for (const entry of data.entries) {
  const keptAnswers = [];
  const droppedSkillIds = new Set();

  for (const a of entry.answers) {
    const r = stripAssistantBoilerplate(a.body);
    if (r.removed.length === 0) {
      keptAnswers.push(a);
      continue;
    }

    cleaned++;
    console.log(`清理 ${entry.title} / ${a.skillName}`);
    for (const m of r.removed) console.log(`   - 删除: ${m.slice(0, 88)}…`);

    if (r.degenerate) {
      dropped++;
      droppedSkillIds.add(a.skillId);
      console.log(
        `   → 清理后仅剩 ${r.text.length} 字（< ${MIN_ANSWER_CHARS}），整条丢弃，答主席位一并摘掉`,
      );
      continue;
    }

    console.log(`   → 保留 ${r.text.length} 字`);
    keptAnswers.push({ ...a, body: r.text });
  }

  entry.answers = keptAnswers;
  if (droppedSkillIds.size > 0) {
    entry.skills = entry.skills.filter((s) => !droppedSkillIds.has(s.id));
  }
}

writeFileSync(OUT, JSON.stringify(data), "utf8");

/* ------------------------------ 自检 ------------------------------ */

let orphans = 0;
let residue = 0;
for (const entry of data.entries) {
  const skillIds = new Set(entry.skills.map((s) => s.id));
  for (const a of entry.answers) {
    if (!skillIds.has(a.skillId)) orphans++;
    if (hasAssistantBoilerplate(a.body)) residue++;
  }
}

const answers = data.entries.reduce((n, e) => n + e.answers.length, 0);
console.log(`\n完成：清理 ${cleaned} 条，丢弃 ${dropped} 条`);
console.log(`条目数 ${data.entries.length}，回答总数 ${answers}`);
console.log(`自检：孤立回答（有回答无答主）${orphans} 条，残留助手腔 ${residue} 条 —— 两项都应为 0`);

if (orphans > 0 || residue > 0) process.exit(1);
