/**
 * 人形几何自检。
 *
 * ## 为什么需要它
 *
 * 人形是 `<symbol viewBox="0 0 12 20">` 里的两条路径（一个圆头 + 一条躯干）。
 * **头与躯干之间的间隙是纯数字，肉眼在小尺寸下完全看不出来** ——
 * 实测：截图里三分之一的人形是「一个黑圆浮在一个梯形体上方」，
 * 而当时 `fold` 姿态的间隙是身高的 **29%**（另两个姿态是 3% / 8%）。
 * 我在 52px 的截图上看过它好几轮，一直没发现 —— 因为**在 52px 下它只是
 * 一个略微奇怪的黑点**，只有把数字算出来才看得见。
 *
 * 所以这里不看图，只解析 `SquareCanvas.tsx` 里的 path，逐条算：
 *   ① 头底到躯干顶的间隙（必须是「接上」，不能浮空）
 *   ② 图形必须落在 viewBox 里（越界会被裁掉一截）
 *   ③ viewBox 的宽高比必须与渲染层用的 GLYPH_ASPECT 一致
 *      （不一致 → `<use>` 会等比缩放并留白，人形实际比算出来小）
 *
 * 全仓只有这一处定义人形，改这里必须同步改这份自检 —— 这是有意的：
 * 人形几何错了不会有任何构建/类型报错，只能靠数字守。
 */

import { readFileSync } from "node:fs";

let problems = 0;
const fail = (m) => {
  problems++;
  console.log("  ✗ " + m);
};
const pass = (m) => console.log("  ✓ " + m);
const head = (t) => {
  console.log("");
  console.log("=".repeat(74));
  console.log("  " + t);
  console.log("=".repeat(74));
};

const SRC = "components/square/SquareCanvas.tsx";
const src = readFileSync(SRC, "utf8");

/** 抠出所有 `<symbol id="sq-fig-*" viewBox="...">…</symbol>` */
const symbols = [];
for (const m of src.matchAll(/<symbol\s+id="(sq-fig-[a-z]+)"\s+viewBox="([^"]+)"\s*>([\s\S]*?)<\/symbol>/g)) {
  const [, id, viewBox, body] = m;
  const nums = viewBox.trim().split(/[\s,]+/).map(Number);
  const circle = /<circle\s+cx="([\d.]+)"\s+cy="([\d.]+)"\s+r="([\d.]+)"/.exec(body);
  const path = /<path\s+d="([^"]+)"/.exec(body);
  symbols.push({
    id,
    vb: { x: nums[0], y: nums[1], w: nums[2], h: nums[3] },
    head: circle ? { cx: +circle[1], cy: +circle[2], r: +circle[3] } : null,
    path: path ? path[1] : null,
  });
}

if (symbols.length === 0) {
  console.log("✗ 一个 sq-fig-* symbol 都没找到 —— 人形改地方了，这份自检要跟着改");
  process.exit(1);
}

head("① 头必须长在身体上（间隙 = 头底 → 躯干顶）");

if (symbols.length !== 3) {
  fail("期望 3 种姿态，实际 " + symbols.length + " 种（" + symbols.map((s) => s.id).join(", ") + "）");
} else {
  pass("3 种姿态都在：" + symbols.map((s) => s.id.replace("sq-fig-", "")).join(" / "));
}

/**
 * 从 path 里取「躯干顶」的 y。
 *
 * 躯干一律从底部 y=20 起笔，往上走到肩。两种写法：
 *   · 平肩：`M… 20 L x 肩y L x 肩y L … 20 Z` → 取最小的那个非 20 的 y
 *   · 弧肩：`L x 肩y A rx ry 0 0 1 x y …` → 弧的顶点 = 起点的 y − ry
 * 这里只做「够用就好」的解析：取出 path 里所有坐标对的 y，再单独处理弧。
 */
function torsoTopY(d) {
  const ys = [];
  for (const m of d.matchAll(/([ML])\s*(-?[\d.]+)\s+(-?[\d.]+)/g)) ys.push(+m[3]);
  // 弧：A rx ry rot large sweep x y
  for (const m of d.matchAll(/A\s*([\d.]+)\s+([\d.]+)\s+[\d.]+\s+[\d.]+?\s+[\d.]+\s+(-?[\d.]+)\s+(-?[\d.]+)/g)) {
    ys.push(+m[4]);
  }
  const arc = /A\s*([\d.]+)\s+([\d.]+)\s+/.exec(d);
  const nonBottom = ys.filter((y) => y < 19.5);
  if (nonBottom.length === 0) return null;
  let top = Math.min(...nonBottom);
  if (arc) top -= +arc[2]; // 圆弧往上的高度 = ry
  return top;
}

for (const s of symbols) {
  if (!s.head || !s.path) {
    fail(s.id + " 缺少 circle 或 path —— 解析不了，请更新这份自检");
    continue;
  }
  const headBottom = s.head.cy + s.head.r;
  const top = torsoTopY(s.path);
  if (top === null) {
    fail(s.id + " 解析不出躯干顶");
    continue;
  }
  const gap = top - headBottom;
  const gapPct = (100 * gap) / s.vb.h;
  console.log(
    "  " +
      s.id.padEnd(14) +
      " 头底 " + headBottom.toFixed(2).padStart(6) +
      "  躯干顶 " + top.toFixed(2).padStart(6) +
      "  间隙 " + gap.toFixed(2).padStart(6) +
      "（" + gapPct.toFixed(1).padStart(5) + "% 身高）",
  );
  // 12% 是上限：超过这个数，头在视觉上就与身体脱开了（实测 29% 时
  // 读起来是「一个圆浮在梯形上方」，不是人）。
  if (gap < 0) fail(s.id + " 头与躯干**叠在一起**（间隙 " + gap.toFixed(2) + " < 0）");
  else if (gapPct > 12) fail(s.id + " 头浮空了：间隙占身高 " + gapPct.toFixed(1) + "% > 12%");
  else pass(s.id + " 头身相接（间隙占身高 " + gapPct.toFixed(1) + "%）");
}

head("② 全部图形必须落在 viewBox 内（越界会被裁掉一截）");

for (const s of symbols) {
  const { vb, head: hd } = s;
  const box = { x0: vb.x, y0: vb.y, x1: vb.x + vb.w, y1: vb.y + vb.h };
  const bad = [];
  if (hd) {
    if (hd.cx - hd.r < box.x0) bad.push("头左越界");
    if (hd.cx + hd.r > box.x1) bad.push("头右越界");
    if (hd.cy - hd.r < box.y0) bad.push("头顶越界");
  }
  for (const m of s.path.matchAll(/([ML])\s*(-?[\d.]+)\s+(-?[\d.]+)/g)) {
    const x = +m[2];
    const y = +m[3];
    if (x < box.x0) bad.push("躯干左越界(" + x + ")");
    if (x > box.x1) bad.push("躯干右越界(" + x + ")");
    if (y < box.y0 || y > box.y1) bad.push("躯干纵向越界(" + y + ")");
  }
  if (bad.length) fail(s.id + " " + bad.join("、"));
  else pass(s.id + " 全部落在 " + vb.w + "×" + vb.h + " 之内");
}

head("③ viewBox 宽高比必须与渲染层的 GLYPH_ASPECT 一致");

{
  // 渲染层用 GLYPH_ASPECT 把「高度」换算成「宽度」。若两者不一致，
  // <use> 会按 preserveAspectRatio 等比缩放并留白 —— 人形实际比算式小一圈，
  // 且相邻两人间距会莫名变大。这类偏差肉眼几乎看不出来。
  // GLYPH_ASPECT 住在渲染层（CrowdCluster.tsx），不在 symbol 那个文件里 ——
  // 正是这两处**必须一致**，所以这份自检要同时读两边。
  const consumer = readFileSync("components/square/CrowdCluster.tsx", "utf8");
  const m = /const GLYPH_ASPECT = ([\d.]+) \/ ([\d.]+);/.exec(consumer);
  if (!m) {
    fail("读不到 GLYPH_ASPECT（components/square/CrowdCluster.tsx）");
  } else {
    const aspect = Number(m[1]) / Number(m[2]);
    console.log("  渲染层 GLYPH_ASPECT = " + m[1] + "/" + m[2] + " = " + aspect.toFixed(4));
    for (const s of symbols) {
      const vbAspect = s.vb.w / s.vb.h;
      if (Math.abs(vbAspect - aspect) > 0.001) {
        fail(
          s.id + " viewBox 比例 " + vbAspect.toFixed(4) + " ≠ GLYPH_ASPECT " + aspect.toFixed(4) +
            " —— <use> 会等比缩放并留白，人形比算式小",
        );
      } else {
        pass(s.id + " 比例一致（" + vbAspect.toFixed(4) + "）");
      }
    }
  }
}

console.log("");
console.log("=".repeat(74));
console.log(problems === 0 ? "  全部通过（0 处问题）" : "  " + problems + " 处问题");
console.log("=".repeat(74));
process.exit(problems === 0 ? 0 : 1);
