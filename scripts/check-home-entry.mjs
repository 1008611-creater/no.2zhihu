/**
 * 首页入口自检（standalone，无需测试框架）。
 *
 * 跑法：node scripts/check-home-entry.mjs
 *
 * ## 它守的是什么
 *
 * owner 的「最后一轮网站收敛清单」在 P0-1 写了两条硬要求，而代码当时两条都不满足：
 *
 *   ① **输入框不得承诺链接解析** —— 原文：「当前输入框如提示『可粘贴知乎问题链接』，
 *      只有实际具备链接解析并能展示对应标题时才保留该提示；否则本轮把提示改为
 *      『输入一个你真正想问的问题』，不做新解析功能。」
 *      实测：首页 placeholder 写着「…或粘贴知乎问题链接…」、下面还有「支持知乎链接」，
 *      但提问路径**从来没有**解析能力 —— 输入 `zhihu.com/question/19550224` 只会被当成
 *      一串无意义字符去做路由。解析只存在于 `/api/handoff`（拼编辑器深链）与
 *      `/api/zhihu/question-answers`（按 url 取回答）两处，都不在首页这条路上。
 *
 *   ② **未选人时不能开始作答** —— 原文：「点击卡片可选择或取消；未选人时不能开始作答。」
 *      实测：作答按钮的 `disabled` 只挡 `running`，未选人时**可点**，点下去静默降级成
 *      「让看山推荐并作答」（`run([])` → 服务端 handles 可选 → 自动推荐）。
 *      界面上写着「让这些答主作答」，实际却不是用户选的那批人 —— 言行不一。
 *
 * ## 为什么断言「条件形态」而不是「出现过」
 *
 * 2026-09-16 在 #78 上学到的：只断言「出现过 `robots: { index: false`」判不住
 * 「被改成无条件 noindex」的退化 —— 正则照样命中，语义已经反了。
 * 所以这里对 `disabled` 断言的是**它是否受选中数约束**，而不是「有没有 disabled」。
 *
 * ## 为什么必须先剥注释
 *
 * 实现里为了说清「为什么删掉这句话」，注释中会**原样引用**被禁的文案
 * （例如「支持知乎链接」「让看山推荐并作答」）。不剥注释的断言会被自己的说明文字
 * 误判 —— 这是同一个教训的另一面。
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const HOME = join(ROOT, "app", "(flow)", "page.tsx");

let fail = 0;
const bad = (msg) => {
  fail++;
  console.log("  ✗ " + msg);
};
const ok = (msg) => console.log("  ✓ " + msg);

/** 剥掉 // 与 /* *\/ 注释，只留可执行代码 —— 断言必须打在代码上，不是说明文字上。 */
function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}

const raw = readFileSync(HOME, "utf8");
const code = stripComments(raw);

console.log("=".repeat(74));
console.log("A. 输入框不得承诺「粘贴知乎问题链接」（清单：不做解析就不许这么写）");
console.log("=".repeat(74));

const placeholder = /placeholder="([^"]*)"/.exec(code)?.[1] ?? null;
if (placeholder === null) {
  bad("找不到 textarea 的 placeholder —— 结构变了，先看这个文件");
} else if (/链接|url|URL|http/i.test(placeholder)) {
  bad(`placeholder 仍在承诺链接能力：「${placeholder}」—— 提问路径没有解析，说了做不到`);
} else {
  ok(`placeholder 不承诺链接能力：「${placeholder}」`);
}
if (placeholder && placeholder.includes("输入一个你真正想问的问题")) {
  ok("placeholder 用的是清单指定的文案「输入一个你真正想问的问题」");
} else {
  bad("placeholder 不含清单指定的「输入一个你真正想问的问题」");
}

// composebar 那句小字（在 <span className="dim mono"> 里）
const composebar = /className="composebar"[\s\S]*?<span[^>]*>([\s\S]*?)<\/span>/.exec(code)?.[1] ?? "";
if (/支持知乎链接/.test(composebar)) {
  bad("输入框下方仍写着「支持知乎链接」—— 与 placeholder 同一条：说了做不到");
} else {
  ok("输入框下方不再宣称「支持知乎链接」");
}

console.log("");
console.log("=".repeat(74));
console.log("B. 未选人不得开始作答（清单原文）");
console.log("=".repeat(74));

// ① 作答按钮的 disabled 必须**受选中数约束**（断言条件形态，不是「有没有 disabled」）
//    找带 onClick={() => run(selected)} 的那个按钮。
//    ⚠️ 必须一直抓到 `</button>` —— 只抓开标签的话，标签**之间**的文案判不到，
//    负向验证里「加回『让看山推荐并作答』分支」就会漏过（实测踩过）。
const startBtn =
  /<button[^>]*onClick=\{\(\) => run\(selected\)\}[\s\S]*?<\/button>/.exec(code)?.[0] ?? null;
if (!startBtn) {
  bad("找不到「让这些答主作答」按钮（onClick={() => run(selected)}）—— 结构变了");
} else {
  const dis = /disabled=\{([^}]*)\}/.exec(startBtn)?.[1] ?? null;
  if (dis === null) {
    bad("作答按钮没有 disabled —— 未选人时可以直接点");
  } else if (!/selected\.length/.test(dis)) {
    bad(`作答按钮的 disabled 不受选中数约束：disabled={${dis}} —— 未选人仍可开始`);
  } else {
    ok(`作答按钮受选中数约束：disabled={${dis}}`);
  }
  // 反向：不得再出现「未选人也能跑」的那句文案（含标签之间的内容）
  if (/让看山推荐并作答/.test(startBtn)) {
    bad("作答按钮仍有「让看山推荐并作答」分支 —— 未选人也能开始，与清单冲突");
  } else {
    ok("作答按钮没有「让看山推荐并作答」这个未选人分支");
  }
}

// ② run() 内部必须再挡一层（UI 禁用拦不住绕过按钮的调用）
const runBody = /const run = useCallback\(\s*async[\s\S]*?\n  \);/.exec(code)?.[0] ?? "";
if (!runBody) {
  bad("找不到 run() 函数体 —— 结构变了");
} else if (!/handles\.length === 0/.test(runBody)) {
  bad("run() 内没有 `handles.length === 0` 守卫 —— 绕过按钮的调用仍会静默自动推荐");
} else {
  ok("run() 内有 `handles.length === 0` 守卫（UI 之外再挡一层）");
}
// ③ 未选人时的引导文案必须在
if (/至少选 1 位答主/.test(code)) {
  ok("未选人时给出了明确引导（「至少选 1 位答主才能开始」）");
} else {
  bad("未选人时没有引导文案 —— 按钮灰着但不说为什么，用户会卡住");
}

console.log("");
console.log("=".repeat(74));
console.log("C. 反向：不得误伤「一键自动回答」与空输入守卫");
console.log("=".repeat(74));

// ?auto=1 路径直接调 run([handle], q)，不经过按钮 —— 不能被 B 的守卫误杀
if (/void run\(\[handle\], q\)/.test(code)) {
  ok("?auto=1 一键路径仍在（run([handle], q)）—— 未受未选人守卫影响");
} else {
  bad("找不到 run([handle], q) —— 一键自动回答路径可能被误删");
}
if (/q\.length < MIN_QUESTION/.test(code)) {
  ok("空输入守卫仍在（q.length < MIN_QUESTION）");
} else {
  bad("空输入守卫不见了 —— 空问题会被送进生成");
}
// goPick 仍要预勾若干位（否则进选人页就是「未选人」态，按钮直接灰着，体验断掉）
if (/withPreferred\.slice\(0, Math\.max\(DEFAULT_PICKS/.test(code)) {
  ok("进选人页时仍预勾推荐答主（不会一进去就是禁用态）");
} else {
  bad("goPick 不再预勾答主 —— 用户一进选人页按钮就是灰的");
}

console.log("");
if (fail === 0) {
  console.log("=".repeat(74));
  console.log("全部通过（0 处问题）");
  console.log("=".repeat(74));
  process.exit(0);
} else {
  console.log("=".repeat(74));
  console.log(`${fail} 处问题`);
  console.log("=".repeat(74));
  process.exit(1);
}
