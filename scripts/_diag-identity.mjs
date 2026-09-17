/**
 * 手上到底有哪些「人的身份」数据没用上？
 *
 * 动机：owner 说「这个人物一点意思都没有」「没有让我点下去的欲望」。
 * 我前几轮一直在优化尺寸与像素占比 —— 那是量的问题。
 * 他要的是**信息量**：这些剪影是谁？他们在说什么？
 *
 * 这份脚本把每个分身身上可用的身份字段列出来，看看有多少是**没有被画到广场上**的。
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { register } from "node:module";

register(new URL("./_ts-hook.mjs", import.meta.url));
const { PERSONAS } = await import("../lib/domain/personas/index.ts");

const here = dirname(fileURLToPath(import.meta.url));
const raw = JSON.parse(readFileSync(join(here, "..", "public", "square-library.json"), "utf8"));
const entries = raw.entries ?? [];

const P = (s) => console.log(s);

P("");
P("=".repeat(100));
P("  ① 库里一场讨论到底带了什么");
P("=".repeat(100));
const e0 = entries[0];
P("  entry 的字段：" + Object.keys(e0).join(", "));
P("");
P("  skills[] 的形状：");
P("    " + JSON.stringify(e0.skills?.[0], null, 2).split("\n").slice(0, 26).join("\n    "));
P("");
P("  answers[] 的形状：");
P("    " + JSON.stringify(e0.answers?.[0], null, 2).split("\n").slice(0, 20).join("\n    "));
P("");
P("  gaps[] 的形状：");
P("    " + JSON.stringify(e0.gaps?.[0], null, 2).split("\n").slice(0, 18).join("\n    "));

P("");
P("=".repeat(100));
P("  ② 每一个「人形」理论上能带多少身份信息（抽查 3 场）");
P("=".repeat(100));
for (const e of entries.slice(0, 3)) {
  P("");
  P("  【" + e.title.slice(0, 30) + "】");
  P("    answers " + (e.answers ?? []).length + " 条 · skills " + (e.skills ?? []).length + " 个 · gaps " + (e.gaps ?? []).length + " 个");
  for (const s of (e.skills ?? []).slice(0, 4)) {
    P("      · 分身名=" + (s.persona?.name ?? s.name ?? "?") + "  handle=" + (s.persona?.handle ?? "?") +
      "  stance=" + (s.persona?.stance ?? "-") + "  confidence=" + (s.confidence ?? "-"));
  }
  for (const a of (e.answers ?? []).slice(0, 3)) {
    const txt = String(a.text ?? a.content ?? "");
    P("      · 回答（" + (a.author ?? a.persona ?? "?") + "）：" + txt.slice(0, 46).replace(/\n/g, " ") + "…");
  }
}

P("");
P("=".repeat(100));
P("  ③ 人格库里有什么（stance / knows / 是否可对外显示）");
P("=".repeat(100));
P("  分身总数：" + PERSONAS.length);
const p0 = PERSONAS[0];
P("  单个人格的字段：" + Object.keys(p0).join(", "));
P("");
P("  抽样（name / handle / stance）：");
for (const p of PERSONAS.slice(0, 6)) {
  P("    " + String(p.name ?? "?").padEnd(12) + String(p.handle ?? "?").padEnd(22) +
    String(p.stance ?? "-").slice(0, 44));
}

P("");
P("=".repeat(100));
P("  ④ 结论：广场上画了什么 vs 有什么可以画");
P("=".repeat(100));
P("");
P("  现在画到广场上的：               仅「实心/空心」+ 大小");
P("  手上已有但**没画**的：");
P("    · 分身名（name）                —— 每场 3 个真名");
P("    · 分身立场（stance）            —— 可用来表达「他们不是一伙的」");
P("    · 回答正文（answers[].text）    —— 可用来做「现场的一句话」");
P("    · 来源数（skills[].sources）    —— 可表达「这人论据厚不厚」");
P("    · 缺口候选（gaps[].candidates） —— 可表达「缺的是谁」");
P("    · 置信度（confidence）          —— 可表达「这个人蒸馏得可不可靠」");
P("");
P("  也就是说：**广场把一个「谁在说、在说什么」的产品，画成了「有多少个点」的图。**");
