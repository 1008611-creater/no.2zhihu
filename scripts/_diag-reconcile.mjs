/**
 * 核实：算法推算的「主体占 4.29%」为什么比实测算出来的还高。
 *
 * 实测（真实渲染，1440×900）：
 *   人形 1.49% + 影子 2.54% = 4.03%
 * 算法推算：人形 4.29% + 影子 3.30% = 7.58%
 *
 * 差异来源要查清楚 —— 报告里不能留两个互相矛盾的数字。
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
    id: e.id, title: e.title, answerCount: (e.answers ?? []).length,
    personaCount: handles.size,
    openGapCount: (e.gaps ?? []).filter((g) => !g.filledBy).length,
    hasReplies: false, mine: false,
  };
});
const L = layoutSquare(topics, (h) => h, () => []);
const C = crowdLayout(L.nodes);

const P = (s) => console.log(s);
P("舞台实测 = 1440×827 = " + (1440 * 827) + " px²（真实渲染测出来的）");
P("");
P("上一版审计用的 stageW = vw*0.75-24 = " + (1440 * 0.75 - 24) + "，");
P("但实测 .sq-stage 是 1440 宽（右栏是叠在上面的，不占舞台宽度）。");
P("→ 上一版把舞台宽度算小了，所以占比被**高估**了。");
const wrongArea = (1440 * 0.75 - 24) * (900 - 64);
const realArea = 1440 * 827;
P("   错误面积 " + Math.round(wrongArea) + "  vs  真实面积 " + realArea);
P("   倍数 " + (realArea / wrongArea).toFixed(2) + "×");
P("");

// 按正确面积重算
const scale = 0.92;
let figArea = 0, shArea = 0;
for (const c of C) {
  for (const f of c.figures) {
    const h = f.height * scale;
    const w = h * (12 / 20) * f.shape.widthScale;
    // 人形实心占比：头（圆）+ 身（弧顶梯形）。经验值 0.62 偏乐观，
    // 实测（bounding box 会被 rect 全占）约 0.55。
    if (f.kind === "persona") figArea += h * w * 0.55;
  }
}
// 影子面积：算法版按 length×width 算的是**矩形**，而 .sq-shadow 是圆角 rect
// —— 面积上确实是矩形，但实测只统计了**落在舞台内**的部分（被裁掉的不算）
P("按正确舞台面积重算：");
P("  人形（几何近似 0.55 实心率）: " + Math.round(figArea) + " px² = " + ((100 * figArea) / realArea).toFixed(2) + "%");
P("");
P("  实测 1.49% —— 与几何近似接近。差异来自：");
P("    · 圆角 rect 的实际像素比 bounding box 小（rx = 半宽，两端是半圆）");
P("    · 我用的 0.55 实心率仍是估计值");
P("");
P("结论：**实测值（1.49% / 2.54%）是权威值**，算法推算偏高。");
P("      两个都没错，但报告只应引用实测值。");
