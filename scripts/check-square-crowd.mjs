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
const { splitSources, confidenceOf: confidenceOfOf } = await import("../lib/domain/evidence.ts");

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
console.log("⑨ skill.sources / confidence 不得回落到人格语料（issue #70 的护栏）");
console.log("=".repeat(74));
/**
 * 为什么单独立一节：
 *
 * `skill.sources` 的约定是「**本次回答检索到的证据**」，但 `hydrateLibraryEntry`
 * 曾经写成「回答侧有来源才覆盖，没有就整个用 `skillFromPersona` 的产物」——
 * 而那个产物里带的是 `persona.corpus.sources`（**蒸馏该人格用的语料**）。
 * 于是某位答主一篇来源都没检索到时：
 *
 *   ① `skill.sources` = 人格语料（`mesh.ts` 会把它当本次证据算连线与真人候选）
 *   ② `confidence`    = 人格蒸馏质量（公式 `0.4 + sampleSize * 0.015`）
 *      → 回答页出现「证据覆盖 85%」而同一页来源区写着「没有可核对的来源」
 *
 * 实测全库 1/22 场命中（`mirror-826745` 的 `persona:splitter`：回答侧 0 条 / 技能侧 5 条）。
 *
 * 断言分两层：
 *   A. **合成用例**（与库数据无关，永远会跑）——钉住契约本身；
 *   B. **真实库数据**（有则核对、无则说明）——确认线上数据也满足该契约。
 * 只做 B 是不行的：哪天库文件里恰好没有零来源的答主，B 就变成了空断言。
 */

// 本脚本原本只有 ok/bad，这里补两个断言助手（与 eq/truthy 等价）
const eqNum = (actual, expected, label) => {
  if (actual === expected) ok(label);
  else bad(label + "：期望 " + expected + "，实得 " + actual);
};
const isTrue = (cond, label) => {
  if (cond) ok(label);
  else bad(label + "（应为真）");
};

// ---------- A. 合成用例：零来源不得回落到人格语料 ----------
{
  const { PERSONAS } = await import("../lib/domain/personas/index.ts");
  const sample = PERSONAS.find((x) => x.corpus?.real && (x.corpus.sources?.length ?? 0) > 0);
  if (!sample) {
    bad("找不到「语料非空」的真实答主做合成用例，本节守卫失效");
  } else {
    const hid = sample.handle;
    const fakeEntry = {
      id: "unit-zero-source",
      title: "单元用例：该答主一篇来源都没检索到",
      createdAt: 0,
      routing: { intent: "测试", summary: "测试" },
      skills: [{ id: `persona:${hid}`, name: sample.displayName, kind: "persona", persona: { handle: hid, displayName: sample.displayName } }],
      answers: [{ id: "a-zero", skillId: `persona:${hid}`, skillName: sample.displayName, body: "正文。", sources: [] }],
      gaps: [],
    };
    const q = hydrateLibraryEntry(fakeEntry);
    const sk = q.skills[0];
    // 这个用例本身要成立：该人格的语料确实非空（否则回落到空数组，测不出东西）
    if ((sample.corpus.sources?.length ?? 0) === 0) {
      bad("合成用例失效：该答主语料为空，回落与正确实现不可区分");
    } else {
      eqNum(sk.sources.length, 0, `零来源的答主 skill.sources 为空（人格语料 ${sample.corpus.sources.length} 条不得顶替）`);
      eqNum(sk.confidence, 0, "零来源的答主 confidence 为 0（不得回落到人格蒸馏质量）");

      // 反向对照：有来源时必须用**回答侧**的，而不是人格语料
      const fake2 = { ...fakeEntry, answers: [{ id: "a1", skillId: `persona:${hid}`, skillName: sample.displayName, body: "正文。", sources: [
        { title: "本次检索到的来源", author: "某作者", url: "https://www.zhihu.com/question/1/answer/1", voteUp: 1, editTime: 0 },
      ] }] };
      const sk2 = hydrateLibraryEntry(fake2).skills[0];
      eqNum(sk2.sources.length, 1, "有来源时 skill.sources 用回答侧的 1 条（不是人格语料）");
      isTrue(sk2.sources[0].title === "本次检索到的来源", "取到的确实是回答侧那条（标题可核对）");
      eqNum(sk2.confidence, confidenceOfOf(sk2.sources), "confidence 由本次来源算出");
    }
  }
}

// ---------- B. 真实库数据：有零来源答主则逐位核对 ----------
{
  let checked = 0;
  let offenders = 0;
  for (const e of entries) {
    const q = hydrateLibraryEntry(e);
    for (const sk of q.skills) {
      const answerSide = (e.answers ?? [])
        .filter((a) => a.skillId === sk.id)
        .reduce((n, a) => n + (a.sources ?? []).length, 0);
      if (answerSide !== 0) continue;
      checked++;
      if (sk.sources.length !== 0 || sk.confidence !== 0) {
        offenders++;
        bad(
          `answer 侧 0 条来源，但 skill.sources=${sk.sources.length} / confidence=${sk.confidence}` +
            ` @ ${e.id.slice(0, 12)} / ${sk.name}（疑似回落到人格语料）`,
        );
      }
    }
  }
  if (offenders === 0) {
    ok(`真实库数据：${checked} 个「零来源」分身，sources 与 confidence 都为 0` +
      (checked === 0 ? "（当前库里没有这种样本，契约由上面的合成用例保证）" : ""));
  }
}

console.log("\n" + "=".repeat(74));
console.log("⑩ 真人补充这一环必须真的有入口（`/fill` 不得成为孤岛）");
console.log("=".repeat(74));
/**
 * 为什么值得一条守卫：
 *
 * `/fill`（「补上 AI 答不了的那一段」）是产品闭环的第 ⑨ 步，实现完整、提交链路可用，
 * 但 2026-09-16 实测发现它**一个入口都没有**：`/mirror` 上 11 个站内链接里没有一条
 * 指向 `/fill`，缺口卡片在「没有匹配到真人」时只给一句
 * 「还没有匹配到合适的真人 —— 这个缺口需要更多人参与才能补上」，**零可交互元素**。
 *
 * 也就是说：产品对着用户说「需要更多人参与」，却不给任何参与的地方 ——
 * 而那一页就在仓库里、能跑、能提交（实测 17/17 通过）。
 *
 * 这类退化**不报错、不白屏**，页面看起来完全正常，只是闭环断了一环，
 * 靠人眼评审很难发现。所以用断言钉住两件事：
 *   ① `GapCard` 在无候选人时必须能渲染出口（有 `fillHref` 支持）；
 *   ② `/mirror` 必须真的把 `fillHref` 传下去，且值指向 `/fill`。
 */
{
  const gapCardSrc = readFileSync(join(here, "..", "components", "mirror", "GapCard.tsx"), "utf8");
  const mirrorSrc = readFileSync(join(here, "..", "app", "(flow)", "mirror", "page.tsx"), "utf8");
  const fillSrc = readFileSync(join(here, "..", "app", "(flow)", "fill", "page.tsx"), "utf8");

  // ① /fill 页面本身必须存在且是可提交的（不是空壳）
  if (!/提交补充/.test(fillSrc)) {
    bad("/fill 页面里找不到「提交补充」—— 补充链路可能被改坏");
  } else {
    ok("/fill 仍是可提交的补充页（「提交补充」在）");
  }

  // ② GapCard 必须支持外部传入出口
  const hasProp = /fillHref\??:\s*string/.test(gapCardSrc);
  if (!hasProp) {
    bad("GapCard 没有 fillHref 属性 —— 无候选人时又会变成只说明、不给出口");
  } else {
    ok("GapCard 支持 fillHref（无候选人时可给出出口）");
  }

  // ③ GapCard 的无候选人分支里必须真的把 link 渲染出来（而不是只声明属性）
  const emptyBranch = gapCardSrc.slice(
    gapCardSrc.indexOf("gap.candidates.length === 0"),
    gapCardSrc.indexOf("gap.candidates.length === 0") + 900,
  );
  if (!/href=\{fillHref\}/.test(emptyBranch)) {
    bad("GapCard 的无候选人分支没有渲染 fillHref 链接 —— 出口声明了却没用上");
  } else {
    ok("无候选人分支真的渲染了补充入口");
  }

  // ④ /mirror 必须把入口接上去，且指向 /fill
  if (!/fillHref=/.test(mirrorSrc)) {
    bad("/mirror 没有给 GapCard 传 fillHref —— /fill 又成了孤岛（本轮修复的正是这条）");
  } else if (!/["']\/fill\?answerId=/.test(mirrorSrc)) {
    bad("/mirror 传了 fillHref 但值不指向 /fill?answerId=");
  } else {
    ok("/mirror 把缺口出口接到 /fill?answerId=（并带上待补的那一篇）");
  }

  // ⑤ 反向：入口不能反过来落在已填的缺口上（否则重复引导）
  if (/fillHref=\{[^}]*filledBy/.test(mirrorSrc)) {
    bad("/mirror 的 fillHref 依赖 filledBy —— 已填缺口不该再引导补充");
  } else {
    ok("fillHref 不依赖 filledBy（由 GapCard 内部按 filledBy 决定是否显示）");
  }

  /**
   * ⑥ 本场关系图已下线 —— 不许有「指过去却什么都没有」的残留。
   *
   * 2026-09-17 owner 判「这场生成出来的关系，功能一直没太做好，可以先删」。
   * 删一块 UI 最危险的不是删不干净，而是**删了图却留着承诺**：
   *   1. `/mirror#mesh` 的锚点没了，但 `/fill` 还留着「查看 Mesh 变化」按钮 → 点了落到页顶；
   *   2. 「 Human Mesh 长出新的边」这句文案还在 → 承诺了一个不存在的变化（铁律 4）。
   *
   * 为什么不能改成指向 `/me?tab=mesh` 了事：`/me` 那张走 `buildCorpusMesh(history)`，
   * 只看关键词共现，**完全不读** `contributions` / `answers[].status === "human"` /
   * `gap.filledBy` —— 实测补一条真人后它的「节点 / 关系」数字一个都没动。
   * 也就是：**删图之后没有任何一张图会因这次补充而变化**，所以只能撤承诺，不能换链接。
   */
  const meshSrc = readFileSync(join(here, "..", "lib", "domain", "mesh.ts"), "utf8");
  const statesSrc = readFileSync(join(here, "..", "components", "kanshan", "states.ts"), "utf8");

  const stillExports = /export function buildMesh\b/.test(meshSrc);
  const anchorLeft = /id="mesh"/.test(mirrorSrc);
  const meshGraphLeft = /MeshGraph/.test(mirrorSrc);
  const deadLink = /href="\/mirror#mesh"/.test(fillSrc);
  const misdirect = /href="\/me\?tab=mesh"/.test(fillSrc);
  const promiseLeft = /长出新的边/.test(fillSrc) || /长出新的边/.test(statesSrc) || /长出新的边/.test(mirrorSrc);

  if (stillExports) bad("lib/domain/mesh.ts 仍在导出 buildMesh —— 本场关系图已裁定下线");
  else ok("lib/domain/mesh.ts 只留 buildCorpusMesh（本场关系图已下线）");

  if (anchorLeft) bad('/mirror 仍留着 id="mesh" 锚点 —— 指向它的深链会落到一个不存在的区块');
  else ok('/mirror 已无 id="mesh" 锚点');

  if (meshGraphLeft) bad("/mirror 仍在渲染 MeshGraph —— 本场关系图应已移除");
  else ok("/mirror 不再渲染本场关系图");

  if (deadLink) bad("/fill 仍有 href=\"/mirror#mesh\" —— 那个锚点已不存在，点了落到页顶");
  else if (misdirect) bad("/fill 又把链接改回 /me?tab=mesh —— 那张图不含真人补充，点了看不到任何变化");
  else ok("/fill 不再把用户送去任何一张「关系图」");

  if (promiseLeft) bad("仍写着「长出新的边」—— 删图之后没有任何一张图会因补充而变化，这句承诺是假的");
  else ok("「长出新的边」的承诺已随本场关系图一起撤掉");
}

console.log("\n" + "=".repeat(74));
console.log("⑪ 部署后旧 chunk 404：必须自愈 + 说人话（不是「重试一下」）");
console.log("=".repeat(74));
/**
 * 为什么需要这一节：
 *
 * 本项目每次部署都会替换 `.next/static/chunks/*`，而线上实测
 * HTML 带 `s-maxage=31536000`、chunk 带 `immutable` —— 于是**部署前打开、
 * 部署后仍开着的标签页**手里握着一份过期清单，下一次客户端跳转必然取到已被删除的文件。
 *
 * 注意：#81（`fix/atomic-deploy`）已经把服务端改成「构建到独立目录再原子切换」，
 * 消除了**切换瞬间**的窗口；但那**消除不了已经发出去的旧 HTML** ——
 * 原子切换之后旧 chunk 依然被删，已打开的标签页依然会 404。两者互补，不重复。
 *
 * 实测（2026-09-16，从磁盘删掉一个页面级 chunk）：
 *   · 抛 `Uncaught ChunkLoadError: Loading chunk 36 failed`
 *   · **`app/error.tsx` 会捕获它**（不是 `global-error.tsx`，这点当初判断错了）
 *   · 而它当时的文案是「这一步出了点问题……可以重试」—— `reset()` **不会**
 *     重新下载那个已消失的 chunk，用户点几次都一样
 *
 * 这类退化的特征：**不白屏、不报错、界面看起来很正常**，只是把
 * 「资产过期」讲成了「出了点问题」。只能靠断言钉住。
 */
{
  const chunkSrc = readFileSync(join(here, "..", "lib", "domain", "chunk-reload.ts"), "utf8");
  const errSrc = readFileSync(join(here, "..", "app", "error.tsx"), "utf8");
  const globalErrSrc = readFileSync(join(here, "..", "app", "global-error.tsx"), "utf8");
  const hookSrc = readFileSync(join(here, "..", "lib", "hooks", "useSquareLibrary.ts"), "utf8");

  // ① 判定函数覆盖已知的错误形态
  const forms = [/ChunkLoadError/, /Loading chunk/, /dynamically imported module/];
  const missing = forms.filter((re) => !re.test(chunkSrc));
  if (missing.length) bad("chunk-reload.ts 的判据缺 " + missing.length + " 种已知形态");
  else ok("资产过期判据覆盖 ChunkLoadError / Loading chunk N failed / 动态 import 失败");

  // ② 必须真的调用 reload（只判断不重载 = 没修）
  if (!/window\.location\.reload\(\)/.test(errSrc)) {
    bad("app/error.tsx 检测到资产过期却没有 reload() —— 用户还是只能干瞪眼");
  } else ok("捕获资产过期后确实触发 reload()");

  // ③ 必须有防死循环
  if (!/markAutoReload/.test(errSrc)) {
    bad("app/error.tsx 没有用 markAutoReload —— 缺少防死循环保护");
  } else if (!/RELOAD_GUARD_MS/.test(chunkSrc)) {
    bad("chunk-reload.ts 没有重载间隔常量");
  } else ok("自动重载有防死循环（markAutoReload + 时间窗）");

  // ④ 文案必须说人话
  if (!/加载时更新过|更新过了/.test(errSrc)) {
    bad("app/error.tsx 的文案没告诉用户「页面在加载时更新过了」——仍在讲「出了点问题」");
  } else ok("文案讲清了成因（页面在加载时更新过了）");
  if (!/数据没有丢/.test(errSrc)) {
    bad("app/error.tsx 没有安抚数据安全 —— 用户会担心提问记录丢了");
  } else ok("文案说明「你的数据没有丢」");

  // ⑤ 两条路径分开：资产过期 ≠ 其他错误
  if (!/isChunkLoadError\(error\)/.test(errSrc)) {
    bad("app/error.tsx 没有区分「资产过期」与「其他错误」");
  } else ok("区分了资产过期与一般错误（一般错误仍走 retry）");
  if (!/onClick=\{reset\}/.test(errSrc)) {
    bad("app/error.tsx 丢掉了原有的 retry 路径 —— 一般错误失去了恢复手段");
  } else ok("一般错误仍保留 reset() 重试路径");

  // ⑥ global-error 作为最后防线
  if (!/isChunkLoadError/.test(globalErrSrc)) {
    bad("app/global-error.tsx 没接同一套判据 —— 最后防线形同虚设");
  } else ok("global-error.tsx 复用同一套判据（兜 error.tsx 自身加载失败的情况）");
  if (/from "next\/link"/.test(globalErrSrc)) {
    bad("global-error.tsx 用了 next/link —— 该层要在「客户端路由已坏」的假设下工作");
  } else ok("global-error.tsx 用原生 <a>（不依赖已损坏的客户端路由）");

  // ⑦ 广场侧第二道防线：加载超时
  //
  // 判据设计说明（我在这里踩过坑，写下来免得下次又写成恒真）：
  //   ① 只搜常量名 → 改名成 `LOAD_TIMEOUT_MS_REMOVED` 仍匹配（包含原串）✗
  //   ② 改成「常量 + setTimeout + 回调切 error」三条文本断言 → 删 setTimeout 能抓到，
  //      但「只改声明处」仍会漏（使用处还留着那个字面量）✗
  //   ③ 最终：抓**定时器回调体**这一段的实际内容，要求它既读 loading 又写 error。
  const timerBody = (() => {
    const m = hookSrc.match(/window\.setTimeout\(\s*\(\)\s*=>\s*\{([\s\S]*?)\}\s*,\s*[^)]+\)/);
    return m ? m[1] : "";
  })();
  const hasTimeoutConst = /const\s+\w*TIMEOUT\w*\s*=\s*[\d_]+\s*;/.test(hookSrc);
  if (!hasTimeoutConst) {
    bad("useSquareLibrary 没有超时常量 —— chunk 失效时广场会永远停在「正在铺开广场…」");
  } else if (!timerBody) {
    bad("useSquareLibrary 没有可识别的 window.setTimeout 定时器 —— 超时是摆设");
  } else if (!/loading/.test(timerBody)) {
    bad("超时回调没有检查 loading 状态 —— 会把已成功的结果误判成超时");
  } else if (!/["']error["']/.test(timerBody)) {
    bad("超时回调没有把状态切成 error —— 转圈不会停");
  } else {
    ok("广场库加载有超时兜底（定时器回调确实把 loading 切成 error）");
  }
}

console.log("\n" + "=".repeat(74));
console.log(fail === 0 ? "全部通过（0 处问题）" : "发现 " + fail + " 处问题");
console.log("=".repeat(74));
process.exit(fail === 0 ? 0 : 1);
