#!/usr/bin/env node
// 原子部署自检 —— 把「部署不能打断在途会话」这件事变成可复算的断言。
//
// 为什么需要守卫：
//   这个缺陷的本质是**部署流程里的一个时序**（先删 .next，再构建，中间 1~3 分钟
//   线上拿不到 static chunk）。时序问题一旦被写回旧写法，任何单元测试都不会红，
//   而用户在窗口期点一下就 ChunkLoadError。守卫盯的是「写法本身」，
//   因为写法是唯一能提前判定的东西。
//
// 检查分四层：
//   ① next.config.js 真的支持 NEXT_DIST_DIR，且**默认值仍是 .next**（运行时不改）
//   ② 部署脚本里不存在「先删线上 .next 再构建」这个致命顺序
//   ③ 部署脚本有原子切换（rename）、失败回滚、产物体检三件事
//   ④ 反例：把关键行删掉/改回去，守卫必须报错（有效性证明）
//
// 用法：node scripts/check-atomic-deploy.mjs
// 退出码：0 全部通过；1 有失败

import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CONFIG = join(ROOT, "next.config.js");
const SCRIPTS_ATOMIC = join(ROOT, "scripts", "deploy-atomic.sh");
const SCRIPTS_LEGACY = join(ROOT, "scripts", "deploy-server.sh");

let pass = 0;
let fail = 0;
const failures = [];

function check(name, cond, detail = "") {
  if (cond) {
    pass++;
    console.log(`  ✓ ${name}`);
  } else {
    fail++;
    failures.push(name);
    console.log(`  ✗ ${name}${detail ? ` —— ${detail}` : ""}`);
  }
}

function read(p) {
  return existsSync(p) ? readFileSync(p, "utf8") : "";
}

// 剥掉 shell / js 注释，避免「断言命中注释里的举例」（本仓库踩过这个坑）
function stripShellComments(s) {
  return s
    .split("\n")
    .filter((l) => !/^\s*#/.test(l))
    .join("\n");
}

// ─────────────────────────────────────────────────────────────
console.log("\n① next.config.js：distDir 可覆盖，且默认仍是 .next");
// ─────────────────────────────────────────────────────────────
const cfg = read(CONFIG);
check("存在 next.config.js", cfg.length > 0);
check(
  "distDir 走环境变量 NEXT_DIST_DIR",
  /distDir\s*:\s*process\.env\.NEXT_DIST_DIR/.test(cfg),
  "缺少 distDir: process.env.NEXT_DIST_DIR",
);
check(
  "默认值仍是 \".next\"（运行时不改行为）",
  /distDir\s*:\s*process\.env\.NEXT_DIST_DIR\s*\|\|\s*["']\.next["']/.test(cfg),
  "默认值不是 .next，运行时会错目录",
);
// 反例保护：distDir 若被写成含时间戳的动态值，tsconfig include 会无限增长
check(
  "distDir 不得含时间戳/随机量（否则 tsconfig include 会无限增长）",
  !/NEXT_DIST_DIR[^;]*\$\{?(date|RANDOM|TIME)/.test(cfg) &&
    !/distDir\s*:.*Date\.now\(\)/.test(cfg),
  "检测到动态 distDir",
);
check(
  "next.config.js 里没把 .next.new 写死成唯一值（仍可被覆盖）",
  !/distDir\s*:\s*["']\.next\.new["']/.test(cfg),
  "写死 .next.new 会让运行时的 next start 也去找 .next.new",
);

// ─────────────────────────────────────────────────────────────
console.log("\n② 部署脚本：不得「先删线上 .next，再构建」");
// ─────────────────────────────────────────────────────────────
const sh = read(SCRIPTS_ATOMIC);
check("存在 scripts/deploy-atomic.sh", sh.length > 0);
const shc = stripShellComments(sh);

// 致命顺序：构建之前就删/移走 .next
const lines = shc.split("\n");
let buildLine = -1;
for (let i = 0; i < lines.length; i++) {
  if (/npm run build/.test(lines[i])) {
    buildLine = i;
    break;
  }
}
check("脚本里有 npm run build", buildLine >= 0);

let fatalDelete = -1;
for (let i = 0; i < lines.length; i++) {
  // 匹配：rm -rf "$APP_DIR/.next"（精确删线上目录），且不是 .next.new / .next.old
  if (/rm\s+-rf\s+[^\n]*\/\.next(?![.\w])/.test(lines[i])) {
    fatalDelete = i;
    break;
  }
}
check(
  "构建之前没有 rm -rf 线上 .next",
  !(fatalDelete >= 0 && buildLine >= 0 && fatalDelete < buildLine),
  fatalDelete >= 0 && fatalDelete < buildLine
    ? `第 ${fatalDelete + 1} 行删了线上 .next，而构建在第 ${buildLine + 1} 行 —— 这正是要修的缺陷`
    : "",
);
check(
  "构建用的是 NEXT_DIST_DIR=.next.new（而不是默认 .next）",
  /NEXT_DIST_DIR=\$?\{?STAGING_DIR\}?|NEXT_DIST_DIR=\.next\.new/.test(shc),
  "构建没有写到独立目录",
);

// ─────────────────────────────────────────────────────────────
console.log("\n③ 部署脚本：原子切换 / 回滚 / 体检");
// ─────────────────────────────────────────────────────────────
check(
  "用 mv（rename）做切换，而不是 cp（cp 有中间态）",
  /mv\s+["']?\$APP_DIR\/\$STAGING_DIR["']?\s+["']?\$APP_DIR\/\.next/.test(shc) ||
    /mv\s+[^\n]*\$STAGING_DIR[^\n]*\.next/.test(shc),
  "没找到把 staging 目录 rename 成 .next",
);
check("切换前把旧 .next 挪走（保留回滚点）", /mv\s+[^\n]*\.next[^\n]*\$OLD_DIR/.test(shc));
check("切换前做产物体检（BUILD_ID / static / server）",
  /BUILD_ID/.test(shc) && /static\/chunks/.test(shc));
check("健康检查失败时会回滚", /回滚/.test(shc) && /mv\s+[^\n]*\$OLD_DIR[^\n]*\.next/.test(shc));
check("用 flock 做部署互斥", /flock/.test(shc));
check("等并发构建（不抢同一个目录）", /pgrep -f 'next build'/.test(shc));
check("成功/失败有可机读的 RESULT= 标记",
  /RESULT=deployed/.test(shc) && /RESULT=up-to-date/.test(shc));
check("部署后会清理旧版本（磁盘 88% 时必要）", /rm -rf\s+["']?\$APP_DIR\/\$OLD_DIR/.test(shc));

// ─────────────────────────────────────────────────────────────
console.log("\n④ 旧脚本不再被 CI/文档当作部署入口");
// ─────────────────────────────────────────────────────────────
const ci = read(join(ROOT, ".github", "workflows", "ci.yml"));
check(
  "ci.yml 不再暗示「服务器端跑 deploy-server.sh --update」",
  !/deploy-server\.sh\s+--update/.test(ci),
  "CI 里仍在引用旧的非原子路径",
);
const legacy = read(SCRIPTS_LEGACY);
if (legacy.length > 0) {
  // 旧脚本的 --update 分支若还在，必须带着指路说明
  const legacyUpdate = stripShellComments(legacy);
  const stillHasOld = /rm\s+-rf\s+["']?\$APP_DIR\/\.next|npm run build/.test(legacyUpdate);
  check(
    "deploy-server.sh 的 --update 要么已改为原子、要么明确指向 deploy-atomic.sh",
    !stillHasOld || /deploy-atomic\.sh/.test(legacy),
    "旧脚本还能原地覆盖式部署，但没指向新脚本",
  );
}

// ─────────────────────────────────────────────────────────────
console.log("\n⑤ 负向验证（守卫的有效性证明）");
// ─────────────────────────────────────────────────────────────
// 用一个最小复刻来证明②的断言真的会红：构造「先删后建」的写法
const badSample = stripShellComments(`
rm -rf "$APP_DIR/.next"
cd "$APP_DIR"
npm run build
`);
const badLines = badSample.split("\n");
let badBuild = -1;
for (let i = 0; i < badLines.length; i++) if (/npm run build/.test(badLines[i])) { badBuild = i; break; }
let badDel = -1;
for (let i = 0; i < badLines.length; i++) {
  if (/rm\s+-rf\s+[^\n]*\/\.next(?![.\w])/.test(badLines[i])) { badDel = i; break; }
}
const wouldFail = badDel >= 0 && badBuild >= 0 && badDel < badBuild;
check("反例（先删 .next 再构建）会被判定为失败", wouldFail);

// 反例 2：distDir 默认值被改错
const badCfg = 'distDir: process.env.NEXT_DIST_DIR || ".next.new"';
const defaultOk = /distDir\s*:\s*process\.env\.NEXT_DIST_DIR\s*\|\|\s*["']\.next["']/.test(badCfg);
check("反例（默认值写成 .next.new）会被判定为失败", !defaultOk);

// ─────────────────────────────────────────────────────────────
console.log(`\n${"─".repeat(56)}`);
if (fail === 0) {
  console.log(`原子部署自检：${pass} 通过 / 0 失败`);
  process.exit(0);
} else {
  console.log(`原子部署自检：${pass} 通过 / ${fail} 失败`);
  console.log("失败项：");
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}
