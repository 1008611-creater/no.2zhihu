/**
 * 镜像数据形状 + 回答详情路由的回归自检（standalone，无需测试框架）。
 *
 * 跑法：node scripts/check-mirror-shape.mjs
 *
 * 它盯的是 2026-09-15 线上事故的两条根因 —— 这两条**出错时用户只看得到一个
 * 白屏或一句「找不到」**，代码本身却完全「类型正确」：
 *
 *   ① 「开始一轮互相回应」产出的回答缺 `evidence`。它被按 `AnswerDraft`
 *      追加进 `mirror.answers` 并落盘，下游 `for (const e of a.evidence)`
 *      抛 `TypeError: a.evidence is not iterable` → /mirror 整页白屏。
 *   ② 回答 id 带冒号（`ans-persona:<handle>`）。放进路径段后
 *      `useParams()` 给的是编码形态，直接 `===` 比对恒不成立 →
 *      「查看详情与追问」100% 落到「找不到这篇回答」。
 *
 * 断言口径：**修完之后，出错的那些调用必须能被直接跑一遍**，而不是
 * 只检查「字段存在」。所以下面第 ③ 节真的调用了当初抛错的那两个函数。
 */

import { register } from "node:module";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

// 被测模块必须动态 import —— 见 scripts/_ts-hook.mjs 的注释。
register(new URL("./_ts-hook.mjs", import.meta.url));

const here = dirname(fileURLToPath(import.meta.url));
const { routeIdCandidates, matchRouteId } = await import("../lib/domain/route-id.ts");
const { normalizeAnswer, normalizeMirror } = await import("../lib/domain/mirror-normalize.ts");
const { collectSources } = await import("../lib/domain/handoff.ts");

let fail = 0;
const bad = (msg) => {
  fail++;
  console.log("  ✗ " + msg);
};
const ok = (msg) => console.log("  ✓ " + msg);
const eq = (actual, expected, label) => {
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expected);
  if (a === b) ok(label + " → " + a);
  else bad(label + "：期望 " + b + "，实得 " + a);
};
const truthy = (v, label) => (v ? ok(label) : bad(label + "（应为真）"));

/* ========================================================================== */
console.log("=".repeat(74));
console.log("① 回答 id 的路由还原（冒号 / %3A / %253A / 非法序列）");
console.log("=".repeat(74));

const ANSWER_ID = "ans-persona:ban-fo-xian-ren";
const answers = [{ id: ANSWER_ID }, { id: "ans-persona:da-meng" }];

eq(routeIdCandidates(ANSWER_ID), [ANSWER_ID], "原样 raw 冒号：候选就是它自己");
truthy(
  routeIdCandidates(ANSWER_ID).includes(ANSWER_ID),
  "raw 形态命中",
);

const enc1 = encodeURIComponent(ANSWER_ID); // ans-persona%3Aban-fo-xian-ren
const enc2 = encodeURIComponent(enc1); // 双重编码
truthy(enc1.includes("%3A"), "encodeURIComponent 确实把冒号变成 %3A");
truthy(routeIdCandidates(enc1).includes(ANSWER_ID), "单次编码 %3A 能还原回原始 id");
truthy(routeIdCandidates(enc2).includes(ANSWER_ID), "双重编码 %253A 也能还原");

truthy(matchRouteId(answers, ANSWER_ID, (a) => a.id)?.id === ANSWER_ID, "raw 参数命中正确那一条");
truthy(matchRouteId(answers, enc1, (a) => a.id)?.id === ANSWER_ID, "%3A 参数命中正确那一条");
truthy(matchRouteId(answers, enc2, (a) => a.id)?.id === ANSWER_ID, "%253A 参数命中正确那一条");
eq(matchRouteId(answers, "ans-persona:bu-cun-zai", (a) => a.id), null, "不存在的 id 返回 null（不误命中）");
eq(matchRouteId(answers, "ans-persona:da-meng", (a) => a.id)?.id, "ans-persona:da-meng", "命中另一条时不串号");
truthy(routeIdCandidates("%E0%A4%A").length >= 1, "非法百分号序列不抛错，至少保留原样候选");

/* ========================================================================== */
console.log("=".repeat(74));
console.log("② 残缺回答的形状补齐（只补结构、不编内容）");
console.log("=".repeat(74));

// 事故当时的真实形状：只有这些字段，没有 evidence / status / round
const brokenReply = {
  id: "reply-ans-persona:ban-fo-xian-ren-44846",
  skillId: "persona:ban-fo-xian-ren",
  skillName: "半佛仙人",
  accent: "orange",
  handle: "ban-fo-xian-ren",
  body: "你把账算得挺细，但你算的是概率，我说的是人。",
  replyTo: "ans-persona:splitter",
  replyToName: "贱贱",
  createdAt: 1757900000000,
  generatedBy: "zhida",
};

const fixed = normalizeAnswer(brokenReply);
truthy(fixed !== null, "残缺回答被修好（不是被丢掉）");
if (!fixed) {
  bad("后续断言依赖 fixed，提前结束");
  process.exit(1);
}
eq(fixed.evidence, [], "evidence 补成空数组 —— 这正是当初抛错的那个字段");
eq(fixed.status, "ai", "status 补成 AI 生成");
eq(fixed.round, 0, "round 缺失按首轮作答算（原记录里没有 round）");
eq(fixed.body, brokenReply.body, "正文原样保留，未被改写");
eq(fixed.skillName, "半佛仙人", "答主名原样保留");
eq(normalizeAnswer({ ...brokenReply, round: 1 }).round, 1, "已带 round=1 的回应保持 1，不被覆盖");

eq(normalizeAnswer({ id: "", body: "x" }), null, "id 为空串 → 丢弃");
eq(normalizeAnswer({ id: "a2" }), null, "没有正文 → 丢弃（不补成别的样子）");
eq(normalizeAnswer({ id: "a3", body: "" })?.body, "", "空正文但字段合法 → 保留（内容不做判断）");

const already = {
  id: "a9",
  skillId: "s9",
  skillName: "测试",
  accent: "blue",
  body: "正文",
  evidence: [{ title: "T", author: "A", url: "https://example.com", voteUp: 1, excerpt: "e", editTime: 0, confidence: 1 }],
  status: "human",
  round: 0,
  createdAt: 1,
  generatedBy: "retrieval",
};
const once = normalizeAnswer(already);
eq(once, already, "合法回答过一遍是恒等变换（幂等，不动正常数据）");
eq(normalizeAnswer(once), once, "再跑一遍仍然恒等（真幂等）");

/* ========================================================================== */
console.log("=".repeat(74));
console.log("③ 当初抛错的那两个调用，现在必须能跑完");
console.log("=".repeat(74));

const mirror = {
  id: "m1",
  title: "审计样本",
  origin: "typed",
  createdAt: 1,
  routing: { mode: "auto", intent: "判断型", picks: [], summary: "样本", queries: [] },
  skills: [],
  // 关键：一条首轮回答 + 一条**残缺的**互相回应（就是事故当时的落盘数据）
  answers: [
    {
      ...already,
      id: "ans-persona:ban-fo-xian-ren",
      skillId: "persona:ban-fo-xian-ren",
      skillName: "半佛仙人",
      evidence: [
        { title: "T1", author: "A", url: "https://www.zhihu.com/answer/1", voteUp: 10, excerpt: "e", editTime: 0, confidence: 1 },
      ],
    },
    brokenReply,
  ],
  gaps: [],
  handoff: { status: "not-ready", note: "" },
  contributions: [],
};

// 先确认「不经修复确实会崩」—— 否则下面的修复断言是空的
let rawCrashed = null;
try {
  collectSources(mirror);
} catch (e) {
  rawCrashed = e;
}
truthy(rawCrashed !== null, "对照：未修复的残缺回答确实会抛错（证明修复断言有效）");
truthy(
  rawCrashed && /evidence is not iterable/i.test(rawCrashed.message),
  "对照：抛的正是线上那条 TypeError: evidence is not iterable",
);

const clean = normalizeMirror(mirror);
let crashed = null;
try {
  collectSources(clean);
} catch (e) {
  crashed = e;
}
truthy(crashed === null, "修复后：collectSources(含残缺回答) 不再抛错" + (crashed ? "：实得 " + crashed.message : ""));
truthy(Array.isArray(clean.answers?.[1]?.evidence), "normalizeMirror 后第二条回答的 evidence 是数组");
eq(collectSources(clean).length, 1, "补齐后来源清单仍只统计真实来源（1 条），不含空证据");
eq(clean.answers.length, 2, "两条回答都还在（不因修复而丢数据）");

const withTopLevelGarbage = normalizeMirror({ ...mirror, skills: null, gaps: undefined, contributions: "nope" });
eq(withTopLevelGarbage.skills, [], "skills 为 null → 空数组");
eq(withTopLevelGarbage.gaps, [], "gaps 缺失 → 空数组");
eq(withTopLevelGarbage.contributions, [], "contributions 为字符串 → 空数组");

/* ========================================================================== */
console.log("=".repeat(74));
console.log("④ 服务端产出的回应必须自带 evidence（源码级守卫）");
console.log("=".repeat(74));

/*
 * 这一节是**文本级**守卫，不是偷懒：`lib/server/mirror.ts` 首行是
 * `import "server-only"`，在纯 Node 下无法 import（那个包的设计就是如此），
 * 所以 `parseReplies` 没法被直接调用验证。而它正是本事故的源头 ——
 * 少一个 `evidence: []`，整页白屏。用一条源码断言把这个坑钉住：
 * 只要以后有人把这两个字段删掉，自检立刻红。
 */
const serverSrc = readFileSync(join(here, "..", "lib", "server", "mirror.ts"), "utf8");
const replyBlock = serverSrc.slice(serverSrc.indexOf("function parseReplies"), serverSrc.indexOf("function accentOfHandle"));
if (!replyBlock) bad("找不到 parseReplies 的实现，守卫失效（函数被改名/搬走了？）");
else {
  if (!/evidence:\s*\[\]/.test(replyBlock)) {
    bad("回应构造里没有 evidence: [] —— 下游 for..of 会再次抛 TypeError 并白屏");
  } else ok("回应构造带 evidence: []");
  if (!/round:\s*1/.test(replyBlock)) bad("回应构造里没有 round: 1 —— 它会被误判成首轮作答");
  else ok("回应构造带 round: 1（会渲染进「互相回应」区）");
  if (!/status:\s*"ai"/.test(replyBlock)) bad("回应构造里没有 status —— 卡片状态标签会显示为空");
  else ok("回应构造带 status: \"ai\"");
}

/* ========================================================================== */
/**
 * ⑤ 来源计数口径必须只有一套（2026-09-15 #53 之后补的守卫）。
 *
 * 当时把「只数可核对来源」统一到了 splitSources()，但漏了镜像页顶栏那一处：
 * 它仍是 `skills.reduce(s => s.sources.length)`，把署名/链接缺失的条目也数进去
 * （全库 195 条里有 5 条如此）。结果就是同一场讨论，顶栏写 9 条、回答页只列得出 8 条。
 * 这类不一致**不报错、不崩**，只会让人怀疑数字是编的 —— 只能靠源码断言钉住。
 */
const mirrorPageSrc = readFileSync(join(here, "..", "app", "(flow)", "mirror", "page.tsx"), "utf8");
if (!mirrorPageSrc.includes("条真实知乎来源")) {
  bad("镜像页找不到「条真实知乎来源」这处统计，守卫失效（文案被改了？）");
} else {
  // 统计值必须来自 splitSources().displayable.length —— 这是「只数可核对来源」的唯一入口。
  if (!/splitSources\([^)]*\)\.displayable\.length/.test(mirrorPageSrc)) {
    bad("镜像页顶栏的来源统计没走 splitSources().displayable.length —— 会与回答页列出的条数不一致");
  } else ok("镜像页顶栏的来源统计走 splitSources（与回答页同口径）");
  if (!/from "@\/lib\/domain\/evidence"/.test(mirrorPageSrc)) {
    bad("镜像页没有从 lib/domain/evidence 引入 splitSources");
  } else ok("镜像页从 lib/domain/evidence 引入 splitSources");
  if (/skills\.reduce\(\(a,\s*s\)\s*=>\s*a\s*\+\s*s\.sources\.length/.test(mirrorPageSrc)) {
    bad("镜像页仍存在未过滤的 skills.reduce(sources.length) 计数");
  } else ok("镜像页已无未过滤的 sources.length 计数");
}

/* ========================================================================== */
/**
 * ⑥ `lib/zhihu/` 每个文件首行必须 `import "server-only"`（AGENTS.md §2 明文规则）。
 *
 * 为什么值得一条守卫：2026-09-16 核查发现 `cache.ts` / `errors.ts` / `types.ts`
 * 三个文件漏了这一行 —— 规则写在文档里、没人机械检查，就会一点点烂掉。
 * 这三个文件当时都没有真的泄漏（只被 route handler 与 `import type` 引用），
 * 但 `types.ts` 是被**客户端组件**（`FeedStream.tsx`）以 `import type` 引入的：
 * 类型位置会被编译期擦除，所以加了也安全 —— 已用完整 `next build` 实测确认
 * （客户端 bundle 里既无知乎域名也无密钥）。哪天有人把它改成**值引用**，
 * server-only 会立刻在构建期报错，这正是我们要的护栏。
 */
const ZHIHU_DIR = join(here, "..", "lib", "zhihu");
const zhihuFiles = readdirSync(ZHIHU_DIR).filter((f) => f.endsWith(".ts"));
if (zhihuFiles.length < 5) {
  bad("lib/zhihu 下只找到 " + zhihuFiles.length + " 个 ts 文件，守卫失效（目录被改？）");
} else {
  const missing = zhihuFiles.filter((f) => {
    const first = readFileSync(join(ZHIHU_DIR, f), "utf8").split("\n")[0].trim();
    return !/^import\s+["']server-only["'];?$/.test(first);
  });
  if (missing.length) {
    bad("lib/zhihu 下这些文件首行缺 server-only：" + missing.join("、"));
  } else {
    ok("lib/zhihu 下 " + zhihuFiles.length + " 个文件首行都有 server-only");
  }
}

/* ========================================================================== */
console.log("=".repeat(74));
if (fail === 0) {
  console.log("全部通过 ✓");
  process.exit(0);
} else {
  console.log(fail + " 项失败 ✗");
  process.exit(1);
}
