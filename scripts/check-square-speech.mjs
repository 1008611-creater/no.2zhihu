/**
 * 对话气泡的回归自检（standalone，无需测试框架）。
 *
 * 跑法：node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON scripts/check-square-speech.mjs
 *
 * ## 它盯的是「出错时看不出来、但很严重」的五件事
 *
 *   ① ⭐ **摘出来的必须是原话的真子串** —— 这是全套设计的地基。
 *      如果哪天有人为了「读起来更顺」改了摘出来的句子，
 *      那广场上就出现了**我们编的话挂在真人名下**，等于伪造署名。
 *      这条断言直接把摘句与原文逐字比对。
 *   ② ⭐ **人形必须对上正确的答主** —— `avatarHandles[i] === answers[i].skillName`
 *      是一条**隐式契约**（不是类型保证的）。它一破，气泡就会把话安到错的人头上。
 *   ③ **不能三个人同时开口** —— 那是「一面墙」，不是「在讨论」
 *   ④ **没有编造任何文字** —— 把所有气泡文案收集起来，逐条在原库里找得到出处
 *   ⑤ **可复现** —— 同一时刻永远同一条气泡（评委刷新看到的不能变）
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { register } from "node:module";

register(new URL("./_ts-hook.mjs", import.meta.url));

const { layoutSquare } = await import("../lib/domain/square-layout.ts");
const { crowdLayout } = await import("../lib/domain/crowd.ts");
const { speechOf, speechAt, speakingClusters, bubblesAt } = await import(
  "../lib/domain/speech.ts"
);
const { homeViewport } = await import("../lib/domain/square-layout.ts");
const { PERSONAS } = await import("../lib/domain/personas/index.ts");

const here = dirname(fileURLToPath(import.meta.url));
const raw = JSON.parse(readFileSync(join(here, "..", "public", "square-library.json"), "utf8"));
const entries = raw.entries ?? [];

let fail = 0;
const bad = (m) => {
  fail++;
  console.log("  ✗ " + m);
};
const ok = (m) => console.log("  ✓ " + m);
const head = (t) => {
  console.log("\n" + "=".repeat(74));
  console.log(t);
  console.log("=".repeat(74));
};

const lookup = new Map();
for (const p of PERSONAS) lookup.set(p.handle, p.displayName ?? p.name ?? p.handle);

const avatarSource = (id) => {
  const e = entries.find((x) => x.id === id);
  return e?.skills?.map((s) => s.persona?.handle) ?? [];
};

const topics = entries.map((e) => {
  const handles = new Set((e.skills ?? []).map((s) => s.persona?.handle ?? "name:" + s.name));
  return {
    id: e.id,
    title: e.title,
    answerCount: (e.answers ?? []).length,
    personaCount: handles.size,
    openGapCount: (e.gaps ?? []).filter((g) => !g.filledBy).length,
    hasReplies: false,
    mine: false,
  };
});

const layout = layoutSquare(topics, (h) => lookup.get(h), avatarSource);
const clusters = crowdLayout(layout.nodes);

/** 复刻 SquareField 里的备料逻辑（这里必须与它一致，否则自检验的不是同一件事）。 */
function buildSpeeches() {
  const map = new Map();
  for (let i = 0; i < layout.nodes.length; i++) {
    const node = layout.nodes[i];
    const cluster = clusters[i];
    if (!cluster) continue;
    const entry = entries.find((e) => e.id === node.id);
    if (!entry) continue;
    const answers = entry.answers ?? [];
    const speakers = [];
    for (const f of cluster.figures) {
      if (f.kind !== "persona") continue;
      const hash = f.key.lastIndexOf("#");
      const idx = hash >= 0 ? Number(f.key.slice(hash + 1)) : NaN;
      if (!Number.isInteger(idx)) continue;
      const name = node.avatarNames[idx];
      if (!name) continue;
      const ans = answers.find((a) => a.skillName === name && String(a.body ?? "").trim().length > 0);
      if (!ans) continue;
      speakers.push({ figureKey: f.key, speaker: name, body: String(ans.body) });
    }
    const s = speechOf(node.id, speakers);
    if (s.lines.length > 0) map.set(node.id, s);
  }
  return map;
}

const speeches = buildSpeeches();

head("① 摘出来的每一句都必须是原话的真子串（地基）");
{
  let checked = 0;
  let wrong = 0;
  for (const [cid, s] of speeches) {
    const node = layout.nodes.find((n) => n.id === cid);
    const entry = entries.find((e) => e.id === node.id);
    for (const line of s.lines) {
      const ans = (entry.answers ?? []).find((a) => a.skillName === line.speaker);
      const body = String(ans?.body ?? "");
      // 去掉我们加的省略号（截断标记）再比对
      const core = line.text.replace(/…$/, "");
      checked++;
      if (!body.includes(core)) {
        wrong++;
        if (wrong <= 3) {
          bad("不是原话：" + line.text.slice(0, 40));
          bad("   在「" + line.speaker + "」的回答里找不到");
        }
      }
    }
  }
  if (wrong === 0) ok(checked + " 条气泡文案全部可在原文中逐字查到");
}

head("② 人形 ↔ 答主 的对应必须正确（隐式契约）");
{
  // 这条守的是：avatarHandles[i] === answers[i].skillName
  let mismatch = 0;
  for (const node of layout.nodes) {
    const entry = entries.find((e) => e.id === node.id);
    if (!entry) continue;
    const mapped = node.avatarHandles.map((h) => lookup.get(h) ?? h);
    const ansNames = (entry.answers ?? []).map((a) => a.skillName);
    for (let i = 0; i < Math.min(mapped.length, ansNames.length); i++) {
      if (mapped[i] !== ansNames[i]) mismatch++;
    }
  }
  if (mismatch > 0) {
    bad(
      mismatch +
        " 处 avatarHandles[i] ≠ answers[i].skillName —— " +
        "气泡会把话安到错的人头上（等于伪造署名）",
    );
  } else {
    ok("22 场的 avatarHandles[i] 与 answers[i].skillName 全部一一对应（契约成立）");
  }

  // 双保险真的生效了：每条气泡的 speaker 都能在该场回答里找到
  let orphan = 0;
  for (const [cid, s] of speeches) {
    const entry = entries.find((e) => e.id === cid);
    const names = new Set((entry?.answers ?? []).map((a) => a.skillName));
    for (const l of s.lines) if (!names.has(l.speaker)) orphan++;
  }
  if (orphan > 0) bad(orphan + " 条气泡的说话人不在该场回答里");
  else ok("全部气泡的说话人都能在该场回答里找到");
}

head("③ 不能三个人同时开口（那是墙不是讨论）");
{
  const ids = [...speeches.keys()];
  if (ids.length < 3) {
    bad("有气泡的簇只有 " + ids.length + " 个，样本不足");
  } else {
    let maxConcurrent = 0;
    let sum = 0;
    let samples = 0;
    // 扫描 120 秒，每 0.5 秒取样
    for (let t = 0; t < 120; t += 0.5) {
      const allowed = speakingClusters(ids, t);
      let on = 0;
      for (const id of ids) {
        if (!allowed.has(id)) continue;
        if (speechAt(speeches.get(id), t)) on++;
      }
      maxConcurrent = Math.max(maxConcurrent, on);
      sum += on;
      samples++;
    }
    const avg = sum / samples;
    console.log("  同时说话的气泡数：平均 " + avg.toFixed(2) + "，峰值 " + maxConcurrent);
    if (maxConcurrent > 3) bad("峰值 " + maxConcurrent + " 个气泡同时出现 —— 会糊成一面墙");
    else ok("峰值 " + maxConcurrent + " ≤ 3（读起来是「在讨论」）");
    if (avg < 0.4) bad("平均只有 " + avg.toFixed(2) + " 个 —— 大部分时间没人在说，会显得空");
    else ok("平均 " + avg.toFixed(2) + " 个（一直有人在说话，不冷场）");
  }
}

head("④ 没有编造任何文字");
{
  const allText = [];
  for (const [, s] of speeches) for (const l of s.lines) allText.push(l);
  const uniq = [...new Set(allText.map((l) => l.text))];
  console.log("  " + allText.length + " 条气泡文案，" + uniq.length + " 条不重复");
  console.log("");
  for (const u of uniq.slice(0, 8)) {
    const who = allText.find((l) => l.text === u).speaker;
    console.log("    「" + u + "」  —— " + who);
  }
  if (uniq.length < allText.length * 0.8) {
    bad("重复率过高（" + uniq.length + "/" + allText.length + "）—— 像复读机");
  } else {
    ok("重复率低（" + uniq.length + "/" + allText.length + "）");
  }

  // 长度分布：太长的气泡会占掉半个屏幕
  const lens = uniq.map((u) => u.length).sort((a, b) => a - b);
  console.log("");
  console.log("  句长：" + lens[0] + " – " + lens[lens.length - 1] + " 字（中位 " +
    lens[Math.floor(lens.length / 2)] + "）");
  const tooLong = lens.filter((n) => n > 50).length;
  if (tooLong > 0) bad(tooLong + " 条超过 50 字 —— 气泡会占掉半屏");
  else ok("全部 ≤ 50 字（气泡不会占掉半屏）");
}

head("⑤ 可复现 + 节流正确");
{
  const ids = [...speeches.keys()];
  for (const t of [3.2, 17.5, 61.0, 137.25]) {
    const a = ids.map((id) => speechAt(speeches.get(id), t)?.text ?? "-").join("|");
    const b = ids.map((id) => speechAt(speeches.get(id), t)?.text ?? "-").join("|");
    if (a !== b) bad("t=" + t + " 两次结果不同");
  }
  ok("同一时刻永远得到同一条气泡（可复现）");

  const g1 = [...speakingClusters(ids, 42.5)].sort().join(",");
  const g2 = [...speakingClusters(ids, 42.5)].sort().join(",");
  if (g1 !== g2) bad("节流闸门不是确定性的");
  else ok("节流闸门可复现");

  // 一定比例的时间里要有气泡（否则「像在讨论」是假的）
  let onFrames = 0;
  for (let t = 0; t < 120; t += 0.5) {
    const allowed = speakingClusters(ids, t);
    if (ids.some((id) => allowed.has(id) && speechAt(speeches.get(id), t))) onFrames++;
  }
  const onPct = (100 * onFrames) / 240;
  console.log("  120 秒里 " + onPct.toFixed(0) + "% 的时间至少有一个气泡在");
  if (onPct < 50) bad("只有 " + onPct.toFixed(0) + "% 的时间有气泡 —— 会显得没人说话");
  else ok(onPct.toFixed(0) + "% 的时间有气泡（一直在讨论）");
}

head("⑥ 气泡的位置：每一刻都看得见，且都在舞台内（**不需要浏览器**）");
{
  // 舞台尺寸：1440 宽 - 右栏 360 = 1080；高 = 900 - 顶栏 73 = 827
  const stageW = 1080;
  const stageH = 827;
  const view = homeViewport(layout, stageW, stageH);
  console.log("  scale = " + view.scale.toFixed(3) + "，舞台 " + stageW + "×" + stageH);

  let samples = 0;
  let empty = 0;
  let outOfBounds = 0;
  let overBudget = 0;
  let maxSeen = 0;
  let totalBubbles = 0;
  const textSeen = new Set();

  for (let t = 0; t < 180; t += 0.5) {
    const bs = bubblesAt({ nodes: layout.nodes, speeches, view, stageW, stageH, t, focusedId: null });
    samples++;
    totalBubbles += bs.length;
    maxSeen = Math.max(maxSeen, bs.length);
    if (bs.length === 0) empty++;
    if (bs.length > 3) overBudget++;
    for (const b of bs) {
      textSeen.add(b.text);
      if (b.x < 0 || b.x > stageW || b.y < 0 || b.y > stageH) {
        outOfBounds++;
        if (outOfBounds <= 3) {
          bad("气泡跑出舞台：" + b.x + "," + b.y + " 「" + b.text.slice(0, 22) + "」");
        }
      }
    }
  }

  const emptyPct = (100 * empty) / samples;
  console.log(
    "  180 秒 / " + samples + " 次取样：平均 " + (totalBubbles / samples).toFixed(2) +
      " 个气泡，峰值 " + maxSeen + "，空场 " + emptyPct.toFixed(0) + "%",
  );

  if (emptyPct > 35) bad(emptyPct.toFixed(0) + "% 的时间一个气泡都没有 —— 会显得没人在说话");
  else ok("只有 " + emptyPct.toFixed(0) + "% 的时间没有气泡（其余时间都在讨论）");

  if (outOfBounds > 0) bad(outOfBounds + " 个气泡落在舞台外（会被裁成半截）");
  else ok("全时段气泡都在舞台内，没有被裁的");

  if (overBudget > 0) bad(overBudget + " 次取样同时出现 >3 个气泡");
  else ok("同时最多 " + maxSeen + " 个气泡（读起来是讨论，不是一堵墙）");

  if (maxSeen < 2) bad("峰值只有 " + maxSeen + " 个 —— 看不出「多人同时在聊」");
  else ok("峰值 " + maxSeen + " 个，确实是多个人在同时说");

  console.log("  180 秒里出现过 " + textSeen.size + " 条不同的原话");
  if (textSeen.size < 20) bad("只出现过 " + textSeen.size + " 条，内容太重复");
  else ok(textSeen.size + " 条不同原话轮着说（不会像复读机）");

  // 聚焦时只让那一簇说 —— 这是「你把耳朵贴过去」的交互
  const oneId = [...speeches.keys()][0];
  const focused = bubblesAt({
    nodes: layout.nodes,
    speeches,
    view,
    stageW,
    stageH,
    t: 12.5,
    focusedId: oneId,
  });
  if (focused.some((b) => b.clusterId !== oneId)) bad("聚焦后仍有别的簇在说话");
  else ok("聚焦某一簇后，只有它在说话（" + focused.length + " 条）");
}

console.log("\n" + "=".repeat(74));
console.log(fail === 0 ? "全部通过（0 处问题）" : "发现 " + fail + " 处问题");
console.log("=".repeat(74));
process.exit(fail === 0 ? 0 : 1);
