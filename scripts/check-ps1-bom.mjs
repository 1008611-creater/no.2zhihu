#!/usr/bin/env node
/**
 * 检查所有 .ps1 是否为「UTF-8 with BOM」。
 *
 * 为什么需要它：Windows PowerShell 5.1 读取无 BOM 的 .ps1 时，会按系统 ANSI 代码页解码
 * （简体中文下是 GBK），中文注释与字符串被撕碎，导致「字符串缺少终止符」这类假语法错误。
 * 这类问题在本机才暴露，CI 若不查就会一直漏过去。
 *
 * 用法：node scripts/check-ps1-bom.mjs
 * 退出码：0 = 全部合规；1 = 存在不合规文件。
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.cwd();
const SKIP_DIRS = new Set([
  "node_modules", ".next", ".next.prev", ".git", "out", "build", "dist",
  ".official", ".tools", ".refs", ".skills", ".snapshots", ".vercel", ".turbo",
]);
const BOM = [0xef, 0xbb, 0xbf];

function collect(dir, acc = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name) || entry.name.startsWith(".probe")) continue;
      collect(full, acc);
    } else if (entry.name.toLowerCase().endsWith(".ps1")) {
      acc.push(full);
    }
  }
  return acc;
}

const files = collect(ROOT);
const bad = [];
for (const file of files) {
  const buf = readFileSync(file);
  const ok = buf[0] === BOM[0] && buf[1] === BOM[1] && buf[2] === BOM[2];
  if (!ok) bad.push(relative(ROOT, file).split("\\").join("/"));
}

console.log("检查 " + files.length + " 个 .ps1 文件的编码 ...");
if (bad.length === 0) {
  console.log("全部为 UTF-8 with BOM ✅");
  process.exit(0);
}
console.error("");
console.error("以下 .ps1 缺少 UTF-8 BOM，在 Windows PowerShell 5.1 下会解析失败：");
for (const f of bad) console.error("  - " + f);
console.error("");
console.error("修复：用编辑器把编码改为「UTF-8 with BOM」后保存。");
process.exit(1);
