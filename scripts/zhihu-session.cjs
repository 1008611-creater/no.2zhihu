#!/usr/bin/env node
/**
 * 知乎会话：一次登录，长期自动。
 *
 * 为什么需要它：
 *   抓知乎答主的公开回答，靠的是 www.zhihu.com 的**网页登录态**（cookie 里的
 *   z_c0 + d_c0）。这跟 OAuth 拿到的 access_token 是两套完全独立的体系 ——
 *   OAuth 的 token 只能调开放平台 API，换不到主站 cookie。
 *
 * 它怎么做到「不用每次手动」：
 *   用一个**独立的持久化浏览器目录**（.personas-raw/.browser-profile）。
 *     · 第一次：弹出浏览器 → 你登录知乎（手机 App 扫码最快）→ 脚本把 cookie 写出来
 *     · 之后：浏览器 profile 自己带着登录态 → 脚本直接读，不再要你操作
 *   你日常用的 Chrome 完全不受影响，这里是个隔离的干净 profile。
 *
 * 用法：
 *   node scripts/zhihu-session.cjs           检查 + 需要时弹浏览器登录，然后导出 cookie
 *   node scripts/zhihu-session.cjs --check   只检查登录态，不弹窗（给脚本用）
 *
 * 产物：.personas-raw/.cookie.txt（该目录已 gitignore，绝不进仓库）
 */

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const PROFILE = path.join(ROOT, ".personas-raw", ".browser-profile");
const OUT = path.join(ROOT, ".personas-raw", ".cookie.txt");

const CHECK_ONLY = process.argv.includes("--check");
const TIMEOUT_MS = 5 * 60 * 1000;
const POLL_MS = 2000;

/** playwright 可能装在全局（npm i -g），挨个试一遍。 */
function loadPlaywright() {
  const candidates = [
    "playwright",
    path.join(process.env.APPDATA || "", "npm", "node_modules", "playwright"),
    path.join(process.env.ProgramFiles || "", "nodejs", "node_modules", "playwright"),
  ];
  for (const c of candidates) {
    try {
      return require(c);
    } catch {
      /* 继续试下一个 */
    }
  }
  return null;
}

function toCookieString(cookies) {
  return cookies.map((c) => c.name + "=" + c.value).join("; ");
}

/** 登录态判据：z_c0 是登录凭证，d_c0 是签名用的设备标识，缺一不可。 */
function loggedIn(cookies) {
  const names = new Set(cookies.map((c) => c.name));
  return names.has("z_c0") && names.has("d_c0");
}

function exportCookie(cookies) {
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, toCookieString(cookies), "utf8");
}

async function main() {
  const pw = loadPlaywright();
  if (!pw) {
    console.error("找不到 playwright。请先执行：npm i -g playwright && npx playwright install chromium");
    process.exit(1);
  }

  fs.mkdirSync(PROFILE, { recursive: true });

  let ctx;
  try {
    ctx = await pw.chromium.launchPersistentContext(PROFILE, {
      headless: CHECK_ONLY,
      viewport: { width: 1180, height: 820 },
      args: ["--no-first-run", "--no-default-browser-check"],
    });
  } catch (e) {
    if (/SingletonLock|ProcessSingleton|already in use/i.test(e.message)) {
      console.error("浏览器 profile 被占用：可能上一次的窗口还开着，关掉它再重试。");
    } else {
      console.error("启动浏览器失败：" + e.message);
    }
    process.exit(1);
  }

  try {
    let cookies = await ctx.cookies("https://www.zhihu.com");

    if (loggedIn(cookies)) {
      exportCookie(cookies);
      console.log("已登录（无需操作），cookie 已导出 → " + OUT);
      return;
    }

    if (CHECK_ONLY) {
      console.log("未登录：profile 里没有 z_c0。");
      process.exitCode = 2;
      return;
    }

    const page = ctx.pages()[0] || (await ctx.newPage());
    await page.goto("https://www.zhihu.com/signin", {
      waitUntil: "domcontentloaded",
      timeout: 60000,
    });
    console.log("浏览器已打开知乎登录页。请用手机知乎 App 扫码，或用账号密码登录。");
    console.log("登录成功后脚本会自动继续，无需其他操作（最多等 5 分钟）…");

    const deadline = Date.now() + TIMEOUT_MS;
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, POLL_MS));
      cookies = await ctx.cookies("https://www.zhihu.com");
      if (loggedIn(cookies)) {
        exportCookie(cookies);
        console.log("登录成功。cookie 已导出 → " + OUT);
        console.log("这个 profile 会记住登录态，以后抓取不用再登录。");
        return;
      }
    }
    console.error("等待超时：5 分钟内没检测到登录。重新运行本命令即可再试。");
    process.exitCode = 3;
  } finally {
    await ctx.close().catch(() => {});
  }
}

main().catch((e) => {
  console.error("失败：" + e.message);
  process.exit(1);
});
