#!/usr/bin/env node
/**
 * 关键路径冒烟检查 —— CI 与「部署后」共用同一份。
 *
 * 为什么需要它
 *   在它之前，CI 只跑 tsc + build，那是**编译期**检查。
 *   它拦不住「编译通过、但页面 500 / 接口契约被改坏 / 鉴权失效」这类回归 ——
 *   而这类回归恰恰是最危险的：自动部署会把它直接推到正在评审的评委眼前。
 *   冒烟检查把这一类挡在 main 之外，成本约 15 秒。
 *
 * 为什么 CI 与部署后共用同一份
 *   避免「本地验的和线上验的不是一回事」。同一份断言，两处执行，
 *   结果可直接对比：CI 绿而线上红 = 部署或环境问题，不是代码问题。
 *
 * 用法
 *   node scripts/smoke.mjs --base http://127.0.0.1:3100
 *   node scripts/smoke.mjs --base https://zhihu.cauai.fun --retries 6
 *
 * 退出码 0 = 全通过；1 = 有失败（并打印失败项与响应片段，便于定位）。
 */

const argv = process.argv.slice(2);
function arg(name, fallback) {
  const i = argv.indexOf("--" + name);
  return i > -1 && argv[i + 1] ? argv[i + 1] : fallback;
}

const BASE = arg("base", "http://127.0.0.1:3000").replace(/\/+$/, "");
const RETRIES = Number(arg("retries", "1"));
const RETRY_WAIT_MS = Number(arg("retry-wait", "5000"));

/** 页面：能渲染出 HTML 就算过。 */
const PAGE_CHECKS = [
  { path: "/", label: "首页" },
  { path: "/square", label: "虚拟广场" },
  { path: "/personas", label: "答主名册" },
  { path: "/me", label: "我的" },
  { path: "/mirror", label: "镜像工作台" },
];

/** 接口：状态码 + 可选的内容断言。 */
const API_CHECKS = [
  {
    path: "/api/health",
    want: 200,
    label: "健康检查",
    mustInclude: ['"ok"'],
  },
  {
    path: "/api/auth/session",
    want: 200,
    label: "会话状态",
    // 这个字段是「登录是否已过期」的唯一来源，删掉它前端会退回「假登录」。
    mustInclude: ['"tokenValid"'],
  },
  {
    path: "/api/auth/user-data",
    want: 401,
    label: "未登录取用户数据必须 401",
    // 断言 401 是为了拦住「鉴权被改坏、未登录也能拿到数据」这类事故。
  },
];

async function probe(path, { expectBody = true } = {}) {
  const res = await fetch(BASE + path, { redirect: "manual" });
  const body = expectBody ? await res.text() : "";
  return { status: res.status, body };
}

async function runOnce() {
  const failures = [];
  let passed = 0;

  for (const c of PAGE_CHECKS) {
    try {
      const { status, body } = await probe(c.path);
      if (status !== 200 || body.length < 500) {
        failures.push(`${c.label} ${c.path}：期望 200 且有内容，实得 ${status} / ${body.length} 字节`);
      } else {
        passed++;
        console.log(`  ok   ${c.label.padEnd(18)} ${c.path}  ${status}`);
      }
    } catch (e) {
      failures.push(`${c.label} ${c.path}：请求失败 ${e.message}`);
    }
  }

  for (const c of API_CHECKS) {
    try {
      const { status, body } = await probe(c.path);
      if (status !== c.want) {
        failures.push(`${c.label} ${c.path}：期望 ${c.want}，实得 ${status}  ${body.slice(0, 120)}`);
        continue;
      }
      const missing = (c.mustInclude ?? []).filter((s) => !body.includes(s));
      if (missing.length) {
        failures.push(`${c.label} ${c.path}：响应缺少 ${missing.join("、")}  ${body.slice(0, 160)}`);
        continue;
      }
      passed++;
      console.log(`  ok   ${c.label.padEnd(18)} ${c.path}  ${status}`);
    } catch (e) {
      failures.push(`${c.label} ${c.path}：请求失败 ${e.message}`);
    }
  }

  return { failures, passed };
}

const total = PAGE_CHECKS.length + API_CHECKS.length;
let last = null;

for (let attempt = 1; attempt <= RETRIES; attempt++) {
  console.log(`冒烟检查 ${BASE}（第 ${attempt}/${RETRIES} 次）`);
  try {
    last = await runOnce();
  } catch (e) {
    last = { failures: [`整体失败：${e.message}`], passed: 0 };
  }
  if (last.failures.length === 0) break;
  if (attempt < RETRIES) {
    console.log(`  未通过，${RETRY_WAIT_MS / 1000}s 后重试…`);
    await new Promise((r) => setTimeout(r, RETRY_WAIT_MS));
  }
}

if (last && last.failures.length === 0) {
  console.log(`\n冒烟检查通过（${last.passed}/${total}）`);
  process.exit(0);
}

console.error(`\n冒烟检查未通过（${last ? last.passed : 0}/${total}）：`);
for (const f of last ? last.failures : ["未知错误"]) console.error("  FAIL " + f);
process.exit(1);
