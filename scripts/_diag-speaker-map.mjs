/**
 * 验证一个关键假设：**人形序号 i 能不能对上答主身份？**
 *
 * 对话气泡要「谁说的标谁的名字」，而 `crowd.ts` 的人形只有一个 `key = node.id#i`。
 * 我的推断是：`avatarSource(id)` 返回的 handles 顺序，
 * 与 `answers[]` 顺序一致 —— 那么 `key` 的 `i` 位就是 `avatarHandles[i]`。
 *
 * **这个假设如果不成立，气泡会把话安到错误的人头上** —— 那比没有气泡严重得多
 * （等于伪造署名）。所以先量，不猜。
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { register } from "node:module";

register(new URL("./_ts-hook.mjs", import.meta.url));
const { layoutSquare } = await import("../lib/domain/square-layout.ts");
const { PERSONAS } = await import("../lib/domain/personas/index.ts");

const here = dirname(fileURLToPath(import.meta.url));
const raw = JSON.parse(readFileSync(join(here, "..", "public", "square-library.json"), "utf8"));
const entries = raw.entries ?? [];

const lookup = new Map();
for (const p of PERSONAS) lookup.set(p.handle, p.displayName ?? p.name ?? p.handle);

const avatarSource = (id) => {
  const e = entries.find((x) => x.id === id);
  return e?.routing?.recommendedHandles ?? e?.skills?.map((s) => s.persona?.handle) ?? [];
};

const L = layoutSquare(
  entries.map((e) => {
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
  }),
  (h) => lookup.get(h),
  avatarSource,
);

const P = (s) => console.log(s);
P("");
P("=".repeat(100));
P("  假设验证：avatarHandles[i] 是否等于 answers[i].skillName");
P("=".repeat(100));
P("");

let same = 0;
let diff = 0;
let missing = 0;
for (const n of L.nodes) {
  const e = entries.find((x) => x.id === n.id);
  if (!e) continue;
  const ansNames = (e.answers ?? []).map((a) => a.skillName);
  const handles = n.avatarHandles;

  const mapped = handles.map((h) => lookup.get(h) ?? "?" + h);
  const aligned = mapped.length === ansNames.length && mapped.every((m, i) => m === ansNames[i]);
  if (aligned) same++;
  else {
    diff++;
    if (diff <= 4) {
      P("  ✗ " + n.title.slice(0, 24));
      P("      avatarHandles → 名字 : " + mapped.join(" / "));
      P("      answers[].skillName  : " + ansNames.join(" / "));
    }
  }
  if (handles.some((h) => !lookup.has(h))) missing++;
}
P("");
P("  顺序完全一致：" + same + " 场");
P("  顺序不一致：" + diff + " 场");
P("  handle 查不到显示名：" + missing + " 场");
P("");

// 逐场打印全部对照，人工扫一眼
P("=".repeat(100));
P("  逐场对照（全部 22 场）");
P("=".repeat(100));
for (const n of L.nodes) {
  const e = entries.find((x) => x.id === n.id);
  if (!e) continue;
  const mapped = n.avatarHandles.map((h) => lookup.get(h) ?? "?" + h);
  const ansNames = (e.answers ?? []).map((a) => a.skillName);
  const okMark = JSON.stringify(mapped) === JSON.stringify(ansNames) ? "✓" : "✗";
  P("");
  P("  " + okMark + " " + n.title.slice(0, 30));
  P("      handles→名 : " + mapped.join(" / "));
  P("      回答署名   : " + ansNames.join(" / "));
}
