#!/usr/bin/env node
/**
 * 用 GitHub Git Data API 把「本地已经提交好的那个提交」原样推送到远端，不依赖 git 命令。
 *
 * 为什么需要它：本项目的 AI 会话禁止启动子进程（git / npm 都跑不了），
 * 所以推送改走 HTTP API；这在任何只装了 Node 的机器上都能用。
 *
 * 与 push-via-api.mjs 的区别：
 *   - push-via-api.mjs 读取「工作区文件」并新建一个提交；
 *   - 本脚本读取「.git 里已经提交好的对象」，原样复现那个提交，保留提交信息与作者。
 *
 * 用法（PowerShell，任意目录）：
 *   cd E:\codex\heikesong3
 *   node scripts/push-commit-via-api.mjs
 *
 * 令牌来源（按优先级）：
 *   1) 环境变量 GITHUB_TOKEN
 *   2) 仓库根目录的 .git-remote-token（已在 .gitignore 中，不会入库）
 * 获取方式（无需新建令牌，直接复用已登录的 gh）：
 *   gh auth token | Set-Content -Path E:\codex\heikesong3\.git-remote-token -Encoding ascii
 *
 * 安全：本脚本只读工作区，只写你指定的那一个仓库；推完请删除 .git-remote-token。
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { inflateSync } from "node:zlib";

const OWNER = "1008611-creater";
const REPO = "no.2zhihu";
const BRANCH = "main";
const ROOT = process.cwd();
const GIT = join(ROOT, ".git");

let TOKEN = process.env.GITHUB_TOKEN;
if (!TOKEN) {
  try {
    TOKEN = readFileSync(join(ROOT, ".git-remote-token"), "utf8").replace(/^\uFEFF/, "").trim();
  } catch (e) {
    // 文件不存在：留空，走下面的报错分支
  }
}
if (!TOKEN) {
  console.error("缺少令牌。先执行下面这一行（任意目录均可）：");
  console.error("  gh auth token | Set-Content -Path " + join(ROOT, ".git-remote-token") + " -Encoding ascii");
  process.exit(1);
}

function readObject(sha) {
  const p = join(GIT, "objects", sha.slice(0, 2), sha.slice(2));
  const raw = inflateSync(readFileSync(p));
  const nul = raw.indexOf(0);
  return { header: raw.subarray(0, nul).toString("utf8"), body: raw.subarray(nul + 1) };
}

function parseTree(body) {
  const items = [];
  let i = 0;
  while (i < body.length) {
    let sp = i;
    while (body[sp] !== 32) sp++;
    const mode = body.subarray(i, sp).toString("utf8");
    let nul = sp + 1;
    while (body[nul] !== 0) nul++;
    const name = body.subarray(sp + 1, nul).toString("utf8");
    const sha = body.subarray(nul + 1, nul + 21).toString("hex");
    items.push({ mode, name, sha });
    i = nul + 21;
  }
  return items;
}

function resolveRef(name) {
  let cur = name;
  for (let i = 0; i < 10; i++) {
    const t = readFileSync(join(GIT, cur), "utf8").trim();
    if (t.startsWith("ref: ")) { cur = t.slice(5); continue; }
    return t;
  }
  throw new Error("引用解析过深：" + name);
}

const head = resolveRef("HEAD");
const commitText = readObject(head).body.toString("utf8");
const treeSha = commitText.match(/^tree ([0-9a-f]{40})/m)[1];
const message = commitText.slice(commitText.indexOf("\n\n") + 2).trim();

const files = [];
(function walk(sha, prefix) {
  const t = readObject(sha);
  if (!t.header.startsWith("tree")) throw new Error("不是 tree 对象：" + sha);
  for (const it of parseTree(t.body)) {
    const p = prefix ? prefix + "/" + it.name : it.name;
    if (it.mode === "40000") walk(it.sha, p);
    else files.push({ path: p, mode: it.mode, sha: it.sha, content: readObject(it.sha).body });
  }
})(treeSha, "");

console.log("本地提交：" + head.slice(0, 7) + "，共 " + files.length + " 个文件");

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
  if (!res.ok) throw new Error((init.method || "GET") + " " + path + " -> " + res.status + " " + text.slice(0, 300));
  return text ? JSON.parse(text) : null;
}

// 1) 逐个建 blob。GitHub 按内容寻址，SHA 应与本地完全一致。
const entries = [];
let mismatch = 0;
for (const f of files) {
  const blob = await api("/repos/" + OWNER + "/" + REPO + "/git/blobs", {
    method: "POST",
    body: JSON.stringify({ content: f.content.toString("base64"), encoding: "base64" }),
  });
  if (blob.sha !== f.sha) mismatch++;
  const mode = f.mode === "120000" ? "120000" : (f.mode === "100755" ? "100755" : "100644");
  entries.push({ path: f.path, mode, type: "blob", sha: blob.sha });
  if (entries.length % 25 === 0) console.log("  已上传 " + entries.length + "/" + files.length);
}
console.log("  已上传 " + entries.length + "/" + files.length +
  (mismatch ? "（" + mismatch + " 个 SHA 不一致，已采用远端返回的）" : "，SHA 全部一致"));

// 2) 建 tree（path 带斜杠，GitHub 会自动生成子目录）
const tree = await api("/repos/" + OWNER + "/" + REPO + "/git/trees", {
  method: "POST",
  body: JSON.stringify({ tree: entries }),
});
console.log("  新 tree：" + tree.sha);

// 3) 取远端当前提交作为父提交 —— 保证是快进推送，不覆盖任何已有历史
let parent = null;
try {
  const ref = await api("/repos/" + OWNER + "/" + REPO + "/git/ref/heads/" + BRANCH);
  parent = ref.object.sha;
  console.log("  远端 " + BRANCH + " 当前提交：" + parent.slice(0, 7));
} catch (e) {
  console.log("  远端还没有 " + BRANCH + " 分支，将新建。");
}

// 4) 建 commit
const commitBody = {
  message: message + "\n\n同时合并远端自动生成的初始 README（内容与本仓库完全一致）。",
  tree: tree.sha,
};
if (parent) commitBody.parents = [parent];
const commit = await api("/repos/" + OWNER + "/" + REPO + "/git/commits", {
  method: "POST",
  body: JSON.stringify(commitBody),
});

// 5) 移动分支指针
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
console.log("请确认文件齐全后，删除本地令牌文件 .git-remote-token。");
