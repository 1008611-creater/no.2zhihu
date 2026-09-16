/**
 * 第三个实验：真正的瓶颈是 `FIG_MAX = 40`，不是 size。
 *
 * ## 推导（三行，全部由代码读出）
 *
 *   人形高 = usable × K / √N
 *   usable = radius × 0.72 = (size/2 × 0.72) × 0.72 = size × 0.2592
 *   → size=197, N=4 时：base = 197 × 0.2592 × 1.45 / 2 = 37.0
 *
 * 而 `FIG_MAX = 40`。**也就是说 37 已经在 40 的天花板下面一点点 —— 顶住了。**
 * 上一份实验里 K 从 2.0 提到 4.0、屏幕人形纹丝不动（37.0px），就是这个原因。
 *
 * ## 所以能让人形变大的只有一个旋钮
 *
 * `FIG_MAX`（以及没顶到它时起作用的 `FIG_HEIGHT_K`）。
 *
 * ## 但这里有个物理矛盾，必须先量清楚
 *
 * 4 个人形想「填满」半径 98px 的卡片，每人得占约 98px 宽 → 人形高约 160px。
 * 而 4 个 160px 高的人**不可能**站进 197px 的圆里不重叠。
 * **「填满」与「不重叠」在物理上不可兼得。**
 *
 * 真实的人群本来就是挤在一起的。所以这个实验要回答的**不是**「怎么又不重叠又大」，
 * 而是「允许多少重叠时，人形能大到什么程度」—— 然后由观感决定取哪一档。
 *
 * 跑法：node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON scripts/_diag-figmax.mjs
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { register } from "node:module";

register(new URL("./_ts-hook.mjs", import.meta.url));
const { layoutSquare } = await import("../lib/domain/square-layout.ts");
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

const nodes = layoutSquare(topics, (h) => h, () => []).nodes;
const stageW = 1440;
const stageH = 900 - 73;
const scale = 0.92;

const USABLE = 0.72;
const FIG_MIN = 16;
const FIG_MIN_DEPTH = 11;

const P = (s) => console.log(s);
P("");
P("=".repeat(100));
P("  FIG_MAX 扫描：人形能多大，以及为此要接受多少重叠");
P("=".repeat(100));
P("");
P("  重叠比 = 人形中心距 / (0.42 × 较矮者身高)。");
P("  < 1.0 = 有重叠；< 0.75 = 明显穿模（人影叠在一起分不出个数）。");
P("");
P("  FIG_MAX  K     屏幕人形高   最小重叠比   实质");
P("  " + "-".repeat(94));

function evalK(K, FIG_MAX) {
  let meds = [];
  let gWorst = Infinity;
  let area = 0;
  let pairsOverlapping = 0;
  let pairs = 0;
  for (const n of nodes) {
    const c = crowdOf(n);
    const total = c.figures.length;
    if (total === 0) continue;
    const usable = c.radius * USABLE;
    const base = Math.max(
      FIG_MIN_DEPTH,
      Math.min(FIG_MAX, Math.max(FIG_MIN, (usable * K) / Math.sqrt(total))),
    );
    const figs = c.figures.map((f) => ({
      ...f,
      height: base * f.shape.heightScale,
    }));
    const hs = figs.filter((f) => f.kind === "persona").map((f) => f.height).sort((a, b) => a - b);
    if (hs.length) meds.push(hs[Math.floor(hs.length / 2)] * scale);
    for (let i = 0; i < figs.length; i++) {
      for (let j = i + 1; j < figs.length; j++) {
        const a = figs[i];
        const b = figs[j];
        const center = Math.hypot(a.dx - b.dx, a.dy - b.dy);
        const need = Math.min(a.height, b.height) * 0.42;
        if (need > 0) {
          const ratio = center / need;
          gWorst = Math.min(gWorst, ratio);
          pairs++;
          if (ratio < 1) pairsOverlapping++;
        }
      }
    }
    for (const f of figs) {
      const fh = f.height * scale;
      const fw = fh * (12 / 20) * f.shape.widthScale;
      area += fh * fw * 0.55;
    }
  }
  meds.sort((a, b) => a - b);
  return {
    med: meds[Math.floor(meds.length / 2)] || 0,
    worst: gWorst,
    pct: (100 * area) / (stageW * stageH),
    overlapPairs: pairsOverlapping,
    pairs,
  };
}

for (const FIG_MAX of [40, 60, 80, 110, 150]) {
  for (const K of [1.45, 1.7]) {
    const r = evalK(K, FIG_MAX);
    const when =
      r.worst >= 1
        ? "无重叠"
        : r.worst >= 0.85
          ? "贴着但不穿"
          : r.worst >= 0.7
            ? "轻微重叠（像人群）"
            : "明显穿模 ✗";
    P(
      "  " +
        String(FIG_MAX).padStart(6) +
        K.toFixed(2).padStart(6) +
        r.med.toFixed(1).padStart(12) + "px" +
        r.worst.toFixed(2).padStart(12) +
        "   " + when +
        "   (" + r.overlapPairs + "/" + r.pairs + " 对重叠)",
    );
  }
}

P("");
P("=".repeat(100));
P("  结论");
P("=".repeat(100));
P("");
const a = evalK(1.45, 40);
const b = evalK(1.45, 80);
const c = evalK(1.45, 150);
P("  FIG_MAX=40 （现状）  ：屏幕人形 " + a.med.toFixed(1) + "px，最小重叠比 " + a.worst.toFixed(2));
P("  FIG_MAX=80           ：屏幕人形 " + b.med.toFixed(1) + "px，最小重叠比 " + b.worst.toFixed(2));
P("  FIG_MAX=150          ：屏幕人形 " + c.med.toFixed(1) + "px，最小重叠比 " + c.worst.toFixed(2));
P("");
P("  **人形在屏幕上的尺寸，几乎完全由 FIG_MAX × scale 决定。**");
P("  它是唯一的旋钮，而且现在被设成了 40 —— 屏幕上限 37px。");
P("");
P("  代价是重叠。哪一档可以接受是**观感判断**，要看截图。");
P("  参照：真实照片里的人群，半身遮挡是常态；");
P("        而「三四个人互相不碰」这种画面，其实更像「开会」而不是「人群」。");
