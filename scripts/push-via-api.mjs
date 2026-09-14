#!/usr/bin/env node
/**
 * 用 GitHub Git Data API 把整个项目一次性推送到公开仓库（单个 commit，不依赖本机 git 命令）。
 *
 * 为什么需要它：本项目的开发环境禁止启动子进程（git / npm 都跑不了），
 * 所以推送改为走 HTTP API；这在任何只装了 Node 的机器上都能用。
 *
 * 用法（PowerShell）：
 *   $env:GITHUB_TOKEN="<你的细粒度 PAT>"; node scripts/push-via-api.mjs
 *
 * 令牌权限（最小化）：
 *   Fine-grained token → Repository access 只选 no.2zhihu →
 *   Permissions → Contents: Read and write。其它权限一律不给。
 * 推完即可到 https://github.com/settings/tokens?type=beta 撤销。
 *
 * 安全：本脚本只读工作区文件，只写你指定的那一个仓库；
 *      .env.local / .official / .refs / .tools / .skills / node_modules / .next 永不读取。
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

const OWNER = "1008611-creater";
const REPO  = "no.2zhihu";
const BRANCH = "main";
const ROOT = process.cwd();
// 令牌来源优先级：环境变量 > 仓库根目录的 .git-remote-token（已在 .gitignore 中）。
// 用文件的好处：不需要把密钥粘到聊天/命令行历史里。
let TOKEN = process.env.GITHUB_TOKEN;
if (!TOKEN) {
  try {
    TOKEN = readFileSync(join(ROOT, ".git-remote-token"), "utf8").trim();
  } catch {}
}

if (!TOKEN) {
  console.error("缺少令牌。二选一：");
  console.error("  A) 把令牌写进 " + join(ROOT, ".git-remote-token") + "（该文件已被 .gitignore 忽略）");
  console.error("  B) 设置环境变量 GITHUB_TOKEN 后重跑");
  process.exit(1);
}

// 与 .gitignore 保持一致的排除规则 —— 这里必须是白名单式的显式排除。
const SKIP_DIRS = new Set([
  "node_modules", ".next", ".next.prev", "out", "build", "dist", ".git",
  ".official", ".tools", ".snapshots", ".refs", ".skills", ".vercel", ".turbo",
]);
const SKIP_FILE = /^(\.env\.local|\.env\..*\.local|.*\.db|dev\.db.*|.*\.tar\.gz|.*\.zip|.*\.log|npm-debug\.log.*|\.git-remote-token|.*\.token|\.DS_Store|Thumbs\.db)$/;

function collect(dir, acc = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name) || entry.name.startsWith(".probe")) continue;
      collect(full, acc);
    } else if (!SKIP_FILE.test(entry.name)) {
      acc.push(full);
    }
  }
  return acc;
}

async function api(path, init = {}) {
  const res = await fetch("https://api.github.com" + path, {
    ...init,
    headers: {
      Authorization: "Bearer " + TOKEN,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "no.2zhihu-push",
      ...(init.headers || {}),
    },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(init.method + " " + path + " -> " + res.status + " " + text.slice(0, 300));
  return text ? JSON.parse(text) : null;
}

const files = collect(ROOT).filter((f) => !f.includes(sep + ".git" + sep));
console.log("待推送文件：" + files.length + " 个");

// 1) 逐个创建 blob（二进制用 base64，文本用 utf8）
const entries = [];
for (const file of files) {
  const rel = relative(ROOT, file).split(sep).join("/");
  const buf = readFileSync(file);
  const isBinary = /\.(png|jpe?g|webp|gif|ico|woff2?|ttf|otf|mp4|mov|pdf|zip)$/i.test(rel);
  const blob = await api("/repos/" + OWNER + "/" + REPO + "/git/blobs", {
    method: "POST",
    body: JSON.stringify({
      content: buf.toString("base64"),
      encoding: "base64",
    }),
  });
  entries.push({ path: rel, sha: blob.sha, mode: "100644", type: "blob" });
  if (entries.length % 25 === 0) console.log("  已上传 " + entries.length + "/" + files.length);
}
console.log("  已上传 " + entries.length + "/" + files.length);

// 2) 建 tree（不带 base_tree → 得到一个完整快照，不会残留旧文件）
const tree = await api("/repos/" + OWNER + "/" + REPO + "/git/trees", {
  method: "POST",
  body: JSON.stringify({ tree: entries }),
});

// 3) 看远端 main 现在指向哪 —— 空仓库没有这个 ref，第一次推送就是初始提交
let parent = null;
try {
  const existing = await api("/repos/" + OWNER + "/" + REPO + "/git/ref/heads/" + BRANCH);
  parent = existing.object.sha;
  console.log("  远端 " + BRANCH + " 已有提交，将作为父提交：" + parent.slice(0, 7));
} catch {
  console.log("  远端 " + BRANCH + " 还不存在，本次为初始提交。");
}

// 4) 建 commit（parents 为空时必须是空数组以外不传，否则 GitHub 会报参数过短）
const commitBody = {
  message: "feat: 二号知乎 Human Mesh —— 多分身作答 + 缺口识别 + 看山角色引擎\n\n知乎黑客松 2026 参赛作品。",
  tree: tree.sha,
};
if (parent) commitBody.parents = [parent];

const commit = await api("/repos/" + OWNER + "/" + REPO + "/git/commits", {
  method: "POST",
  body: JSON.stringify(commitBody),
});

// 5) 让 main 指向这个 commit
if (parent) {
  await api("/repos/" + OWNER + "/" + REPO + "/git/refs/heads/" + BRANCH, {
    method: "PATCH",
    body: JSON.stringify({ sha: commit.sha, force: false }),
  });
} else {
  await api("/repos/" + OWNER + "/" + REPO + "/git/refs", {
    method: "POST",
    body: JSON.stringify({ ref: "refs/heads/" + BRANCH, sha: commit.sha }),
  });
}

console.log("");
console.log("推送完成：" + commit.sha);
console.log("仓库地址：https://github.com/" + OWNER + "/" + REPO);
console.log("下一步：在 https://vercel.com/new 导入仓库，并配置 ZHIHU_ACCESS_SECRET。");
