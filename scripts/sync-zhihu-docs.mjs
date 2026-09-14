// 重新拉取知乎开放平台官方文档到 docs/zhihu-api/references/
// 用法: node scripts/sync-zhihu-docs.mjs
// 只覆盖 references/ 与 .catalog.json；INDEX.md 的路由表由人工维护。
import { writeFileSync, mkdirSync, readdirSync, unlinkSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "docs", "zhihu-api");
const refs = join(root, "references");
mkdirSync(refs, { recursive: true });

const res = await fetch("https://developer.zhihu.com/console/api/v3/docs");
if (!res.ok) throw new Error("拉取失败: HTTP " + res.status);
const json = await res.json();

const wanted = new Set();
const catalog = [];
for (const g of json.data) {
  for (const c of (g.children || [])) {
    wanted.add(c.key + ".md");
    writeFileSync(join(refs, c.key + ".md"), (c.content || "").trim() + "\n", "utf8");
    catalog.push({ group: g.title, key: c.key, title: c.title, chars: (c.content || "").length });
  }
}

// 清掉官方已下线的旧分册，避免索引指向空文件
let removed = 0;
for (const f of readdirSync(refs)) {
  if (!wanted.has(f)) { unlinkSync(join(refs, f)); removed++; }
}

writeFileSync(join(root, ".catalog.json"), JSON.stringify(catalog, null, 2), "utf8");
console.log("已同步 " + catalog.length + " 份分册，清理 " + removed + " 份过期文件");
console.log("提醒：若页面有增减，请同步更新 docs/zhihu-api/INDEX.md 的路由表。");
