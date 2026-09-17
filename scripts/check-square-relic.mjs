/**
 * 话题物件与人物动作的回归自检（standalone，无需测试框架）。
 *
 * 跑法：node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON scripts/check-square-relic.mjs
 *
 * ## 它盯的是「出错时看不出来」的五件事
 *
 *   ① **每场都有一件物件** —— 命不中时不能返回 null（广场中央空着比放错更糟）
 *   ② **物件要与标题真的相关** —— 抽查必须命中预期的形状，否则「一眼看出」
 *      这件事就是假的（画了个咖啡杯但聊的是近视，比不画更糟）
 *   ③ **动作只给在场分身** —— 给缺口加动作 = 假装他来了（诚实性红线）
 *   ④ **绝大多数人只是静立** —— 人人都点头挥手就不像人群，像机器人展
 *   ⑤ **可复现** —— 同一标题永远同一件物件、同一人永远同一个动作
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { register } from "node:module";

register(new URL("./_ts-hook.mjs", import.meta.url));

const { layoutSquare } = await import("../lib/domain/square-layout.ts");
const { crowdLayout } = await import("../lib/domain/crowd.ts");
const { relicOf, RELIC_LABELS } = await import("../lib/domain/relic.ts");
const { interactionsOf, GESTURE_LABELS, kanshanGazeAt } = await import("../lib/domain/dialogue.ts");

const here = dirname(fileURLToPath(import.meta.url));
const raw = JSON.parse(readFileSync(join(here, "..", "public", "square-library.json"), "utf8"));
const entries = raw.entries ?? [];

let fail = 0;
const bad = (m) => {
  fail++;
  console.log("  ✗ " + m);
};
const ok = (m) => console.log("  ✓ " + m);
const head = (t) => {
  console.log("\n" + "=".repeat(74));
  console.log(t);
  console.log("=".repeat(74));
};

const topics = entries.map((e) => {
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

const layout = layoutSquare(topics, (h) => h, () => []);
const clusters = crowdLayout(layout.nodes);

head("① 每一场都有一件物件（不能有空手站着的场）");
{
  let missing = 0;
  const dist = new Map();
  for (const n of layout.nodes) {
    const r = relicOf(n.title, n.size);
    if (!r || !r.shape || !RELIC_LABELS[r.shape]) missing++;
    else dist.set(r.shape, (dist.get(r.shape) ?? 0) + 1);
  }
  if (missing > 0) bad(missing + " 场拿不到物件");
  else ok(layout.nodes.length + " 场全部有物件");

  const kinds = [...dist].sort((a, b) => b[1] - a[1]);
  console.log(
    "  分布：" + kinds.map(([k, n]) => RELIC_LABELS[k] + "×" + n).join(" · "),
  );
  if (kinds.length < 3) bad("物件种类太少（" + kinds.length + " 种）—— 广场会显得单调");
  else ok("物件有 " + kinds.length + " 种，分布有区分度");
}

head("② 物件必须与标题真的相关（抽查，这是「一眼看出」的命门）");
{
  // 逐条人工指定的期望值。这不是自证 —— 是**负向验证**：
  // 如果关键词表被改坏，这几条会立刻失败。
  const CASES = [
    ["孩子近视了，要不要立刻配离焦镜？", "glass"],
    ["小城市开一家咖啡店，真实成本和风险是什么？", "cup"],
    ["月薪两万，在一线城市该不该买房？", "house"],
    ["要不要送孩子去读国际学校？", "book"],
    ["长期加班到十点，身体开始报警，该辞职吗？", "clock"],
    ["父母执意要买保健品，怎么劝？", "pill"],
    ["存款 50 万，是先买车还是先还房贷？", "coin"],
    ["副业做自媒体，多久能超过主业收入？", "screen"],
  ];
  let wrong = 0;
  for (const [title, expect] of CASES) {
    const got = relicOf(title, 197).shape;
    if (got !== expect) {
      bad("「" + title.slice(0, 18) + "…」期望 " + RELIC_LABELS[expect] + "，实得 " + RELIC_LABELS[got]);
      wrong++;
    }
  }
  if (wrong === 0) ok(CASES.length + " 条抽查全部命中预期物件");
}

head("③ 动作只给在场分身（缺口不能有动作）");
{
  let bad1 = 0;
  for (let i = 0; i < clusters.length; i++) {
    const c = clusters[i];
    const personaKeys = c.figures.filter((f) => f.kind === "persona").map((f) => f.key);
    const gapKeys = new Set(c.figures.filter((f) => f.kind === "gap").map((f) => f.key));
    const acts = interactionsOf(c.id, personaKeys);
    if (acts.length !== personaKeys.length) bad1++;
    for (const a of acts) if (gapKeys.has(a.from)) bad1++;
  }
  if (bad1 > 0) bad(bad1 + " 处动作分配错误（数量不符或给了缺口）");
  else ok("动作数与在场分身数一致，缺口一个都没有");

  // 光晕强度必须在能看见的区间
  const weak = layout.nodes.filter((n) => relicOf(n.title, n.size).intensity < 0.45);
  if (weak.length > 0) bad(weak.length + " 场光晕强度低于 0.45（深色地面上看不见）");
  else ok("全部物件的强度 ≥ 0.45（深色地面上可见）");

  // 在真实数据上验证光晕有区分度
  const ints = layout.nodes.map((n) => relicOf(n.title, n.size).intensity);
  const lo = Math.min(...ints);
  const hi = Math.max(...ints);
  console.log("  强度区间：" + lo.toFixed(2) + " – " + hi.toFixed(2));
}

head("④ 绝大多数人只是静立（否则像机器人展）");
{
  const all = [];
  for (const c of clusters) {
    all.push(...interactionsOf(c.id, c.figures.filter((f) => f.kind === "persona").map((f) => f.key)));
  }
  const byG = new Map();
  for (const a of all) byG.set(a.gesture, (byG.get(a.gesture) ?? 0) + 1);
  const breeze = byG.get("breeze") ?? 0;
  const pct = (100 * breeze) / all.length;
  console.log(
    "  " + all.length + " 个人形：" +
      [...byG].sort((a, b) => b[1] - a[1]).map(([g, n]) => GESTURE_LABELS[g] + "×" + n).join(" · "),
  );
  if (pct < 50) bad("静立占比只有 " + pct.toFixed(0) + "% —— 太闹了");
  else if (pct > 75) bad("静立占比 " + pct.toFixed(0) + "% —— 太死，看不出「有人在聊」");
  else ok("静立占比 " + pct.toFixed(0) + "%（在 50–75% 之间：有动静但不吵）");

  // 至少要有几种不同的动作真的出现过
  const kinds = [...byG.keys()].filter((g) => g !== "breeze").length;
  if (kinds < 2) bad("非静立动作只有 " + kinds + " 种 —— 太单调");
  else ok("非静立动作有 " + kinds + " 种");
}

head("⑤ 动作必须指向簇内（不指向场外，那是发呆）");
{
  let orphan = 0;
  for (const c of clusters) {
    const keys = new Set(c.figures.filter((f) => f.kind === "persona").map((f) => f.key));
    for (const a of interactionsOf(c.id, [...keys])) {
      if (a.to !== null && !keys.has(a.to)) orphan++;
      if (a.to === a.from) orphan++;
    }
  }
  if (orphan > 0) bad(orphan + " 个动作指向了簇外或自己");
  else ok("全部动作都指向簇内的另一个人或中心物件");
}

head("⑥ 可复现（同一输入永远同一结果）");
{
  const a1 = JSON.stringify(layout.nodes.map((n) => relicOf(n.title, n.size)));
  const a2 = JSON.stringify(layout.nodes.map((n) => relicOf(n.title, n.size)));
  if (a1 !== a2) bad("物件不是确定性的");
  else ok("同一标题永远得到同一件物件");

  const keys = clusters[1].figures.filter((f) => f.kind === "persona").map((f) => f.key);
  const i1 = JSON.stringify(interactionsOf(clusters[1].id, keys));
  const i2 = JSON.stringify(interactionsOf(clusters[1].id, keys));
  if (i1 !== i2) bad("动作不是确定性的");
  else ok("同一个人永远得到同一个动作");

  const g1 = kanshanGazeAt(layout.nodes.map((n) => n.id), 3.2);
  const g2 = kanshanGazeAt(layout.nodes.map((n) => n.id), 3.2);
  if (g1 !== g2) bad("看山注视不是确定性的");
  else ok("看山注视可复现（t=3.2 → " + String(g1).slice(0, 16) + "）");

  // 看山必须真的会换视线（否则「自主运动」是假的）
  const ids = layout.nodes.map((n) => n.id);
  const seen = new Set();
  for (let t = 0; t < 200; t += 1) seen.add(kanshanGazeAt(ids, t));
  if (seen.size < 10) bad("看山只看了 " + seen.size + " 场，几乎不动");
  else ok("看山 200 秒里看了 " + seen.size + " 场（真的在换视线）");

  if (kanshanGazeAt([], 5) !== null) bad("空广场看山不该有目标");
  else ok("空广场看山没有目标（不造一个假目标）");
}

head("⑦ 物件的光晕与本体：分列人群两侧，且必须同尺寸（渲染顺序的隐式契约）");

{
  /**
   * 为什么必须守这一条：光晕与本体被拆成两次渲染（见 TopicRelic 的 `part`），
   * 两者是**同一个绝对定位的 div**，只有尺寸完全一致才会重合。
   * 尺寸一错，本体与光晕会错位 —— 看起来像两件东西，而这件事
   * 在截图里很像是「美术没调好」，不会有人想到是两处传参不一致。
   *
   * 顺序也是契约：光晕必须在人群 svg **之前**（人站在光里），
   * 本体必须在**之后**（物件不被挡住）。写反了在代码上完全合法。
   */
  const src = readFileSync(join(here, "..", "components", "square", "CrowdCluster.tsx"), "utf8");

  const auraIdx = src.indexOf('part="aura"');
  const bodyIdx = src.indexOf('part="body"');
  const svgIdx = src.indexOf('className="sq-crowd"');

  if (auraIdx < 0 || bodyIdx < 0) {
    bad("找不到 part=\"aura\" / part=\"body\" —— 物件又变回单次渲染了？");
  } else if (svgIdx < 0) {
    bad("找不到人群 svg（className=\"sq-crowd\"）");
  } else {
    ok("光晕与本体分两次渲染");
    if (auraIdx < svgIdx && svgIdx < bodyIdx) {
      ok("顺序正确：光晕 → 人群 svg → 物件本体");
    } else {
      bad(
        "渲染顺序不对（aura@" + auraIdx + " svg@" + svgIdx + " body@" + bodyIdx + "）—— " +
          "光晕必须在人群之前（人站在光里），本体必须在人群之后（物件不被挡住）",
      );
    }
  }

  // 两处的 size 表达式必须逐字相同
  const grab = (marker) => {
    const i = src.indexOf(marker);
    if (i < 0) return null;
    const seg = src.slice(i, i + 400);
    const m = /size=\{([^}]+)\}/.exec(seg);
    return m ? m[1].trim() : null;
  };
  const auraSize = grab('part="aura"');
  const bodySize = grab('part="body"');
  if (!auraSize || !bodySize) {
    bad("读不到两处的 size（写法变了？）");
  } else if (auraSize === bodySize) {
    ok("两处 size 完全一致：" + auraSize);
  } else {
    bad("两处 size 不一致（光晕 " + auraSize + " vs 本体 " + bodySize + "）—— 本体与光晕会错位，看起来像两件东西");
  }

  // 内外两种线不能混用：TopicRelic 里必须同时存在 sq-relic-line 与 sq-relic-detail
  const relicSrc = readFileSync(join(here, "..", "components", "square", "TopicRelic.tsx"), "utf8");
  const nLine = (relicSrc.match(/sq-relic-line/g) ?? []).length;
  const nDetail = (relicSrc.match(/sq-relic-detail/g) ?? []).length;
  if (nLine > 0 && nDetail > 0) {
    ok("内部线（sq-relic-detail ×" + nDetail + "）与外部线（sq-relic-line ×" + nLine + "）分开使用");
  } else {
    bad(
      "内部线与外部线没有分开（detail×" + nDetail + " line×" + nLine + "）—— " +
        "本体是实心亮色时，同一个颜色不可能既压在暗底上看得见、又压在亮本体上看得见",
    );
  }
}

console.log("\n" + "=".repeat(74));
console.log(fail === 0 ? "全部通过（0 处问题）" : "发现 " + fail + " 处问题");
console.log("=".repeat(74));
process.exit(fail === 0 ? 0 : 1);
