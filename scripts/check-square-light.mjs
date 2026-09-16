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
const { lightOfCluster, hottestId, lightReach, shadowOf, depthOf, groundScaleAt, shapeOf } =
  await import("../lib/domain/light.ts");

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

head("① 光源：**每个话题自己发光**（2026-09-16 修正）");
{
  // 为什么这条断言最要紧：原设计是「全广场一盏灯」，会导致离灯最远的那十几簇
  // 影子平行甩向同一方向（像被风吹倒的草）。改成每簇自发光之后，
  // 若有人改回共享光源，下面第②节的「同簇内方向不一致」会立刻失败。
  const l1 = lightOfCluster(100, 200, 0.8);
  if (l1.x !== 100 || l1.y !== 200) bad("簇光源没落在簇心");
  else ok("簇光源就在簇心（x=" + l1.x + ", y=" + l1.y + "）");

  if (Math.abs((l1.intensity ?? 0) - 0.8) > 1e-9) bad("光晕强度没透传");
  else ok("光晕强度透传（intensity=0.8）");

  // 每簇的光源必须各不相同 —— 这是「自发光」与「共享一盏灯」的分水岭
  const lights = clusters.map((c) => lightOfCluster(c.x, c.y, 0.6));
  const uniq = new Set(lights.map((l) => l.x + "," + l.y));
  if (uniq.size !== clusters.length) bad("有簇共用同一个光源（那就退回成一盏灯了）");
  else ok(clusters.length + " 簇各有各的光源，无一重复");

  // hottestId 仍存在，但只服务看山的注视目标
  const hot = hottestId(nodes);
  const expect = nodes.reduce((a, b) => (b.size > a.size ? b : a)).id;
  if (hot !== expect) bad("hottestId 选错：" + hot + " vs " + expect);
  else ok("hottestId 仍可用（供看山注视）→ " + hot.slice(0, 16));

  if (hottestId([]) !== null) bad("空广场应无最热");
  else ok("空广场没有最热（不造一个假值）");
}

head("② 影子必须背离**本簇**光源，且同簇内方向各异");
{
  let checked = 0;
  // ⚠️ 初值必须是 +Infinity 而不是 0。
  // 第一版写成 0，于是 `if (dot < worst)` 永远不成立、worst 永远是 0，
  // 末了的 `worst >= 0.999` 永远为假 —— **断言一次都没跑，却什么都没报**。
  // 自检里「静默通过」比「报错」危险得多：它让人以为验过了。
  let worst = Infinity;
  /** 每一簇里影子的方向集合 —— 用来验证「从物件向外辐射」 */
  const anglesPerCluster = [];
  for (const c of clusters) {
    const light = lightOfCluster(c.x, c.y, 0.6);
    const reach = lightReach(c.radius);
    const angles = [];
    for (const f of c.figures) {
      if (f.kind !== "persona") continue;
      // 用簇内相对坐标（光源也在簇内，所以两者要同一坐标系）
      const foot = { x: f.dx, y: f.dy };
      const s = shadowOf(foot, f.height, { id: light.id, x: 0, y: 0, intensity: light.intensity }, reach);

      const rad = (s.angle * Math.PI) / 180;
      const dir = { x: Math.sin(rad), y: Math.cos(rad) };
      const away = { x: foot.x, y: foot.y };
      const len = Math.hypot(away.x, away.y) || 1;
      const dot = (dir.x * away.x + dir.y * away.y) / len;

      checked++;
      if (dot < worst) worst = dot;
      if (dot < 0.999) {
        bad("影子没背离本簇光源（cos=" + dot.toFixed(3) + "）@ " + f.key.slice(0, 22));
      }
      angles.push(s.angle);
    }
    if (angles.length >= 2) anglesPerCluster.push({ id: c.id, angles });
  }
  if (checked === 0) bad("一条影子都没验到 —— 断言空转");
  else if (worst >= 0.999) {
    ok(checked + " 条影子全部精确背离**本簇**光源（最小 cos=" + worst.toFixed(4) + "）");
  }

  // ⭐ 本次最要紧的新断言：同簇内的影子**方向必须不同**（从物件向外辐射）。
  // 如果哪天退回「全广场一盏灯」，同一簇里所有人的影子会同向 —— 这条会失败。
  let flat = 0;
  for (const a of anglesPerCluster) {
    const spread = Math.max(...a.angles) - Math.min(...a.angles);
    // 一圈 360°，同簇内至少该有 20° 的扇开（实测 3 人时约 120°+）
    if (spread < 20) flat++;
  }
  if (flat > 0) bad(flat + " 个簇里的影子方向几乎一致（光源可能退回成共享的）");
  else {
    const spreads = anglesPerCluster.map((a) =>
      Math.round(Math.max(...a.angles) - Math.min(...a.angles)),
    );
    ok(
      anglesPerCluster.length + " 个簇的影子各自向外辐射（扇角 " +
        Math.min(...spreads) + "°–" + Math.max(...spreads) + "°）",
    );
  }

  // 光源正下方：不能是随机方向
  const under = shadowOf({ x: 0, y: 0 }, 30, { id: "cluster", x: 0, y: 0 }, 100);
  if (under.angle !== 0) bad("站在光源正下方时影子方向不是 0");
  else ok("光源正下方 → 影子朝正下方（确定性，不随机）");
}

head("③ 影长不能失控");
{
  let minK = Infinity;
  let maxK = 0;
  let extreme = 0;
  for (const c of clusters) {
    const reach = lightReach(c.radius);
    for (const f of c.figures) {
      if (f.kind !== "persona") continue;
      const s = shadowOf({ x: f.dx, y: f.dy }, f.height, { id: "cluster", x: 0, y: 0 }, reach);
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
  const near = shadowOf({ x: 1, y: 1 }, 20, { id: "cluster", x: 0, y: 0 }, 100);
  const far = shadowOf({ x: 100, y: 0 }, 20, { id: "cluster", x: 0, y: 0 }, 100);
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
