/**
 * P0 的数值实验：把 `size` 整体缩放 k 倍，屏幕人形会变大还是变小？
 *
 * ## 为什么先做这个实验
 *
 * 视觉审计报告里我写了一条推算：
 *   「size 从人群反推 → 包围盒 −56% → scale 0.92→1.35 → **人形 34→50px**」
 *
 * 但这个推算里藏着一个我没验证的假设：**人形尺寸不随 size 变化**。
 * 而代码里人形高度是 `usable × FIG_HEIGHT_K / √N`，`usable` 又 ∝ `size` ——
 * 也就是说 size 缩小、人形也会跟着缩小。
 *
 * 如果两者等比，那么「屏幕人形高度」= 人形 × scale ∝ size / 包围盒 ∝ 常数，
 * **缩 size 根本不会让人形在屏幕上变大**，我的预估就是错的。
 *
 * 唯一可能让它变大的机制是 `FIG_MAX` 上限：size 大时人形被钳在 40px（不再涨），
 * size 小时人形按比例缩（缩得比布局慢）—— 只有在被钳住的区间里，缩 size 才有收益。
 *
 * 这份实验直接扫 k，把每档的屏幕人形高度量出来。**不猜，量。**
 *
 * 跑法：node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON scripts/_diag-size-sweep.mjs
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { register } from "node:module";

register(new URL("./_ts-hook.mjs", import.meta.url));
const { layoutSquare, homeViewport } = await import("../lib/domain/square-layout.ts");
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

const base = layoutSquare(topics, (h) => h, () => []);

const stageW = 1440;
const stageH = 900 - 73; // 顶部导航实测 73px

const P = (s) => console.log(s);
P("");
P("=".repeat(96));
P("  size 缩放扫描：把整个布局等比缩放 k 倍，看屏幕人形高度的变化");
P("=".repeat(96));
P("");
P("   k    包围盒          scale   人形世界高   人形屏幕高   主体占比   重叠");
P("  " + "-".repeat(92));

const rows = [];
for (const k of [0.5, 0.6, 0.7, 0.8, 0.9, 1.0, 1.1, 1.3, 1.6, 2.0]) {
  // 等比缩放整个布局：位置与尺寸一起乘 k。
  // 这等价于「把 SIZE_MIN/SIZE_MAX 与环间距同时乘 k」。
  const nodes = base.nodes.map((n) => ({
    ...n,
    x: n.x * k,
    y: n.y * k,
    size: n.size * k,
  }));
  const clusters = crowdLayout(nodes);
  const w = (base.bounds.maxX - base.bounds.minX) * k;
  const h = (base.bounds.maxY - base.bounds.minY) * k;
  const bounds = {
    minX: base.bounds.minX * k,
    minY: base.bounds.minY * k,
    maxX: base.bounds.maxX * k,
    maxY: base.bounds.maxY * k,
  };
  const view = homeViewport({ nodes, clusters: base.clusters, bounds, links: base.links }, stageW, stageH);

  // 人形世界高度的中位数（只看在场分身）
  const hs = clusters
    .flatMap((c) => c.figures.filter((f) => f.kind === "persona").map((f) => f.height))
    .sort((a, b) => a - b);
  const medH = hs[Math.floor(hs.length / 2)];
  const medScreen = medH * view.scale;

  // 主体占比（人形 bounding box 面积 / 舞台面积）
  let figArea = 0;
  for (const c of clusters) {
    for (const f of c.figures) {
      const fh = f.height * view.scale;
      const fw = fh * (12 / 20) * f.shape.widthScale;
      figArea += fh * fw * 0.55;
    }
  }
  const area = stageW * stageH;

  // 重叠检查：与 check-square-crowd.mjs ② 节同一判据
  let worst = Infinity;
  for (const c of clusters) {
    for (let i = 0; i < c.figures.length; i++) {
      for (let j = i + 1; j < c.figures.length; j++) {
        const a = c.figures[i];
        const b2 = c.figures[j];
        const center = Math.hypot(a.dx - b2.dx, a.dy - b2.dy);
        const need = Math.min(a.height, b2.height) * 0.42;
        if (need > 0) worst = Math.min(worst, center / need);
      }
    }
  }
  const overlap = worst === Infinity ? "n/a" : worst < 1 ? "✗ " + worst.toFixed(2) : "✓ " + worst.toFixed(2);

  rows.push({ k, bbox: Math.round(w) + "×" + Math.round(h), scale: view.scale, medH, medScreen, pct: (100 * figArea) / area, worst });

  P(
    "  " +
      k.toFixed(2).padStart(4) +
      "  " +
      (Math.round(w) + "×" + Math.round(h)).padStart(13) +
      view.scale.toFixed(3).padStart(9) +
      medH.toFixed(1).padStart(12) +
      medScreen.toFixed(1).padStart(12) +
      ((100 * figArea) / area).toFixed(2).padStart(10) + "%" +
      "   " +
      overlap,
  );
}

P("");
P("=".repeat(96));
P("  怎么读这张表");
P("=".repeat(96));
const k05 = rows.find((r) => r.k === 0.5);
const k1 = rows.find((r) => r.k === 1);
const k2 = rows.find((r) => r.k === 2);
P("");
P("  k=1.00（现状）：人形世界高 " + k1.medH.toFixed(1) + " → 屏幕 " + k1.medScreen.toFixed(1) + "px");
P("  k=0.50（减半）：人形世界高 " + k05.medH.toFixed(1) + " → 屏幕 " + k05.medScreen.toFixed(1) + "px");
P("  k=2.00（加倍）：人形世界高 " + k2.medH.toFixed(1) + " → 屏幕 " + k2.medScreen.toFixed(1) + "px");
P("");
P("  ⚠️ 注意人形世界高在 k≥1 时**不再涨**（停在 FIG_MAX 附近）——");
P("     那一段里屏幕人形反而在**变小**（scale 在跌）。");
P("     而 k<1 时人形按比例缩，屏幕尺寸基本持平。");
