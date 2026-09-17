/**
 * 动手前的资产盘点：看山有哪些状态、话题簇能发光用什么数据、人形能挂什么标签。
 *
 * 动机：owner 要求「人物可视化+风格化+交互+自主运动+对话打招呼+小动作、
 * 广场中心站着刘看山一直动、鼠标移上去有交互、话题要一眼看出是干什么的
 * 并且**发光**、人围着它像围着一件奇珍异宝、影子因此才合理」。
 *
 * 我原来的设计是「整个广场一盏灯」—— 抽象，而且离灯远的簇影子全是平行乱甩。
 * 改成「**每个话题自己发光、人围着它站、影子从它往外辐射**」之后，
 * 每一簇的光影自己就自洽了。这是这一轮最要紧的修正。
 *
 * 这份脚本先摸清手上有什么，再决定怎么画。
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { register } from "node:module";
import { globSync } from "node:fs";

register(new URL("./_ts-hook.mjs", import.meta.url));

const here = dirname(fileURLToPath(import.meta.url));
const B = join(here, "..");
const P = (s) => console.log(s);

P("");
P("=".repeat(100));
P("  ① 看山有哪些状态与素材");
P("=".repeat(100));
try {
  const st = await import("../components/kanshan/states.ts");
  P("  导出：" + Object.keys(st).join(", "));
  const map = st.KANSHAN_ASSET_BY_STATE;
  if (map) {
    for (const [k, v] of Object.entries(map)) {
      P("  " + String(k).padEnd(14) + " still=" + String(v.still).slice(0, 46));
      P("  " + "".padEnd(14) + " anim=" + String(v.animWebp).slice(0, 46));
    }
  }
} catch (err) {
  P("  states.ts 读取失败：" + String(err).slice(0, 120));
}

P("");
P("  素材目录（public/ 下与看山相关的）：");
import { readdirSync, statSync } from "node:fs";
function walk(dir, depth = 0) {
  if (depth > 3) return;
  let items = [];
  try {
    items = readdirSync(dir);
  } catch {
    return;
  }
  for (const it of items) {
    const full = join(dir, it);
    let st2;
    try {
      st2 = statSync(full);
    } catch {
      continue;
    }
    if (st2.isDirectory()) walk(full, depth + 1);
    else if (/kanshan|看山/i.test(it) || /kanshan/i.test(full)) {
      P("    " + (st2.size / 1024).toFixed(0).padStart(6) + " KB  " + full.replace(B, "").replace(/\\/g, "/"));
    }
  }
}
walk(join(B, "public"));

P("");
P("=".repeat(100));
P("  ② 话题：能拿什么做「一眼看出是干什么的」");
P("=".repeat(100));
const raw = JSON.parse(readFileSync(join(B, "public", "square-library.json"), "utf8"));
const entries = raw.entries ?? [];
const e0 = entries[0];
P("  entry 顶层字段：" + Object.keys(e0).join(", "));
P("");
P("  routing（这是最可能的「一眼看出」来源）：");
P("    " + JSON.stringify(e0.routing, null, 2).split("\n").slice(0, 22).join("\n    "));
P("");
P("  22 场的问题 → 主题分类分布：");
const byTheme = new Map();
for (const e of entries) {
  const k = e.routing?.theme ?? e.routing?.topic ?? "(无)";
  byTheme.set(k, (byTheme.get(k) ?? 0) + 1);
}
for (const [k, n] of [...byTheme].sort((a, b) => b[1] - a[1])) P("    " + String(k).padEnd(18) + n + " 场");
P("");
P("  每场自带的可用「图标/符号」线索：");
P("    routing.summary 样例：" + String(e0.routing?.summary ?? "(无)").slice(0, 100));
P("");
P("  各场 title 首词（看有没有现成的物件名词）：");
for (const e of entries.slice(0, 22)) {
  P("    " + String(e.title).slice(0, 34));
}

P("");
P("=".repeat(100));
P("  ③ 人形能挂什么标签（真名 / 立场 / 来源数）");
P("=".repeat(100));
for (const e of entries.slice(0, 2)) {
  P("");
  P("  【" + e.title.slice(0, 30) + "】");
  for (const s of e.skills ?? []) {
    const ans = (e.answers ?? []).find((a) => a.skillId === s.id);
    P("    " + String(s.name).padEnd(10) +
      " lens=" + String(s.lens ?? "-").slice(0, 24).padEnd(26) +
      " accent=" + String(s.accent ?? "-").padEnd(9) +
      " 来源=" + (ans?.evidenceCount ?? ans?.sources?.length ?? "-") +
      " 字数=" + String(ans?.body ?? "").length);
  }
  for (const g of e.gaps ?? []) {
    P("    缺口 [" + g.kind + "] " + g.label + " · severity=" + g.severity);
    P("      reason: " + String(g.reason).slice(0, 88));
    P("      need:   " + String(g.needProfile).slice(0, 88));
  }
}
