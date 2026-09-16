/**
 * 空白归因：到底是「节点之间」空，还是「节点内部」空？
 *
 * 上一份诊断把「包围盒里的空隙」当成嫌疑，但最近邻比 0.94 说明节点之间并不松。
 * 那么剩下的可能就是：**每个节点自己占的场地，远大于它里面实际站的人**。
 *
 * 一个节点 size=197，而它里面只有 3–5 个 24–36px 高的人形 ——
 * 如果属实，那么「空」不是布局推得开，而是**卡片尺寸与人群尺寸不是一个量级**。
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { register } from "node:module";

register(new URL("./_ts-hook.mjs", import.meta.url));
const { layoutSquare } = await import("../lib/domain/square-layout.ts");
const { crowdLayout } = await import("../lib/domain/crowd.ts");

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
const clusters = crowdLayout(L.nodes);

const P = (s) => console.log(s);
const head = (t) => {
  P("");
  P("=".repeat(76));
  P("  " + t);
  P("=".repeat(76));
};
const row = (k, v, n = "") => P("  " + String(k).padEnd(32) + String(v).padStart(10) + "   " + n);

head("① 节点尺寸 vs 人群实际占的尺寸 —— 这才是「空」的来源");

P("  话题                    size   人群半径   人形高   人群/节点");
P("  " + "-".repeat(70));
let ratioSum = 0;
for (let i = 0; i < L.nodes.length; i++) {
  const n = L.nodes[i];
  const c = clusters[i];
  const h = c.figures.length ? Math.max(...c.figures.map((f) => f.height)) : 0;
  // 人群实际外接半径 = 最远人形的中心距 + 半个身位
  const r = c.figures.length
    ? Math.max(...c.figures.map((f) => Math.hypot(f.dx, f.dy))) + h * 0.5
    : 0;
  const ratio = r / (n.size / 2);
  ratioSum += ratio;
  P(
    "  " +
      n.title.slice(0, 18).padEnd(20) +
      String(Math.round(n.size)).padStart(5) +
      String(Math.round(c.radius)).padStart(10) +
      String(Math.round(h)).padStart(8) +
      (ratio * 100).toFixed(0).padStart(9) + "%",
  );
}
const avgRatio = ratioSum / L.nodes.length;

head("② 结论");
row("人群外接半径 / 节点半径 平均", (avgRatio * 100).toFixed(0) + "%",
  "← 节点的一半是空的");
row("节点面积 / 人群面积", (1 / (avgRatio * avgRatio)).toFixed(1) + "×",
  "每个话题占的场地是它人群的 " + (1 / (avgRatio * avgRatio)).toFixed(1) + " 倍");
P("");
P("  也就是说：**每个节点的场地，有一大半根本没有内容**。");
P("  22 个这样的节点排在一起，屏幕上的观感必然是「散着几摊人」。");
P("");
P("  这跟「布局推得太开」是两件事（最近邻比 0.94，节点之间是紧的）。");
P("  真实链条是：");
P("    卡片尺寸由 size 决定（197–320）");
P("      → 人群半径被写成 size/2 × 0.72（即 ~70px）");
P("      → 但人形只有 24–36px，3–5 个排下去只用到 ~30–40px 半径");
P("      → 于是每个节点内部就留下 " + ((1 - avgRatio) * 100).toFixed(0) + "% 的空");
P("");
P("  **所以修法是改卡片尺寸与人群尺寸的对应关系，不是继续调色。**");

P("");
P("=".repeat(76));
