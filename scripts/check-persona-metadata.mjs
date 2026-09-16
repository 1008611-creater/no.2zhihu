/**
 * 答主档案页 / 名册页的 metadata 守卫。
 *
 * ## 为什么需要它
 *
 * `app/(explore)/personas/[handle]/page.tsx` 是 `"use client"`，客户端组件不能导出
 * `generateMetadata` —— 这一页的 metadata 只能由同目录的 `layout.tsx` 补。
 * 2026-09-16 之前那个 layout 写成「命中名册就 `return {}`」，于是**16 位答主档案页
 * 全部只有根布局的默认标题**（分享出去都是同一句话）。这类缺口**不报错、不白屏**，
 * 只在有人真去分享链接时才发现 —— 只能靠断言钉住。
 *
 * ## 断言分四层
 *
 *   A. **真实名册**：16 位的标题必须各自含 `displayName`、互不相同、且都不是根默认标题；
 *      不得被标 `noindex`（那是「异常输入」才该有的待遇）。
 *   B. **反例**：旧 handle / 乱拼的 handle 必须 `noindex` + 固定提示页标题。
 *   C. **诚实性**：没有可用语料的预置人格，描述里**不得出现「蒸馏」**（铁律 2）；
 *      有语料的必须写出真实条数。
 *   D. **源码级**：`layout.tsx` 必须**真的调用**那个函数（断言调用形态，
 *      不是「文件里出现过这个词」—— 那个写法会被自己写的注释骗过）。
 *
 * ⚠️ 判据写在 `lib/domain/persona-meta.ts`（纯函数、不 import next）上，
 * 而不是去抓渲染结果：本脚本要能在**没有 next 运行时**的 `check:logic` 阶段跑起来。
 * 真机渲染的核对在 PR 里单独做过（`curl` 线上 16 个 URL 逐个看 `<title>`）。
 */

import { register } from "node:module";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

// 被测模块必须动态 import —— 见 scripts/_ts-hook.mjs 的注释。
register(new URL("./_ts-hook.mjs", import.meta.url));

const here = dirname(fileURLToPath(import.meta.url));
let fail = 0;
const bad = (msg) => {
  fail++;
  console.log("  ✗ " + msg);
};
const ok = (msg) => console.log("  ✓ " + msg);

const { personaPageMeta, UNKNOWN_PERSONA_TITLE } = await import("../lib/domain/persona-meta.ts");
const { PERSONAS } = await import("../lib/domain/personas/index.ts");

/* ========================================================================== */
console.log("=".repeat(74));
console.log("A. 真实名册：16 位档案页必须有各自的标题");
console.log("=".repeat(74));

// 根布局的默认标题 —— 从源码里取，并**要求取到**（取不到就直接判失败，
// 免得「根默认标题」这个判据悄悄失效成空断言）。
const rootLayout = readFileSync(join(here, "..", "app", "layout.tsx"), "utf8");
const rootTitleMatch = rootLayout.match(/title:\s*['"]([^'"]+)['"]/);
const ROOT_TITLE = rootTitleMatch?.[1];
if (!ROOT_TITLE) {
  bad("没能从 app/layout.tsx 取到根默认标题 —— 本节「不得等于根默认标题」的判据失效");
} else {
  ok(`根默认标题 = 「${ROOT_TITLE}」`);
}

const seen = new Map();
let noindexOnReal = 0;
for (const p of PERSONAS) {
  const meta = personaPageMeta(p.handle);

  if (meta.noindex) {
    noindexOnReal++;
    bad(`${p.displayName}（${p.handle}）被标成 noindex —— 真实档案页不该被排除收录`);
  }
  if (!meta.title.includes(p.displayName)) {
    bad(`${p.handle} 的标题不含 displayName：「${meta.title}」`);
  }
  if (ROOT_TITLE && meta.title === ROOT_TITLE) {
    bad(`${p.handle} 的标题仍是根默认标题 —— layout 又退回「不干预」了`);
  }
  if (!meta.description || meta.description.length < 12) {
    bad(`${p.handle} 的描述为空或过短：「${meta.description}」`);
  }
  if (meta.path !== `/personas/${p.handle}`) {
    bad(`${p.handle} 的 canonical 路径不对：${meta.path}`);
  }
  if (seen.has(meta.title)) {
    bad(`标题重复：${p.handle} 与 ${seen.get(meta.title)} 都是「${meta.title}」`);
  }
  seen.set(meta.title, p.handle);
}
if (noindexOnReal === 0 && seen.size === PERSONAS.length) {
  ok(`16 位（实际 ${PERSONAS.length} 位）各有专属标题，且互不重复`);
}

/* ========================================================================== */
console.log("\n" + "=".repeat(74));
console.log("B. 反例：不在名册里的 handle 必须 noindex");
console.log("=".repeat(74));

// 两个改名前的旧 handle（2026-09-15 实测它们会命中同一个 200 页面）+ 两个乱拼的。
const BOGUS = ["ban-fo-xian-ren", "ma-qian-zu", "zzz-nonexistent", "cai-tong-x"];
let bogusOk = 0;
for (const h of BOGUS) {
  const meta = personaPageMeta(h);
  if (PERSONAS.some((p) => p.handle === h)) {
    bad(`反例 ${h} 其实在名册里 —— 这条断言失效，请换一个例子`);
    continue;
  }
  if (!meta.noindex) bad(`未知 handle ${h} 没有 noindex —— 空页会被搜索引擎收录`);
  else if (meta.title !== UNKNOWN_PERSONA_TITLE) bad(`${h} 的提示页标题不对：${meta.title}`);
  else if (meta.path) bad(`${h} 不该有 canonical 路径（会暗示它是正主）：${meta.path}`);
  else bogusOk++;
}
if (bogusOk === BOGUS.length) ok(`${BOGUS.length} 个反例全部 noindex 且无 canonical`);

/* ========================================================================== */
console.log("\n" + "=".repeat(74));
console.log("C. 诚实性：描述里不得把没有语料的人格说成「蒸馏」");
console.log("=".repeat(74));

let realChecked = 0;
let presetChecked = 0;
for (const p of PERSONAS) {
  const meta = personaPageMeta(p.handle);
  if (p.corpus?.real) {
    realChecked++;
    const n = p.corpus.sampleSize ?? 0;
    if (n > 0 && !meta.description.includes(String(n))) {
      bad(`${p.displayName} 的描述里没有真实样本条数（${n}）：「${meta.description}」`);
    }
  } else {
    presetChecked++;
    /**
     * ⚠️ 不能只搜「蒸馏」二字：预置人格的描述里恰恰有一句
     * 「不声称真实蒸馏」，那是**否定形态**，搜词会把它误判成违规
     * （本节第一次跑就这么误报了一次 —— 断言要打在「主张」上）。
     * 这里匹配的是**主张形态**：依据 / 提取 / 条数。
     */
    const claims = /蒸馏依据|基于公开片段提取|由本人公开回答蒸馏|\d+\s*条有效样本/.test(meta.description);
    if (claims) {
      bad(`${p.displayName} 没有可用公开语料，描述里却主张了蒸馏依据：「${meta.description}」`);
    }
    if (!/公开印象档案/.test(meta.description)) {
      bad(`${p.displayName} 是预置人格，描述里没写明「公开印象档案」：「${meta.description}」`);
    }
  }
}
ok(`已蒸馏 ${realChecked} 位的描述都带真实条数；${presetChecked} 位预置人格的描述不主张蒸馏`);

/* ========================================================================== */
console.log("\n" + "=".repeat(74));
console.log("D. 源码级：layout 必须真的调用，名册页必须真的导出 metadata");
console.log("=".repeat(74));

/**
 * 源码断言前先剥掉注释。
 *
 * 为什么要剥：这一类断言（「不得出现某种写法」）第一次就栽在注释上 ——
 * 我在 layout 的注释里引用了旧写法 `return {}`、在名册页注释里举了「16 位」
 * 这个反例，于是断言把自己写的**说明文字**当成了源码
 * （与 `check-mirror-shape.mjs` §⑦ 的「假断言」是同一个坑）。
 */
const stripComments = (s) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "").replace(/[ \t]+\/\/.*$/gm, "");

const layout = readFileSync(join(here, "..", "app", "(explore)", "personas", "[handle]", "layout.tsx"), "utf8");
const layoutCode = stripComments(layout);
// ⚠️ 断言**调用形态**而不是 includes：注释里也会出现函数名，includes 会恒真。
if (/personaPageMeta\(\s*params\.handle\s*\)/.test(layoutCode)) {
  ok("layout.tsx 调用 personaPageMeta(params.handle)");
} else {
  bad("layout.tsx 没有调用 personaPageMeta(params.handle) —— metadata 不会生效");
}
if (/return\s*\{\s*\}\s*;/.test(layoutCode)) {
  bad("layout.tsx 又出现「命中名册就 return {}」的写法 —— 那样标题会退回根默认");
} else {
  ok("layout.tsx 里没有 `return {}` 的空实现");
}
// noindex必须「条件化」：断言条件形态（meta.noindex ? { robots: … }），
// 而不是「出现过 robots: { index: false」—— 后者判不住被改成无条件 noindex 的退化
// （无条件时正则照样命中，但 16 位真实答主档案页会被误标 noindex，语义已反）。
if (!/meta\.noindex\s*\?\s*\{\s*robots:\s*\{\s*index:\s*false/.test(layoutCode)) {
  bad("layout.tsx 的 noindex 不再受 meta.noindex 条件约束 —— 会把真实答主档案页也标成 noindex");
} else {
  ok("layout.tsx 的 noindex 挂在 meta.noindex 条件下（只作用于未知 handle）");
}
if (/^\s*robots:\s*\{\s*index:\s*false/m.test(layoutCode)) {
  bad("layout.tsx 出现无条件 noindex 声明");
} else {
  ok("layout.tsx 没有无条件 noindex");
}

const listPage = readFileSync(join(here, "..", "app", "(explore)", "personas", "page.tsx"), "utf8");
const listCode = stripComments(listPage);
if (/export\s+const\s+metadata\s*:\s*Metadata\s*=/.test(listCode)) {
  ok("名册页导出了 metadata");
} else {
  bad("名册页没有导出 metadata —— 它也会退回根默认标题");
}
if (!/PERSONAS\.length/.test(listCode)) {
  bad("名册页的描述没有用 PERSONAS.length 现算人数");
} else if (/\d+\s*位/.test(listCode)) {
  bad("名册页把人数写死了（应使用 PERSONAS.length 现算，否则改名册后文案会变成假话）");
} else {
  ok("名册页描述里的「几位」是现算的，不是写死的");
}

/* ========================================================================== */
console.log("\n" + "=".repeat(74));
console.log(fail === 0 ? "全部通过（0 处问题）" : "发现 " + fail + " 处问题");
console.log("=".repeat(74));
process.exit(fail === 0 ? 0 : 1);
