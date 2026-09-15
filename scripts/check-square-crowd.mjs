/**
 * 广场人群 + 现场广播的回归自检（standalone，无需测试框架）。
 *
 * 本仓库没有 vitest/jest，所以自检写成可以直接 `node` 跑的脚本 ——
 * 纯函数层的改动必须能被一条命令验完，否则「改一行、肉眼看看」迟早出事。
 *
 * 跑法：node scripts/check-square-crowd.mjs
 *
 * 它盯的是四件**出错时用户看不出来**的事：
 *   ① 人形数量必须等于真实计数（多了就是替产品吹规模，少了就是藏信息）
 *   ② 人群不能重叠成一坨（几何算错的典型症状）
 *   ③ 同一输入必须得到同一个广场（评委要能复现同一个画面）
 *   ④ 右栏摘录必须是原文的真子串（截断可以，改写不行）
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { register } from "node:module";

// 被测模块必须动态 import —— 见 scripts/_ts-hook.mjs 的注释。
register(new URL("./_ts-hook.mjs", import.meta.url));

const { layoutSquare } = await import("../lib/domain/square-layout.ts");
const { crowdLayout } = await import("../lib/domain/crowd.ts");
const { excerptOf, metaOf, sourceFromLibrary, toBroadcastItem } = await import(
  "../lib/domain/broadcast.ts"
);
const { statsOf, hydrateLibraryEntry } = await import("../lib/domain/library.ts");
const { splitSources } = await import("../lib/domain/evidence.ts");

const here = dirname(fileURLToPath(import.meta.url));
const raw = JSON.parse(readFileSync(join(here, "..", "public", "square-library.json"), "utf8"));
const entries = raw.entries ?? [];

let fail = 0;
const bad = (msg) => {
  fail++;
  console.log("  ✗ " + msg);
};
const ok = (msg) => console.log("  ✓ " + msg);

console.log("=".repeat(74));
console.log("① 人群规模必须等于真实计数");
console.log("=".repeat(74));

const topics = entries.map((e) => {
  const st = statsOf(e);
  return {
    id: e.id,
    title: e.title,
    answerCount: st.answerCount,
    personaCount: st.personaCount,
    openGapCount: st.openGapCount,
    hasReplies: st.hasReplies,
    mine: false,
  };
});

const build = (list) => crowdLayout(layoutSquare(list, (h) => h, () => []).nodes);

const clusters = build(topics);
console.log(
  "  " + "标题".padEnd(34) + "分身".padStart(6) + "缺口".padStart(6) +
  "人形".padStart(6) + "半径".padStart(6) + "人高".padStart(6)
);
for (const c of clusters) {
  const src = topics.find((t) => t.id === c.id);
  const personas = c.figures.filter((f) => f.kind === "persona").length;
  const gaps = c.figures.filter((f) => f.kind === "gap").length;
  const h = c.figures.length ? Math.round(c.figures.reduce((s, f) => s + f.height, 0) / c.figures.length) : 0;
  console.log(
    "  " + src.title.slice(0, 32).padEnd(34) +
    String(c.personaCount).padStart(6) + String(c.gapCount).padStart(6) +
    String(c.figures.length).padStart(6) + String(Math.round(c.radius)).padStart(6) +
    String(h).padStart(6)
  );
  if (personas !== src.personaCount) bad(c.id + " 实心人形 " + personas + " ≠ 真实分身 " + src.personaCount);
  if (gaps !== src.openGapCount) bad(c.id + " 空心人形 " + gaps + " ≠ 真实缺口 " + src.openGapCount);
  if (c.figures.length !== src.personaCount + src.openGapCount) bad(c.id + " 人形总数对不上");
}
if (!fail) ok(clusters.length + " 簇全部与真实计数一致");

console.log("\n" + "=".repeat(74));
console.log("② 人群不能重叠成一坨");
console.log("=".repeat(74));
let worst = { ratio: 0, id: "" };
for (const c of clusters) {
  for (let i = 0; i < c.figures.length; i++) {
    for (let j = i + 1; j < c.figures.length; j++) {
      const a = c.figures[i];
      const b = c.figures[j];
      const d = Math.hypot(a.dx - b.dx, a.dy - b.dy);
      // 人形宽约为高的 0.42，两个并排站立的最小中心距应 ≥ 0.42×高。
      const need = Math.min(a.height, b.height) * 0.42;
      const ratio = d / need;
      if (ratio < worst.ratio || worst.id === "") {
        if (ratio < worst.ratio || worst.ratio === 0) worst = { ratio, id: c.id };
      }
    }
  }
}
console.log("  最挤的一对：中心距 / 最小应有间距 = " + worst.ratio.toFixed(2) + "（" + worst.id.slice(0, 30) + "）");
if (worst.ratio < 1) bad("有两个人形叠在一起");
else ok("无重叠（最小比 " + worst.ratio.toFixed(2) + "）");

console.log("\n" + "=".repeat(74));
console.log("③ 同一输入必须得到同一个广场（零随机）");
console.log("=".repeat(74));
const again = build(topics);
if (JSON.stringify(clusters) === JSON.stringify(again)) ok("两次计算结果逐字节相同");
else bad("两次结果不同 —— 布局引入了随机性");

console.log("\n" + "=".repeat(74));
console.log("④ 右栏摘录必须是原文真子串（截断可以，改写不行）");
console.log("=".repeat(74));
let checked = 0;
for (const e of entries) {
  const item = toBroadcastItem(sourceFromLibrary(e));
  if (!item.excerpt) {
    bad(e.title.slice(0, 20) + " 没有摘录");
    continue;
  }
  const clean = (b) => b.replace(/\s+/g, " ").replace(/^[#>*\-\u3000\s]+/, "").trim();
  const body = clean((e.answers ?? []).find((a) => a.body?.trim())?.body ?? "");
  const probe = item.excerpt.replace(/…$/, "");
  if (!body.includes(probe)) bad("摘录不是原文：" + item.excerpt.slice(0, 30));
  else checked++;
  if (!item.excerptBy) bad("摘录没有标注出自哪位分身");
}
ok(checked + "/" + entries.length + " 条摘录可在原文中逐字查到，且都带作者");

console.log("\n" + "=".repeat(74));
console.log("⑤ 元信息不得出现编造的数字");
console.log("=".repeat(74));
const allowed = (s) =>
  /^摘录自 .+$/.test(s) ||
  /^我的提问$/.test(s) ||
  /^(\d+) 位分身参与$/.test(s) ||
  /^共 (\d+) 条回答$/.test(s) ||
  /^(\d+) 条来源$/.test(s) ||
  /^(\d+) 个缺口待补$/.test(s);
let metaN = 0;
for (const e of entries) {
  const s = sourceFromLibrary(e);
  const meta = metaOf(s);
  for (const m of meta) {
    metaN++;
    if (!allowed(m)) bad("未知的元信息片段：" + m);
  }
  // 数字必须能在真实数据里找到出处（「摘录自 X」已在上面判过白名单）
  const st = statsOf(e);
  const truth = [
    st.personaCount + " 位分身参与",
    st.sourceCount + " 条来源",
    st.openGapCount + " 个缺口待补",
  ].filter((x) => !x.startsWith("0 "));
  for (const t of truth) if (!meta.includes(t)) bad("漏了真实元信息：" + t + " @ " + e.id.slice(0, 12));
}
ok("共 " + metaN + " 条元信息片段，全部可溯源");
console.log("  示例：" + JSON.stringify(metaOf(sourceFromLibrary(entries[0])), null, 0));

console.log("\n" + "=".repeat(74));
console.log("⑥ excerptOf 边界");
console.log("=".repeat(74));
const cases = [
  ["", ""],
  // 第一句只有 5 个字 → 顺延到下一个句读，否则摘录没有信息量
  ["先说结论。后面还有很多话，但第一句就是全部信息。", "先说结论。后面还有很多话，但第一句就是全部信息。"],
  // 第一句够长 → 就取第一句，不贪多
  ["这是一句足够长的判断，可以直接当作摘录用。后面还有别的话。", "这是一句足够长的判断，可以直接当作摘录用。"],
  ["短", "短"],
  // 通篇没有句读 → 按字数截断，且不在标点前切断
  ["很长的第一句没有任何句号一直写下去".repeat(6), null],
];
for (const [input, expect] of cases) {
  const got = excerptOf(input);
  if (expect !== null && got !== expect) bad("excerptOf(" + JSON.stringify(input.slice(0, 12)) + ") = " + JSON.stringify(got));
  if (got.length > 70) bad("摘录过长：" + got.length);
}
ok("空串 / 短句 / 超长句 均未越界");

console.log("\n" + "=".repeat(74));
console.log("⑦ 已踩过的布局/滚动坑（文本级守卫）");
console.log("=".repeat(74));

/** 取出某个选择器的规则体（够用即可，不写完整 CSS 解析器）。 */
const ruleBody = (css, selector) => {
  const i = css.indexOf(selector + " {");
  if (i < 0) return null;
  const j = css.indexOf("}", i);
  return css.slice(i, j + 1);
};

const v2css = readFileSync(join(here, "..", "app", "frontend-v2.css"), "utf8");
const globalsCss = readFileSync(join(here, "..", "app", "globals.css"), "utf8");
const panelTsx = readFileSync(join(here, "..", "components", "square", "BroadcastPanel.tsx"), "utf8");
const dirTsx = readFileSync(join(here, "..", "components", "personas", "PersonaDirectory.tsx"), "utf8");

// 坑 A：.sq-bleed 曾在视口 > 1240px 时整体右移 (100vw-1240)/2，
// 把右栏「现场广播」切掉 100–340px（内容显示不全、滚动条跑到视口外）。
// 守卫：必须用视口相对写法，不许退回固定负 margin。
const bleed = ruleBody(v2css, ".sq-bleed");
if (!bleed) bad(".sq-bleed 规则不见了");
else if (!bleed.includes("calc(50% - 50vw)")) bad(".sq-bleed 未使用 calc(50% - 50vw) —— 宽视口下会再次右移并切掉右栏");
else if (/(margin-left|margin-right):\s*-\d/.test(bleed)) bad(".sq-bleed 又出现了固定负 margin —— 那正是切掉右栏的写法");
else ok(".sq-bleed 用视口相对偏移（宽视口不再右移）");

// 坑 B：Lenis 在 window 上 preventDefault 接管滚动，广场页 body 已锁，
// 于是右栏滚轮完全失效（实测 scrollTop 恒为 0）。必须给它 data-lenis-prevent。
const listTag = (panelTsx.match(/<div[^>]*className="sq-broadcast-list"[^>]*>/) ?? [])[0];
if (!listTag) bad("BroadcastPanel 里找不到 .sq-broadcast-list 的容器");
else if (!listTag.includes("data-lenis-prevent")) bad(".sq-broadcast-list 缺少 data-lenis-prevent —— 右栏会再次滚不动");
else ok(".sq-broadcast-list 带 data-lenis-prevent（Lenis 放行右栏原生滚动）");

// 坑 C：名册卡片外面的 motion.div 带 transform → 自建 stacking context，
// 浮层自己的 z-index:60 出不去，被后面几张卡盖住（实测 11/16 张）。
// 守卫：网格项上的 :has() 提升规则存在，且目录真的用了那个类。
if (!globalsCss.includes(".persona-grid > *:has(.persona-popover)")) {
  bad("缺少 .persona-grid > *:has(.persona-popover) 的层级提升规则 —— 浮层会再次被后面的卡片盖住");
} else if (!dirTsx.includes("persona-grid")) {
  bad("PersonaDirectory 没有使用 persona-grid 类，上面的规则不会生效");
} else {
  ok("名册浮层在网格项上提升层级（不再被后续卡片覆盖）");
}

console.log("\n" + "=".repeat(74));
console.log("⑧ 来源必须带作者与链接（铁律 3），且展示口径只有一套");
console.log("=".repeat(74));
/**
 * 这一节是 2026-09-15 那次修复的护栏。
 *
 * 当时 `slim()` 只留了来源**标题**，url / author 被裁掉，于是从广场载入的讨论，
 * 其回答页呈现出「N 条真实知乎来源」+ 空链接 + 空署名胶囊 + 孤零零一个「…」。
 * 守卫写在这里，是因为这类退化**不会报错、不会崩** —— 只会让页面看起来像坏了。
 */
const ZHIHU_HOST = /^https:\/\/(www|zhuanlan)\.zhihu\.com\//;
let srcTotal = 0;
let attributable = 0;
let emptyAnswers = 0;
for (const e of entries) {
  for (const a of e.answers ?? []) {
    // 要求**字段存在**：`sources` 被整个丢掉时（历史上就是这么退化的）这里会失败。
    if (!Array.isArray(a.sources)) {
      bad(e.title.slice(0, 18) + " / " + a.skillName + " 缺 sources 字段");
      continue;
    }
    // 空数组是**合法**状态：确有回答是「一条证据都没取到」，此时回答页会走
    // 「已标记为缺口」的提示 —— 那是设计内的降级，不是退化。如实计数即可。
    if (a.sources.length === 0) {
      emptyAnswers++;
      continue;
    }
    for (const s of a.sources) {
      srcTotal++;
      if (!s.title?.trim()) bad("来源缺标题 @" + e.id.slice(0, 12));
      if (!Number.isFinite(s.voteUp) || s.voteUp < 0) bad("赞同数不合法：" + s.voteUp);
      // 只有「作者名与链接都在」才算可核对；缺一个就不该被当作来源展示。
      if (!s.author?.trim() || !s.url?.trim()) continue;
      attributable++;
      if (!ZHIHU_HOST.test(s.url)) bad("来源链接不是知乎域名（疑似编造）：" + s.url.slice(0, 60));
    }
  }
}
// 归属率下限：一旦有人又为了省体积把 author/url 裁掉，这条会立刻失败。
const rate = attributable / Math.max(srcTotal, 1);
if (rate < 0.9) {
  bad(
    "可核对来源仅 " + (rate * 100).toFixed(1) + "%（低于 90%）" +
      " —— slim() 是不是又把 author/url 裁掉了？",
  );
} else {
  ok(attributable + "/" + srcTotal + " 条来源带作者与链接（" + (rate * 100).toFixed(1) + "%）");
}
if (emptyAnswers > 0) {
  console.log("  · " + emptyAnswers + " 篇回答一条证据都没取到（走「已标记为缺口」提示，属合法降级）");
}

// 同一个数字只能有一个口径：右栏统计 == 回答页真正列得出的条数。
let shownByStats = 0;
let shownBySources = 0;
for (const e of entries) {
  shownByStats += statsOf(e).sourceCount;
  for (const a of e.answers ?? []) shownBySources += splitSources(a.sources).displayable.length;
}
if (shownByStats !== shownBySources) {
  bad("右栏统计 " + shownByStats + " 条 != 回答页可展示 " + shownBySources + " 条（口径漂移）");
} else {
  ok("右栏统计与回答页展示同为 " + shownByStats + " 条");
}

/**
 * 生产端 → 消费端的闭环：把库条目真的还原一遍，看来源有没有**读得出来**。
 *
 * 为什么单独考这一条：字段改名（比如 `sources` → `evidenceSources`）时，
 * 库文件照样合法、JSON 层面什么错都没有，但 `hydrateLibraryEntry` 会静默读到
 * undefined —— 表现就是广场点进去来源区空白。这正是本文件开头警告的
 * 「字段在库里、读不出来」的静默缺失，只有真跑一遍还原才拦得住。
 */
let hydratedMismatch = 0;
let hydratedEvidence = 0;
for (const e of entries) {
  const q = hydrateLibraryEntry(e);
  for (const a of q.answers) {
    const fromJson = e.answers.find((x) => x.id === a.id)?.sources ?? [];
    const wantN = splitSources(fromJson).displayable.length;
    const gotN = splitSources(a.evidence).displayable.length;
    hydratedEvidence += gotN;
    if (wantN !== gotN) {
      hydratedMismatch++;
      bad("还原后来源数不一致 @" + e.id.slice(0, 12) + " / " + a.skillName + "：" + wantN + " → " + gotN);
    }
  }
  // 分身侧的来源也要接到（镜像页的「证据时间轴」读的是 skill.sources）
  const skillSources = q.skills.reduce((n, s) => n + s.sources.length, 0);
  if (skillSources === 0 && e.answers.some((a) => (a.sources ?? []).length > 0)) {
    bad("还原后 skill.sources 全空 @" + e.id.slice(0, 12) + " —— 镜像页证据时间轴会显示「没有可核对的来源」");
  }
}
if (hydratedMismatch === 0) {
  ok("库 → hydrate 往返一致，共还原出 " + hydratedEvidence + " 条可核对来源（含分身侧来源）");
}

console.log("\n" + "=".repeat(74));
console.log(fail === 0 ? "全部通过（0 处问题）" : "发现 " + fail + " 处问题");
console.log("=".repeat(74));
process.exit(fail === 0 ? 0 : 1);
