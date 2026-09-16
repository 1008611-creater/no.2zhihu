/**
 * 第二个实验：增大 FIG_HEIGHT_K（把卡片装得更满）会让人形变大吗？
 *
 * 上一个实验推翻了「缩 size 能让人形变大」。这个实验查另一条路：
 * 人形高度 = `usable × FIG_HEIGHT_K / √N`，其中 `usable = size/2 × 0.72`。
 * 也就是说**卡片装得越满，人形越大** —— 与 size 无关。
 *
 * ## 但「装得更满」有两种，效果完全不同
 *
 *   a) 抓大 FIG_HEIGHT_K（人形占满卡片）→ 人形变大，但**同一卡片里的人会重叠**
 *   b) 抓大 CROWD_SPREAD（人排得更开）→ 人形不变，只是不再聚拢
 *
 * 唯一能让人既不重叠、又更大的办法是**放宽「不重叠」的标准** ——
 * 半身重叠在密集人群里其实更自然（「看不清谁是谁」本身就是人群的观感）。
 *
 * 这个实验扫 FIG_HEIGHT_K × 允许的重叠比，把「人形多大 / 重叠多少」量出来。
 *
 * 跑法：node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON scripts/_diag-fig-sweep.mjs
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { register } from "node:module";

register(new URL("./_ts-hook.mjs", import.meta.url));
const { layoutSquare, homeViewport } = await import("../lib/domain/square-layout.ts");
const { crowdOf } = await import("../lib/domain/crowd.ts");

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
const stageH = 900 - 73;
const scale = 0.92; // homeViewport 固定值（上一实验已确认它不随包围盒变化）

const P = (s) => console.log(s);
P("");
P("=".repeat(100));
P("  FIG_HEIGHT_K 扫描：人形能多大 / 代价是多少重叠");
P("=".repeat(100));
P("");
P("  读法：屏幕人形高 = 人形世界高 × 0.92。重叠比 < 1 = 有重叠（<0.7 才明显穿模）。");
P("");
P("  K     屏幕人形高   最小重叠比   主体占比   说明");
P("  " + "-".repeat(94));

// FIG_HEIGHT_K 是模块常量，不能从外面改 —— 这里用等价手法：
// 人形高 = usable × K / √N，所以「把 K 乘 κ」等价于「把 size 乘 κ」（在未被
// FIG_MAX 钳住时）。但 size 同时影响布局…… 所以更干净的做法是直接复算人形高度。
//
// 为了避免把逻辑复制成第二份（那等于自检另一份代码），这里改为：
// 只对 `crowdOf` 的输出做**几何重算**，公式与 crowd.ts 完全一致（含 FIG_MAX/MIN clamp）。
const USABLE_RATIO = 0.72;
const FIG_MIN = 16;
const FIG_MAX = 40;
const FIG_MIN_DEPTH = 11;
const GOLDEN_ANGLE_REF = Math.PI * (3 - Math.sqrt(5));

function refigure(node, K) {
  const c = crowdOf(node);
  const total = c.figures.length;
  if (total === 0) return { medH: 0, worst: Infinity, figures: [] };
  const usable = c.radius * USABLE_RATIO;
  const base = Math.min(FIG_MAX, Math.max(FIG_MIN, (usable * K) / Math.sqrt(total)));
  // 同一簇内的人形「大小差」由 shape.heightScale 决定，与原实现一致
  const figures = c.figures.map((f) => ({
    ...f,
    height: Math.max(FIG_MIN_DEPTH, base * f.shape.heightScale),
  }));
  const hs = figures.filter((f) => f.kind === "persona").map((f) => f.height).sort((a, b) => a - b);
  const medH = hs.length ? hs[Math.floor(hs.length / 2)] : 0;
  // 重叠比：与 check-square-crowd.mjs 同一判据（0.42 × 较小人高）
  let worst = Infinity;
  for (let i = 0; i < figures.length; i++) {
    for (let j = i + 1; j < figures.length; j++) {
      const a = figures[i];
      const b = figures[j];
      const center = Math.hypot(a.dx - b.dx, a.dy - b.dy);
      const need = Math.min(a.height, b.height) * 0.42;
      if (need > 0) worst = Math.min(worst, center / need);
    }
  }
  return { medH, worst, figures };
}

for (const K of [1.45, 1.7, 2.0, 2.4, 2.8, 3.2, 4.0]) {
  let allMed = [];
  let gWorst = Infinity;
  let area = 0;
  for (const n of base.nodes) {
    const r = refigure(n, K);
    if (r.medH > 0) allMed.push(r.medH * scale);
    if (r.worst < gWorst) gWorst = r.worst;
    for (const f of r.figures) {
      const fh = f.height * scale;
      const fw = fh * (12 / 20) * f.shape.widthScale;
      area += fh * fw * 0.55;
    }
  }
  allMed.sort((a, b) => a - b);
  const med = allMed[Math.floor(allMed.length / 2)];
  const pct = (100 * area) / (stageW * stageH);
  const note =
    gWorst < 0.7 ? "重叠明显（会穿模）" : gWorst < 1 ? "轻微重叠（人群观感，可接受）" : "无重叠";
  P(
    "  " +
      K.toFixed(2).padStart(5) +
      med.toFixed(1).padStart(12) + "px" +
      gWorst.toFixed(2).padStart(12) +
      pct.toFixed(2).padStart(11) + "%" +
      "   " + note,
  );
}

P("");
P("=".repeat(100));
P("  结论");
P("=".repeat(100));
P("");
P("  · 现状 K=1.45：屏幕人形约 " + (refigure(base.nodes[1], 1.45).medH * scale).toFixed(1) + "px，无重叠");
P("  · **把 K 提上去是唯一能让人形真的变大的手段** —— 不花额度、纯代码");
P("  · 代价是同一簇内的人开始重叠。哪一档可接受是**观感判断**，需要看截图定");
P("  · ⚠️ 注意 K 大到一定程度会撞 FIG_MAX（40px）上界，再大也不涨");
