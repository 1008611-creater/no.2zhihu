/**
 * 第四个实验（收口）：同时扫 K 与 FIG_MAX，并把**跨簇遮挡**也算进去。
 *
 * ## 前面三个实验的结论链
 *
 *   实验①：缩 `size` **不会**让人形在屏幕上变大（scale 固定 0.92，
 *          人形又 ∝ size → 屏幕尺寸恒定）。我审计报告里的「34→50px」是错的。
 *   实验②：`FIG_HEIGHT_K` 提到 2.0 以上就不再涨 → 撞到了某个上界。
 *   实验③：那个上界是 **`FIG_MAX = 40`**。但只提 FIG_MAX 也没用（K=1.45 时 base=37 没顶到它）。
 *
 * ## 真正的机制（三行推导，全部由代码读出）
 *
 *   人形高 h = usable × K / √N
 *   usable   = radius × CROWD_USABLE = (size/2 × 0.72) × 0.72 = size × 0.2592
 *   → size=197 / N=4：h = 197 × 0.2592 × K / 2 = 25.5 × K
 *
 *   又：**簇内重叠比** = 人形中心距 / (0.42h) ∝ 1/K
 *       → **提 K 同时让人形变大、重叠变少**（两者同向！）
 *   上界：`FIG_MAX`。
 *
 * ## 但有一个前面没算的约束：跨簇遮挡
 *
 * 人形脚在簇盘内（最远 spread = radius×0.64），头顶再往上长 h。
 * 相邻簇中心距 = size × 1.1 = 217（size=197）。
 * 于是「两簇人形不互相穿」要求：`2 × (spread + 明确留白) ≤ 217`
 * —— 这一条会给出 h 的真实上限，且**比簇内重叠更紧**。
 *
 * 本实验把这两个约束一起量，给出可选的 K / FIG_MAX 组合。
 *
 * 跑法：node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON scripts/_diag-final-sweep.mjs
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

const L = layoutSquare(topics, (h) => h, () => []);
const nodes = L.nodes;
const stageW = 1440;
const stageH = 900 - 73;
const scale = 0.92;

const USABLE = 0.72;
const SPREAD = 0.64;
const FIG_MIN = 16;
const FIG_MIN_DEPTH = 11;
/** 布局层两簇之间的中心距系数（被 relaxOverlaps 保证不小于 size × 1.1）。 */
const CLUSTER_GAP = 1.1;

const P = (s) => console.log(s);

function measure(K, FIG_MAX) {
  const built = nodes.map((n) => {
    const c = crowdOf(n);
    const total = c.figures.length;
    if (total === 0) return { n, c, figs: [] };
    const usable = c.radius * USABLE;
    const base = Math.max(
      FIG_MIN_DEPTH,
      Math.min(FIG_MAX, Math.max(FIG_MIN, (usable * K) / Math.sqrt(total))),
    );
    // 人形位置保持原样（spread 由 crowd.ts 决定），只改高度
    const figs = c.figures.map((f) => ({ ...f, height: Math.max(FIG_MIN_DEPTH, base * f.shape.heightScale) }));
    return { n, c, figs };
  });

  // ① 簇内重叠
  let intraWorst = Infinity;
  for (const { figs } of built) {
    for (let i = 0; i < figs.length; i++) {
      for (let j = i + 1; j < figs.length; j++) {
        const a = figs[i];
        const b = figs[j];
        const d = Math.hypot(a.dx - b.dx, a.dy - b.dy);
        const need = Math.min(a.height, b.height) * 0.42;
        if (need > 0) intraWorst = Math.min(intraWorst, d / need);
      }
    }
  }

  // ② 跨簇遮挡：两簇的「视觉竖向占位」是否相交
  //    每簇的视觉半径 = spread + 最大人高（人头顶向上长）
  let crossRatio = Infinity;
  for (let i = 0; i < built.length; i++) {
    for (let j = i + 1; j < built.length; j++) {
      const A = built[i];
      const B = built[j];
      const maxHA = A.figs.length ? Math.max(...A.figs.map((f) => f.height)) : 0;
      const maxHB = B.figs.length ? Math.max(...B.figs.map((f) => f.height)) : 0;
      const rA = A.c.radius * SPREAD + maxHA;
      const rB = B.c.radius * SPREAD + maxHB;
      const d = Math.hypot(A.n.x - B.n.x, A.n.y - B.n.y);
      if (rA > 0 && rB > 0) crossRatio = Math.min(crossRatio, d / (rA + rB));
    }
  }

  // ③ 屏幕人形高 & 主体占比
  const meds = [];
  let area = 0;
  for (const { figs } of built) {
    const hs = figs.filter((f) => f.kind === "persona").map((f) => f.height).sort((a, b) => a - b);
    if (hs.length) meds.push(hs[Math.floor(hs.length / 2)] * scale);
    for (const f of figs) {
      const fh = f.height * scale;
      const fw = fh * (12 / 20) * f.shape.widthScale;
      area += fh * fw * 0.55;
    }
  }
  meds.sort((a, b) => a - b);
  return {
    med: meds[Math.floor(meds.length / 2)] || 0,
    intraWorst,
    crossRatio,
    pct: (100 * area) / (stageW * stageH),
  };
}

P("");
P("=".repeat(104));
P("  K × FIG_MAX 联合扫描（含跨簇遮挡）");
P("=".repeat(104));
P("");
P("  列说明：");
P("    人形屏高   = 中位数（屏幕像素）");
P("    簇内重叠比 < 1 有重叠，< 0.75 明显穿模");
P("    跨簇间隙比 ≥ 1 表示相邻两簇的视觉占位不重叠（< 1 = 簇与簇挤在一起）");
P("");
P("  K     FIG_MAX  人形屏高   簇内重叠比   跨簇间隙比   主体占比   判定");
P("  " + "-".repeat(98));

const combos = [];
for (const K of [1.45, 2.0, 2.6, 3.2, 4.0, 5.0]) {
  for (const FIG_MAX of [40, 60, 80, 110, 160]) {
    const m = measure(K, FIG_MAX);
    const okIntra = m.intraWorst >= 0.75;
    const okCross = m.crossRatio >= 1.0;
    const verdict =
      okIntra && okCross
        ? "✓ 可用"
        : !okIntra && !okCross
          ? "✗ 双输"
          : !okIntra
            ? "△ 簇内重叠"
            : "△ 跨簇挤";
    combos.push({ K, FIG_MAX, ...m, okIntra, okCross, verdict });
    P(
      "  " +
        K.toFixed(2).padStart(4) +
        String(FIG_MAX).padStart(9) +
        m.med.toFixed(1).padStart(11) + "px" +
        m.intraWorst.toFixed(2).padStart(12) +
        m.crossRatio.toFixed(2).padStart(13) +
        m.pct.toFixed(2).padStart(11) + "%" +
        "   " + verdict,
    );
  }
}

P("");
P("=".repeat(104));
P("  可行组合（两项都不越界），按人形屏高从大到小");
P("=".repeat(104));
P("");
const usable = combos.filter((c) => c.okIntra && c.okCross).sort((a, b) => b.med - a.med);
if (usable.length === 0) {
  P("  （没有同时满足的组合 —— 说明两个约束互相矛盾，必须放弃其中一条）");
  P("   最接近的：");
  const best = combos.slice().sort((a, b) => Math.abs(b.med - a.med) && b.intraWorst - a.intraWorst);
  for (const c of combos.slice(0, 8)) {
    P("     K=" + c.K + " FIG_MAX=" + c.FIG_MAX + " → 人形 " + c.med.toFixed(1) + "px，簇内 " +
      c.intraWorst.toFixed(2) + "，跨簇 " + c.crossRatio.toFixed(2));
  }
} else {
  for (const c of usable.slice(0, 10)) {
    P("  K=" + c.K.toFixed(2).padStart(4) + "  FIG_MAX=" + String(c.FIG_MAX).padStart(4) +
      "  →  人形 " + c.med.toFixed(1).padStart(5) + "px   簇内 " + c.intraWorst.toFixed(2) +
      "   跨簇 " + c.crossRatio.toFixed(2) + "   主体 " + c.pct.toFixed(2) + "%");
  }
}
P("");
P("  现状（K=1.45 / FIG_MAX=40）：人形 " + measure(1.45, 40).med.toFixed(1) + "px");
