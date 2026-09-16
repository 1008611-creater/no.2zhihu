/**
 * 布局诊断：只有排斥力、没有吸引力会怎样。
 *
 * 动机：`relaxOverlaps` 读起来像「把重叠的推开」。但它是**只推不吸**的 ——
 * 每一轮循环对每一对重叠的节点施加纯排斥，没有任何把人群拉回来的力。
 * 那么唯一的收敛条件就是「不再有任何一对重叠」。
 *
 * 这份诊断要回答：在 22 场的真实输入下，它把节点推开了多远？
 * 对比「推动量」与「布局本身的半径」，如果后者远大于前者，
 * 那么「场地空」就不是排版问题，而是**这个函数的方向错了**。
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { register } from "node:module";

register(new URL("./_ts-hook.mjs", import.meta.url));
const { layoutSquare } = await import("../lib/domain/square-layout.ts");

const here = dirname(fileURLToPath(import.meta.url));
const raw = JSON.parse(readFileSync(join(here, "..", "public", "square-library.json"), "utf8"));

const topics = (raw.entries ?? []).map((e) => {
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

const L = layoutSquare(topics, (h) => h, () => []);
const b = L.bounds;
const W = b.maxX - b.minX;
const H = b.maxY - b.minY;

const P = (s) => console.log(s);
const head = (t) => {
  P("");
  P("=".repeat(76));
  P("  " + t);
  P("=".repeat(76));
};
const row = (k, v, n = "") => P("  " + String(k).padEnd(30) + String(v).padStart(10) + "   " + n);

head("① 布局的真实尺度");

row("包围盒", Math.round(W) + " × " + Math.round(H), "世界像素");
row("22 个节点的 size", L.nodes.map((n) => Math.round(n.size)).join(" ") || "-");
const sizes = L.nodes.map((n) => n.size);
const avgSize = sizes.reduce((a, b2) => a + b2, 0) / sizes.length;
row("平均卡片尺寸", Math.round(avgSize) + "px");
row("卡片总占地（不重叠）", Math.round(sizes.reduce((a, s) => a + s * s, 0)) + " px²");
row("包围盒面积", Math.round(W * H) + " px²");
row("卡片占比", ((100 * sizes.reduce((a, s) => a + s * s, 0)) / (W * H)).toFixed(1) + "%",
  "← 剩下的都是节点之间的空隙");

head("② 每个节点离中心多远（「散」的直接度量）");

const cx = (b.minX + b.maxX) / 2;
const cy = (b.minY + b.maxY) / 2;
const dists = L.nodes
  .map((n) => Math.hypot(n.x - cx, n.y - cy))
  .sort((a, b2) => a - b2);
row("离中心距离 中位数", Math.round(dists[Math.floor(dists.length / 2)]) + "px");
row("离中心距离 最大", Math.round(dists[dists.length - 1]) + "px");
row("平均卡片尺寸的倍数", (dists[dists.length - 1] / avgSize).toFixed(1) + "×",
  "最远的节点离中心有 " + (dists[dists.length - 1] / avgSize).toFixed(1) + " 个卡片那么远");

head("③ 最近邻距离 —— 它到底「推」到多开");

let nnMin = Infinity;
let nnMax = 0;
let nnSum = 0;
for (const n of L.nodes) {
  let best = Infinity;
  for (const m of L.nodes) {
    if (m === n) continue;
    const d = Math.hypot(m.x - n.x, m.y - n.y);
    if (d < best) best = d;
  }
  nnMin = Math.min(nnMin, best);
  nnMax = Math.max(nnMax, best);
  nnSum += best;
}
const nnAvg = nnSum / L.nodes.length;
const MIN_GAP = 1.32; // 与 square-layout.ts 保持一致
row("最近邻距离 最小", Math.round(nnMin) + "px", "理论下限 = 平均尺寸 × " + MIN_GAP + " ≈ " +
  Math.round(avgSize * MIN_GAP) + "px");
row("最近邻距离 平均", Math.round(nnAvg) + "px");
row("最近邻距离 最大", Math.round(nnMax) + "px");
P("");
P("  ⚠️ 关键判断：最近邻「平均」与理论下限的比值 = " + (nnAvg / (avgSize * MIN_GAP)).toFixed(2));
if (nnAvg / (avgSize * MIN_GAP) > 1.4) {
  P("     远大于 1 → 排斥没有在「刚好不重叠」处停住，而是继续往外推了很久。");
  P("     根因：这个函数**只有排斥、没有吸引**，唯一收敛条件是「不再重叠」，");
  P("     而迭代上限 80 轮给了它足够的机会把整个布局摊开。");
} else {
  P("     接近 1 → 排斥停在合理位置，布局是紧的。（那「空」的来源就在别处）");
}

head("④ 场地面积 vs 卡片面积 —— 「空」是多少个数量级");

row("包围盒面积", Math.round(W * H) + " px²");
row("可见内容占包围盒", ((100 * sizes.reduce((a, s) => a + s * s, 0)) / (W * H)).toFixed(1) + "%");
P("");
P("  也就是说：屏幕上有 " + (100 - (100 * sizes.reduce((a, s) => a + s * s, 0)) / (W * H)).toFixed(1) + "% 的像素是节点之间的空隙。");
P("  再乘上「广场只占屏幕 75%」，实际「空」的比例还要更高。");

P("");
P("=".repeat(76));
P("  诊断完毕。全部由真实数据算出。");
P("=".repeat(76));
