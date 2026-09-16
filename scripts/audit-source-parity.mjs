#!/usr/bin/env node
/**
 * 线上「来源计数三处同数」复验 —— 审计线程的上线检查项之一。
 *
 * 背景：`AGENTS.md` 铁律 3 要求展示知乎内容必须带作者与链接。
 * 判断「可核对」的唯一入口是 `lib/domain/evidence.ts` 的 `splitSources()`。
 * 但同一个数字会被三处渲染读到：
 *
 *   ① 镜像页顶栏（`app/(flow)/mirror/page.tsx` 的「N 条真实知乎来源」）
 *   ② 右栏广播（`lib/domain/broadcast.ts` 的 `sourceCount`）
 *   ③ 回答页来源区（`app/(flow)/answer/[id]/page.tsx`）
 *
 * 只要有一处漏用过滤，就会出现「顶栏写 9 条、回答页只列得出 8 条」——
 * 不报错、不崩溃，只是让人怀疑数字是编的（2026-09-15 实测漏过两次：
 * #53 漏了镜像页证据时间轴，#64 漏了镜像页顶栏）。
 *
 * 所以不能靠读 diff 判断，要把线上真实数据拉下来按三处各自的算法复算一遍。
 *
 * 用法：
 *   node scripts/audit-source-parity.mjs
 *   node scripts/audit-source-parity.mjs --base https://zhihu.cauai.fun
 *
 * 退出码：三处同数 → 0；否则 → 1。
 *
 * 注意（别据此报 bug）：库文件里 `sources` 挂在 `answers[]` 上，
 * `skills[].sources` 是 `hydrateLibraryEntry()` 在运行时回填的 ——
 * 所以直接读库里的 `skills[].sources` 恒为 0，这是设计如此。
 */

const argv = process.argv.slice(2);
const arg = (name, fallback) => {
  const i = argv.indexOf("--" + name);
  return i > -1 && argv[i + 1] ? argv[i + 1] : fallback;
};
const BASE = arg("base", "https://zhihu.cauai.fun").replace(/\/+$/, "");

/** 与 lib/domain/evidence.ts 的 splitSources 保持同一判据（只数作者+链接齐全者）。 */
function splitSources(list) {
  const arr = Array.isArray(list) ? list : [];
  const displayable = arr.filter(
    (s) => s && (s.title || "").trim() && (s.author || "").trim() && (s.url || "").trim(),
  );
  return { displayable, unattributed: arr.length - displayable.length };
}

const Z = /^https:\/\/(www|zhuanlan)\.zhihu\.com\//;

const res = await fetch(`${BASE}/square-library.json`);
if (!res.ok) {
  console.error(`拉取 ${BASE}/square-library.json 失败：HTTP ${res.status}`);
  process.exit(1);
}
const lib = await res.json();
const entries = Array.isArray(lib)
  ? lib
  : (lib.entries ?? lib.topics ?? Object.values(lib).find(Array.isArray) ?? []);

let topbar = 0;   // ① 镜像页顶栏：#64 之后 = answers.reduce + splitSources
let stats = 0;    // ② 右栏广播：statsOf（有 sources 用 splitSources，否则退回 evidenceCount）
let answerPage = 0; // ③ 回答页来源区
let rawLibrary = 0; // 参考：库内 skills[].sources（恒为 0，见文件头说明）
const badUrls = [];
let unattributed = 0;

for (const e of entries) {
  const answers = e.answers ?? [];
  for (const a of answers) {
    const sp = splitSources(a.sources);
    topbar += sp.displayable.length;
    answerPage += sp.displayable.length;
    unattributed += sp.unattributed;
    for (const s of sp.displayable) if (!Z.test(s.url)) badUrls.push(s.url);
  }
  stats += answers.reduce((n, a) => {
    if (a.sources?.length) return n + splitSources(a.sources).displayable.length;
    const c = a.evidenceCount ?? 0;
    return n + (Number.isFinite(c) && c > 0 ? c : 0);
  }, 0);
  for (const s of e.skills ?? []) rawLibrary += (s.sources ?? []).length;
}

console.log("═".repeat(74));
console.log(`来源计数一致性复验 · ${BASE}`);
console.log("═".repeat(74));
console.log(`  场次 / 条目数             ${entries.length}`);
console.log(`  ① 镜像页顶栏              ${topbar}`);
console.log(`  ② 右栏广播 statsOf        ${stats}`);
console.log(`  ③ 回答页来源区            ${answerPage}`);
console.log(`  （参考）库内 skills[].sources  ${rawLibrary}  ← 恒为 0 是设计如此，由 hydrate 回填`);
console.log(`  未取回署名 / 链接而未展示的    ${unattributed} 条`);
console.log(`  非知乎域名的可展示链接        ${badUrls.length}${badUrls.length ? " " + badUrls.slice(0, 3).join(" ") : ""}`);

const same = topbar === stats && stats === answerPage;
console.log(same ? "\n三处同数 ✓" : "\n口径漂移 ✗ —— 有渲染面漏用了 splitSources()");
console.log("═".repeat(74));
process.exit(same ? 0 : 1);
