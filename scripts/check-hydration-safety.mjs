/**
 * 水合安全自检（standalone，无需测试框架）。
 *
 * 跑法：node scripts/check-hydration-safety.mjs
 *
 * ## 它守的是什么
 *
 * 2026-09-15 线上实测事故：`prefers-reduced-motion: reduce` 下打开 `/square`，
 * 页面**卡在「正在铺开广场…」永远不动**，`/square-library.json` 一次都没被请求
 * —— 说明组件树没挂载成功，effect 从未运行。
 * 控制台报 React #418（水合不匹配）→ #423，重试若干次后落到 #329。
 * 同一页在 `no-preference` 下 0 报错、稳定渲染 22 行。
 *
 * 根因：`useReducedMotion()`（motion）在客户端**首次渲染**就同步返回媒体查询的
 * 真实值，而服务端渲染没有 window、只能返回 false —— 所有在**渲染期**按它分支的
 * 组件都会产出与首屏 HTML 不同的结果。
 *
 * 本项目**早就写过**这条教训：`SquareField` 里 `useIsNarrow` 的注释写着
 * 「初值用 false（先按桌面渲染）而不是同步读 matchMedia：服务端没有 window，
 * 同步读会让首屏 HTML 与客户端不一致（hydration 报错）」。
 * 这个脚本把「所有这类读取都必须走首帧为中性的 hook」变成可执行判据。
 *
 * ## 为什么是文本级断言
 *
 * 它要拦的是**写法**（从哪 import、初值给什么），不是运行时行为 ——
 * 而水合是否成功只有真在浏览器里跑才知道（那一步由 scripts/smoke.mjs 与
 * 人工实机验证负责）。两层配合：这里防写错，那里防没生效。
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, extname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

let fail = 0;
const bad = (msg) => {
  fail++;
  console.log("  ✗ " + msg);
};
const ok = (msg) => console.log("  ✓ " + msg);

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === ".next" || name === ".git") continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if ([".ts", ".tsx"].includes(extname(p))) out.push(p);
  }
  return out;
}

const files = walk(ROOT).map((p) => ({ abs: p, rel: relative(ROOT, p).replace(/\\/g, "/") }));

console.log("=".repeat(74));
console.log("① 不许再从 motion/react 直接取 useReducedMotion");
console.log("=".repeat(74));

const direct = files.filter((f) => {
  const d = readFileSync(f.abs, "utf8");
  return /import\s*\{[^}]*\buseReducedMotion\b[^}]*\}\s*from\s*['"]motion\/react['"]/.test(d);
});
if (direct.length === 0) {
  ok("没有文件从 motion/react 直接 import useReducedMotion");
} else {
  for (const f of direct) bad(f.rel + " 仍从 motion/react 取 useReducedMotion（首帧会与服务端不一致 → 水合失败）");
}

console.log("\n" + "=".repeat(74));
console.log("② 项目内的 hook 必须首帧为中性（初始 false）");
console.log("=".repeat(74));

const HOOK = join(ROOT, "lib", "motion", "useReducedMotion.ts");
let hookSrc = "";
try {
  hookSrc = readFileSync(HOOK, "utf8");
} catch {
  bad("lib/motion/useReducedMotion.ts 不存在");
}
if (hookSrc) {
  if (!/useState\(false\)/.test(hookSrc)) {
    bad("hook 的初始值不是 false —— 首帧会与服务端 HTML 不一致");
  } else ok("hook 用 useState(false) 起步（首帧与服务端一致）");
  if (!/useEffect\(/.test(hookSrc)) bad("hook 里没有 useEffect —— 挂载后不会校正真实偏好");
  else ok("挂载后在 effect 里校正真实偏好");
  if (!/addEventListener\(\s*["']change["']/.test(hookSrc)) {
    bad("hook 没有监听 change —— 用户中途改系统设置不会跟进");
  } else ok("监听 change，用户中途改设置会跟进");
}

console.log("\n" + "=".repeat(74));
console.log("③ 必须真的有人用它（防止重构把它悄悄丢掉）");
console.log("=".repeat(74));

const users = files.filter((f) => {
  const d = readFileSync(f.abs, "utf8");
  return /from\s*["']@\/lib\/motion\/useReducedMotion["']/.test(d);
});
if (users.length >= 8) ok(users.length + " 个文件改走项目内 hook");
else bad("只有 " + users.length + " 个文件在使用 —— 疑似有组件漏改或改动被回退");

console.log("\n" + "=".repeat(74));
console.log("④ 同类坑：其它「渲染期读媒体查询」也必须是首帧中性的写法");
console.log("=".repeat(74));

// SquareField 的 useIsNarrow 是这条约定在项目里的原始出处，一并钉住。
const field = readFileSync(join(ROOT, "components", "square", "SquareField.tsx"), "utf8");
if (!/function useIsNarrow[\s\S]{0,400}?useState\(false\)/.test(field)) {
  bad("useIsNarrow 的初值不再是 false —— 官方广场的 hydration 会重新开始报错");
} else ok("useIsNarrow 仍以 false 起步");

console.log("\n" + "=".repeat(74));
console.log(fail === 0 ? "全部通过 ✓" : fail + " 项失败 ✗");
console.log("=".repeat(74));
process.exit(fail === 0 ? 0 : 1);
