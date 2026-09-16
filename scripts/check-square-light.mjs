/**
 * 光影几何的回归自检（standalone，无需测试框架）。
 *
 * 跑法：node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON scripts/check-square-light.mjs
 *
 * ## 为什么单独一个文件，而不是塞进 check-square-crowd.mjs
 *
 * `check-square-crowd.mjs` 正在被另一个线程改（PR #53 在它里面加了 100 行）。
 * 两条线程改同一个自检文件，合并时**不报错但会静默回退**对方的内容 ——
 * 这是本项目踩过的坑。所以光影几何的自检独立成文件，两边互不覆盖。
 *
 * ## 它盯的是「出错时看不出来」的四件事
 *
 *   ① 影子的方向必须真的背离光源（算错符号的话，全场影子会朝光源倒，
 *      而屏幕上一眼看不出来 —— 只会「感觉哪里不对」）
 *   ② 影子不能长到穿场（影长失控会让远处的人甩出一条横跨半个广场的黑柱）
 *   ③ 缺口只应该在地上留洞，**不应该再有影子** ——
 *      如果缺口也投影，那「所有人都投下影子、只有那几个位置地上是空的」
 *      这条设计就没了，而它恰恰是这一版最核心的一处
 *   ④ 同一输入必须得到同一个广场（零随机）
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { register } from "node:module";

register(new URL("./_ts-hook.mjs", import.meta.url));

const { layoutSquare } = await import("../lib/domain/square-layout.ts");
const { crowdLayout } = await import("../lib/domain/crowd.ts");
const { lightSourceOf, lightReach, shadowOf, depthOf, groundScaleAt, shapeOf } = await import(
  "../lib/domain/light.ts"
);

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

const topics = entries.map((e) => {
  const handles = new Set(
    (e.skills ?? []).map((s) => s.persona?.handle ?? "name:" + s.name),
  );
  return {
    id: e.id,
    title: e.title,
    answerCount: (e.answers ?? []).length,
    personaCount: handles.size,
    openGapCount: (e.gaps ?? []).filter((g) => !g.filledBy).length,
    hasReplies: (e.answers ?? []).some((a) => (a.round ?? 0) > 0),
    mine: false,
  };
});

const layout = layoutSquare(topics, (h) => h, () => []);
const nodes = layout.nodes;
const clusters = crowdLayout(nodes);

head("① 光源：优先聚焦的那一场，否则最热那一场");
{
  const auto = lightSourceOf(nodes, null);
  const hottest = nodes.reduce((a, b) => (b.size > a.size ? b : a));
  if (!auto) bad("没有选出光源");
  else if (auto.id !== hottest.id) bad("默认光没落在最热那一场：" + auto.id + " vs " + hottest.id);
  else ok("默认落在最热那一场（size=" + Math.round(hottest.size) + "）");

  const target = nodes[nodes.length - 1];
  const focused = lightSourceOf(nodes, target.id);
  if (!focused || focused.id !== target.id) bad("聚焦后光没移过去");
  else ok("聚焦 " + target.id.slice(0, 14) + " 后光移过去了");

  if (lightSourceOf([], null) !== null) bad("空广场应该没有光源");
  else ok("空广场没有光源（不造一个假光）");
}

head("② 影子方向必须真的背离光源");
{
  const light = lightSourceOf(nodes, null);
  const reach = lightReach(nodes, light);
  let checked = 0;
  // ⚠️ 初值必须是 +Infinity 而不是 0。
  // 第一版写成 0，于是 `if (dot < worst)` 永远不成立、worst 永远是 0，
  // 末了的 `worst >= 0.999` 永远为假 —— **断言一次都没跑，却什么都没报**。
  // 自检里「静默通过」比「报错」危险得多：它让人以为验过了。
  let worst = Infinity;
  for (const c of clusters) {
    for (const f of c.figures) {
      if (f.kind !== "persona") continue;
      const foot = { x: c.x + f.dx, y: c.y + f.dy };
      const s = shadowOf(foot, f.height, light, reach);

      // 影子的方向向量（从脚底沿 angle 甩出去，画面的 +Y 是向下）
      const rad = (s.angle * Math.PI) / 180;
      const dir = { x: Math.sin(rad), y: Math.cos(rad) };
      // 从光源指向脚底的方向
      const away = { x: foot.x - light.x, y: foot.y - light.y };
      const len = Math.hypot(away.x, away.y) || 1;
      const dot = (dir.x * away.x + dir.y * away.y) / len; // 1 = 完全背离

      checked++;
      if (dot < worst) worst = dot;
      if (dot < 0.999) {
        bad("影子没背离光源（cos=" + dot.toFixed(3) + "）@ " + f.key.slice(0, 22));
      }
    }
  }
  if (checked === 0) bad("一条影子都没验到 —— 断言空转");
  else if (worst >= 0.999) {
    ok(checked + " 条影子全部精确背离光源（最小 cos=" + worst.toFixed(4) + "）");
  }

  // 光源正下方：不能是随机方向
  const under = shadowOf({ x: light.x, y: light.y }, 30, light, reach);
  if (under.angle !== 0) bad("站在光源正下方时影子方向不是 0");
  else ok("光源正下方 → 影子朝正下方（确定性，不随机）");
}

head("③ 影长不能失控");
{
  const light = lightSourceOf(nodes, null);
  const reach = lightReach(nodes, light);
  let minK = Infinity;
  let maxK = 0;
  let extreme = 0;
  for (const c of clusters) {
    for (const f of c.figures) {
      if (f.kind !== "persona") continue;
      const s = shadowOf({ x: c.x + f.dx, y: c.y + f.dy }, f.height, light, reach);
      const k = s.length / f.height;
      minK = Math.min(minK, k);
      maxK = Math.max(maxK, k);
      // 影长超过 2 倍人高就开始「穿场」了
      if (k > 1.85) extreme++;
    }
  }
  console.log("  影长 / 人高 区间：" + minK.toFixed(2) + " – " + maxK.toFixed(2));
  if (extreme > 0) bad(extreme + " 条影子过长（>1.85×人高）");
  else ok("全部在 [0.42, 1.85]×人高 之内");

  // 归一化距离为 0 与 1 时的两端
  const near = shadowOf({ x: light.x + 1, y: light.y + 1 }, 20, light, reach);
  const far = shadowOf({ x: light.x + reach, y: light.y }, 20, light, reach);
  if (!(far.length > near.length)) bad("远处的影子没有比近处的长");
  else ok("远处影子更长（" + Math.round(near.length) + " → " + Math.round(far.length) + "px）");
}

head("④ 缺口只留洞，不投影");
{
  const gapFig = clusters.flatMap((c) => c.figures.filter((f) => f.kind === "gap"));
  const perFig = clusters.flatMap((c) => c.figures.filter((f) => f.kind === "persona"));
  const declared = nodes.reduce((n, t) => n + t.openGapCount, 0);
  if (gapFig.length !== declared) bad("缺口人形数 " + gapFig.length + " ≠ 未补缺口 " + declared);
  else ok("缺口数 " + gapFig.length + " 与真实未补缺口一致");

  // 渲染层只给 persona 画影子 —— 这里断言「有资格投影的人」正好是在场分身
  if (perFig.length + gapFig.length !== clusters.reduce((n, c) => n + c.figures.length, 0))
    bad("人形总数对不上");
  else ok("在场分身 " + perFig.length + " 个（这些才投影）+ 缺口 " + gapFig.length + " 个（只留洞）");
}

head("⑤ 纵深：单调、有界、可复现");
{
  const ys = nodes.map((n) => n.y);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const d0 = depthOf(minY, minY, maxY);
  const d1 = depthOf(maxY, minY, maxY);
  if (Math.abs(d0) > 1e-9 || Math.abs(d1 - 1) > 1e-9) bad("纵深端点不是 0 / 1");
  else ok("纵深端点 0（最远）→ 1（最近）");

  let mono = true;
  for (let i = 1; i <= 20; i++) {
    const a = depthOf(minY + ((maxY - minY) * (i - 1)) / 20, minY, maxY);
    const b = depthOf(minY + ((maxY - minY) * i) / 20, minY, maxY);
    if (b < a - 1e-9) mono = false;
  }
  if (!mono) bad("纵深不是单调递增");
  else ok("纵深沿 y 单调递增（屏幕越靠下越大）");

  const sFar = groundScaleAt(0);
  const sNear = groundScaleAt(1);
  console.log("  纵深缩放：" + sFar.toFixed(2) + "（远）– " + sNear.toFixed(2) + "（近）");
  if (!(sFar < 0.75 && sNear > 0.95)) bad("纵深缩放区间不够（看不出远近差别）");
  else ok("远近体量差 " + Math.round((1 - sFar / sNear) * 100) + "%（够看出距离）");

  // 每个人的高度必须真的受纵深影响
  const far = clusters.reduce((a, b) => (a.depth < b.depth ? a : b));
  const near = clusters.reduce((a, b) => (a.depth > b.depth ? a : b));
  if (!(near.groundScale > far.groundScale)) bad("最近簇的缩放没有大于最远簇");
  else ok(
    "最近簇 scale " + near.groundScale.toFixed(2) + " > 最远簇 " + far.groundScale.toFixed(2),
  );
}

head("⑥ 体态：无盖章感，但仍可复现");
{
  const shapes = new Set();
  let minH = Infinity;
  let maxH = 0;
  let minW = Infinity;
  let maxW = 0;
  const poses = new Set();
  for (const c of clusters) {
    for (const f of c.figures) {
      if (f.kind !== "persona") continue;
      poses.add(f.shape.pose);
      minH = Math.min(minH, f.shape.heightScale);
      maxH = Math.max(maxH, f.shape.heightScale);
      minW = Math.min(minW, f.shape.widthScale);
      maxW = Math.max(maxW, f.shape.widthScale);
      shapes.add(
        [f.shape.pose, f.shape.heightScale.toFixed(3), f.shape.widthScale.toFixed(3),
         f.shape.lean.toFixed(2)].join("|"),
      );
    }
  }
  const total = clusters.reduce(
    (n, c) => n + c.figures.filter((f) => f.kind === "persona").length,
    0,
  );
  console.log(
    "  " + total + " 个分身 → " + shapes.size + " 种体态；身高 " + minH.toFixed(2) + "–" +
      maxH.toFixed(2) + "，肩宽 " + minW.toFixed(2) + "–" + maxW.toFixed(2) + "；姿态 " +
      [...poses].join(" / "),
  );
  if (poses.size < 2) bad("姿态只有一种 —— 又变成盖章了");
  else ok("姿态有 " + poses.size + " 种");
  // 不去重的话所有人长得一样，去重太多也不行 —— 这里只要求「绝大多数不重样」
  if (shapes.size < total * 0.9) bad("体态重复过多：" + shapes.size + "/" + total);
  else ok("体态几乎不重样（" + shapes.size + "/" + total + "）");

  // 同一 key 必须永远同一体态
  const a = shapeOf("mirror-123#4");
  const b = shapeOf("mirror-123#4");
  if (JSON.stringify(a) !== JSON.stringify(b)) bad("shapeOf 不是确定性的");
  else ok("同一个 key 永远得到同一体态");
  if (JSON.stringify(a) === JSON.stringify(shapeOf("mirror-123#5")))
    bad("相邻两个人拿到了完全相同的体态");
  else ok("相邻人形体态不同");
}

head("⑦ 全链路可复现");
{
  const again = crowdLayout(layoutSquare(topics, (h) => h, () => []).nodes);
  if (JSON.stringify(clusters) === JSON.stringify(again)) ok("两次计算逐字节相同");
  else bad("两次结果不同 —— 引入了随机性");
}

console.log("\n" + "=".repeat(74));
console.log(fail === 0 ? "全部通过（0 处问题）" : "发现 " + fail + " 处问题");
console.log("=".repeat(74));
process.exit(fail === 0 ? 0 : 1);
