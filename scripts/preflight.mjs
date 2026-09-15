#!/usr/bin/env node
/**
 * 提交前自检（preflight）—— 一条命令跑完三条本项目真实踩过的坑。
 *
 * 三条检查都不是假设出来的，每一條都对应一次实际损失：
 *
 *   1. 查重 —— 已发生 2 次重复劳动：#21 与 #23 各自独立修了同一个「假登录」，
 *      #11 与 #15 做了同一套护栏。两条线程同时写同一件事 = 审计工作量翻倍，
 *      而且合并时两边实现分叉比冲突更难收拾。
 *
 *   2. 接线 —— 出现过「定义进了结果、调用点被丢」：三方合并自动合上了新函数，
 *      但调用它的那一行被对面改没了，tsc 抓不到（未使用的导出不是错误）。
 *      判据：新增的导出符号必须「定义 1 次 + 至少 1 处调用」。
 *
 *   3. 产物 —— 标 `○ (Static)` 的页面只输出 shell，交互内容全在客户端 JS。
 *      `curl | grep 文案` 返回 0 属正常，所以「构建成功」不等于「生效」，
 *      必须到 .next/server 与 .next/static 里找。
 *
 * 用法：
 *   node scripts/preflight.mjs                          # 用 origin/main 作 base
 *   node scripts/preflight.mjs --base <sha>             # 指定 base
 *   node scripts/preflight.mjs --base <sha> --head <sha> # 两端都用字面 SHA
 *     （HEAD 不可靠的环境用得上：例如本机沙箱里 .git/refs 写不进时，
 *      分支 ref 可能停在旧值，此时传字面 SHA 比依赖 HEAD 可信）
 *   node scripts/preflight.mjs --text "要验的文案"        # 可多次，验产物里有没有
 *   node scripts/preflight.mjs --text "A" --text "B"
 *
 * 退出码：0 = 全部通过；1 = 有失败项；2 = 有跳过项但无失败（可继续，但要知情）。
 */

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, extname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const argv = process.argv.slice(2);

function flag(name, fallback = null) {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback;
}
const TEXTS = [];
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === "--text" && argv[i + 1]) TEXTS.push(argv[++i]);
}
const BASE = flag("--base", "origin/main");
const HEAD = flag("--head", "HEAD");

function run(cmd, args, timeout = 120000) {
  try {
    const out = execFileSync(cmd, args, {
      cwd: ROOT, encoding: "utf8", timeout,
      stdio: ["ignore", "pipe", "pipe"],
    });
    return { ok: true, out: (out || "").trim() };
  } catch (e) {
    return {
      ok: false,
      out: String(e.stdout || "").trim(),
      err: String(e.stderr || "").trim(),
      code: e.status,
    };
  }
}

/** 找 gh：PATH 里没有就试常见安装位置。找不到时如实报「跳过」，不假装通过。 */
function findGh() {
  const probe = run("gh", ["--version"]);
  if (probe.ok) return "gh";
  for (const p of ["C:\\Program Files\\GitHub CLI\\gh.exe", "/usr/bin/gh", "/usr/local/bin/gh"]) {
    if (existsSync(p)) return p;
  }
  return null;
}

const results = [];
function record(name, status, detail, extra = []) {
  results.push({ name, status, detail, extra });
}

/* ============================================================ 1. 查重 */

function checkDuplicate() {
  const gh = findGh();
  if (!gh) {
    record("查重", "skip", "找不到 gh CLI —— 手动跑 `gh pr list --state open` 核对");
    return;
  }
  const prs = run(gh, ["pr", "list", "--state", "open", "--limit", "30", "--json", "number,title,headRefName,files"]);
  if (!prs.ok) {
    record("查重", "skip", "gh pr list 失败（可能是网络或未登录）：" + (prs.err || "").slice(0, 120));
    return;
  }

  let list = [];
  try {
    list = JSON.parse(prs.out || "[]");
  } catch {
    record("查重", "skip", "gh 返回无法解析");
    return;
  }

  const diff = run("git", ["diff", "--name-only", BASE, HEAD]);
  if (!diff.ok) {
    record("查重", "skip",
      "取不到本分支改动（" + BASE + " 可能不在本地，先 git fetch）—— 在途 PR 有 " + list.length + " 个");
    return;
  }
  const mine = new Set(diff.out.split("\n").map((s) => s.trim()).filter(Boolean));
  if (mine.size === 0) {
    record("查重", "skip", "本分支相对 " + BASE + " 没有文件改动");
    return;
  }

  const overlaps = [];
  for (const pr of list) {
    const files = (pr.files || []).map((f) => f.path);
    const shared = files.filter((f) => mine.has(f));
    if (shared.length > 0) {
      overlaps.push({ pr, shared, ratio: shared.length / Math.max(1, Math.min(files.length, mine.size)) });
    }
  }

  if (overlaps.length === 0) {
    record("查重", "pass", "在途 " + list.length + " 个 PR，与本分支改动重叠 0 个");
    return;
  }

  overlaps.sort((a, b) => b.ratio - a.ratio);
  const worst = overlaps[0];
  const heavy = worst.ratio >= 0.5;
  record(
    "查重",
    heavy ? "fail" : "warn",
    heavy
      ? "与 #" + worst.pr.number + "「" + worst.pr.title.slice(0, 40) + "」重叠 " + worst.shared.length + " 个文件（≥50%）—— 先确认是不是在做同一件事"
      : "与 " + overlaps.length + " 个在途 PR 有文件重叠（最高 #" + worst.pr.number + " 共 " + worst.shared.length + " 个）",
    overlaps.slice(0, 3).map((o) =>
      "  #" + o.pr.number + " " + o.pr.headRefName + " ← " + o.shared.slice(0, 4).join(", ") +
      (o.shared.length > 4 ? " …+" + (o.shared.length - 4) : "")),
  );
}

/* ============================================================ 2. 接线 */

const SOURCE_EXT = new Set([".ts", ".tsx", ".mjs", ".js", ".cjs"]);

function walkSource(dir, acc = [], depth = 0) {
  if (depth > 6 || !existsSync(dir)) return acc;
  let entries = [];
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return acc;
  }
  for (const e of entries) {
    if (["node_modules", ".next", ".git", ".tools", ".personas-raw"].includes(e.name)) continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) walkSource(p, acc, depth + 1);
    else if (SOURCE_EXT.has(extname(e.name))) acc.push(p);
  }
  return acc;
}

/**
 * 从 `git diff --unified=0` 的输出里抽出**新增的导出符号**。
 *
 * 必须同时认两种写法：
 *   export function foo() {}
 *   export {
 *     foo,
 *     bar,
 *   };
 * 本项目后者居多，只认前者会整片漏检。
 */
function addedExports(diffOut) {
  const out = new Set();
  let inBlock = false;
  for (const raw of diffOut.split("\n")) {
    if (!raw.startsWith("+") || raw.startsWith("+++")) {
      if (raw.startsWith("-")) inBlock = false;
      continue;
    }
    const line = raw.slice(1);

    const m1 = line.match(/^\s*export\s+(?:async\s+)?(?:function|const)\s+([A-Za-z_$][\w$]*)/);
    if (m1) {
      out.add(m1[1]);
      inBlock = false;
      continue;
    }

    if (/^\s*export\s*\{/.test(line)) {
      const inline = line.match(/\{([^}]*)\}/);
      if (inline) {
        for (const part of inline[1].split(",")) {
          const t = part.trim().split(/\s+as\s+/).pop().trim();
          if (/^[A-Za-z_$][\w$]*$/.test(t)) out.add(t);
        }
        inBlock = false;
      } else {
        inBlock = true;
      }
      continue;
    }

    if (inBlock) {
      if (/^\s*\}/.test(line)) {
        inBlock = false;
        continue;
      }
      const body = line.replace(/\/\/.*$/, "");
      for (const part of body.split(",")) {
        const t = part.trim().split(/\s+as\s+/).pop().trim();
        if (/^[A-Za-z_$][\w$]*$/.test(t)) out.add(t);
      }
    }
  }
  return out;
}

function checkWiring() {
  const diff = run("git", ["diff", "--unified=0", BASE, HEAD]);
  if (!diff.ok) {
    record("接线", "skip", "取不到 diff（先 git fetch " + BASE + "）");
    return;
  }

  // 只挑「函数 / 常量」导出：interface / type 只在编译期存在，没有运行期调用点。
  //
  // 两种导出写法都要认 —— 本项目大量使用 `export { a, b }` 块形式，
  // 只认 `export function X` 会整片漏掉（第一版就漏了）。
  const added = addedExports(diff.out);
  if (added.size === 0) {
    record("接线", "pass", "本分支没有新增导出符号，无需检查");
    return;
  }

  const files = walkSource(ROOT);
  const problems = [];
  const lines = [];
  for (const sym of [...added].sort()) {
    let defs = 0;
    let uses = 0;
    const re = new RegExp("\\b" + sym.replace(/[$]/g, "\\$") + "\\b", "g");
    for (const f of files) {
      let s;
      try {
        s = readFileSync(f, "utf8");
      } catch {
        continue;
      }
      const n = (s.match(re) || []).length;
      if (n === 0) continue;
      // 定义写法有两种：`export function X` 与 `function X`（再由 export{} 导出）。
      // 只认前者会把「本地定义 + 块导出」误判成没有定义 → 假失败。
      const isDef =
        new RegExp("(?:export\\s+)?(?:async\\s+)?function\\s+" + sym + "\\b").test(s) ||
        new RegExp("(?:export\\s+)?const\\s+" + sym + "\\b").test(s);
      if (isDef) defs += 1;
      uses += n - (isDef ? 1 : 0);
    }
    // 判据是「有定义 + 有调用」，而不是「只能定义一次」：
    // 不同模块出现同名函数是正常的（模块作用域隔离），按名字全局计数
    // 会把 lib/server/persona.ts 里的同名 parseDistill 误判成重复定义。
    const okRow = defs >= 1 && uses >= 1;
    lines.push("  " + (okRow ? "✓" : "✗") + " " + sym + "：定义 " + defs + " 处，调用 " + uses + " 次");
    if (!okRow) problems.push(sym + "（定义 " + defs + "，调用 " + uses + "）");
  }

  record(
    "接线",
    problems.length ? "fail" : "pass",
    problems.length
      ? "新增符号没有调用点（合并时最容易丢的就是调用行）：" + problems.join("；")
      : "新增导出 " + added.size + " 个，全部「定义 1 次 + 有调用」",
    lines,
  );
}

/* ============================================================ 3. 产物 */

function checkArtifacts() {
  const nextDir = join(ROOT, ".next");
  if (!existsSync(nextDir)) {
    record("产物", "skip", "没有 .next —— 先 `npm run build` 再验");
    return;
  }
  if (TEXTS.length === 0) {
    record("产物", "skip", "没传 --text —— 用 `--text \"<文案>\"` 指定要验的字符串（可多次）");
    return;
  }

  const targets = ["server", "static"].map((d) => join(nextDir, d)).filter(existsSync);
  if (targets.length === 0) {
    record("产物", "skip", ".next 下没有 server/static 目录");
    return;
  }

  const found = new Map(TEXTS.map((t) => [t, []]));
  const stack = [...targets];
  while (stack.length > 0) {
    const dir = stack.pop();
    let entries = [];
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entries) {
      const p = join(dir, e.name);
      if (e.isDirectory()) {
        stack.push(p);
        continue;
      }
      let size = 0;
      try {
        size = statSync(p).size;
      } catch {
        continue;
      }
      if (size > 8 * 1024 * 1024) continue;
      let s;
      try {
        s = readFileSync(p, "utf8");
      } catch {
        continue;
      }
      for (const t of TEXTS) {
        if (s.includes(t)) found.get(t).push(relative(ROOT, p).replace(/\\/g, "/"));
      }
    }
  }

  const miss = TEXTS.filter((t) => found.get(t).length === 0);
  record(
    "产物",
    miss.length ? "fail" : "pass",
    miss.length
      ? "以下文案在产物里找不到（说明没生效，而不是「构建失败」）：" + miss.map((m) => "「" + m + "」").join("、")
      : TEXTS.length + " 条文案都在产物中",
    TEXTS.map((t) => "  " + (found.get(t).length ? "✓" : "✗") + " 「" + t + "」→ " +
      (found.get(t).slice(0, 2).join(" / ") || "未找到")),
  );
}

/* ============================================================ 跑 */

console.log("preflight 检查（base = " + BASE + "，head = " + HEAD + "）");
checkDuplicate();
checkWiring();
checkArtifacts();

const ICON = { pass: "✓", warn: "!", fail: "✗", skip: "-" };
for (let i = 0; i < results.length; i++) {
  const r = results[i];
  console.log("\n[" + (i + 1) + "/3] " + r.name);
  console.log("  " + ICON[r.status] + " " + r.detail);
  for (const line of r.extra || []) console.log(line);
}

const fail = results.filter((r) => r.status === "fail").length;
const warn = results.filter((r) => r.status === "warn").length;
const skip = results.filter((r) => r.status === "skip").length;
const pass = results.filter((r) => r.status === "pass").length;

console.log("\n结果：" + pass + " 通过，" + warn + " 警告，" + fail + " 失败，" + skip + " 跳过");
if (fail > 0) {
  console.log("→ 有硬性失败项，先处理再提 PR。");
  process.exit(1);
}
if (warn > 0) {
  console.log("→ 有警告项，确认过再继续。");
  process.exit(2);
}
if (skip > 0) {
  console.log("→ 有跳过项（通常是没 build 或没传 --text），不代表通过。");
  process.exit(2);
}
console.log("→ 三项全过。");
