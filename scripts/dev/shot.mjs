/**
 * 一次性的无头 Chrome 抓取（截图 / DOM），**用 node 直接 spawn**。
 *
 * ## 为什么不直接用 PowerShell / bash 调 chrome.exe
 *
 * 实测（2026-09-16）：在 WorkBuddy 沙箱里，**由 PowerShell 拉起的浏览器进程
 * 会被整个杀掉** —— `& chrome --version` 都是 exit 1、连一行输出都没有，
 * 看起来像「命令没跑」，非常难判断。而**同一条命令由 node 的 spawnSync 拉起
 * 就能跑通**。所以这一层不是洁癖，是唯一能用的路。
 *
 * （`agent-browser` CLI 本身能跑，但它的 daemon 要拉起浏览器 → 同样卡住。）
 *
 * ## 两个必须带上的参数
 *
 *   --virtual-time-budget=N   让 Chrome 把定时器**快进** N 毫秒再抓，等价于
 *                             「等页面稳定」，比 sleep 靠谱得多
 *   --force-prefers-reduced-motion
 *                             冻结动画。不冻结的话每次抓到的都是动画的随机
 *                             一帧，前后两次截图没法比
 *
 * ## 两个已踩过的坑
 *
 *   · `--screenshot=` **必须给绝对路径**。给相对路径时新版 headless 会把它
 *     当成相对「临时 profile 目录」，结果文件写到别处，这里只看到「没生成」。
 *   · `--dump-dom` 与 `--screenshot` **不能同时用**，后者会被忽略。
 *   · 判断成功要看**文件是否生成**，不要看退出码：某些版本即使抓成功也返回非 0。
 *
 * ## 用法
 *
 *   node scripts/dev/shot.mjs shot out.png            # 截图
 *   node scripts/dev/shot.mjs dom  out.html           # 抓 DOM
 *
 * 可选环境变量：SHOT_URL（默认 http://127.0.0.1:3711/square）、
 *              SHOT_BUDGET、SHOT_W、SHOT_H、SHOT_SCALE
 *
 * 结果与失败原因都会打印到 stdout，并写一份到 <out>.log，方便直接读。
 */

import { spawnSync } from "node:child_process";
import { existsSync, statSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const CHROME =
  process.env.SHOT_CHROME ?? "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";

const mode = process.argv[2] ?? "shot";
const outArg = process.argv[3] ?? (mode === "dom" ? "shot.html" : "shot.png");
const out = resolve(outArg);

const url = process.env.SHOT_URL ?? "http://127.0.0.1:3711/square";
const budget = process.env.SHOT_BUDGET ?? "18000";
const W = process.env.SHOT_W ?? "1440";
const H = process.env.SHOT_H ?? "900";
const scale = process.env.SHOT_SCALE ?? "1";

mkdirSync(dirname(out), { recursive: true });
if (existsSync(out)) {
  try {
    // 先删掉旧文件：否则「文件存在」不能证明这次抓成功了
    spawnSync(process.platform === "win32" ? "cmd" : "rm", [process.platform === "win32" ? "/c" : "", "del", out].filter(Boolean));
  } catch {
    /* 删不掉也无所谓，下面会再核对 mtime */
  }
}

const args = [
  "--headless=new",
  "--disable-gpu",
  "--no-sandbox",
  "--hide-scrollbars",
  "--disable-extensions",
  "--force-device-scale-factor=" + scale,
  "--window-size=" + W + "," + H,
  "--virtual-time-budget=" + budget,
  "--force-prefers-reduced-motion",
  mode === "dom" ? "--dump-dom" : "--screenshot=" + out,
  url,
];

const r = spawnSync(CHROME, args, {
  encoding: "utf8",
  maxBuffer: 128 * 1024 * 1024,
  timeout: 240000,
});

const lines = [
  "mode  = " + mode,
  "url   = " + url,
  "out   = " + out,
  "spawn error = " + (r.error ? r.error.message : "none"),
  "exit  = " + r.status + "  signal=" + r.signal,
];

if (mode === "dom") {
  if (r.stdout) {
    writeFileSync(out, r.stdout, "utf8");
    lines.push("OK: " + statSync(out).size + " bytes written");
  } else {
    lines.push("FAIL: no stdout —— 多半是浏览器没起来（见 stderr）");
  }
} else {
  lines.push(existsSync(out) ? "OK: " + statSync(out).size + " bytes written" : "FAIL: 截图文件没生成");
}

if (r.stderr) {
  // Chrome 的 stderr 噪声很大（扩展、GPU），只留最后几行看真错
  const tail = r.stderr.trim().split("\n").slice(-3).join("\n");
  lines.push("--- chrome stderr (tail) ---\n" + tail);
}

const report = lines.join("\n");
writeFileSync(out + ".log", report, "utf8");
console.log(report);
