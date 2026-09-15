#!/usr/bin/env node
/**
 * 拉取项目内置的顶级 Skill 快照到 .skills/。
 *
 * 为什么需要这个脚本：.skills/ 体积较大（约 70MB）且属第三方作品，
 * 不纳入 git（见 .gitignore）。新克隆的仓库用本脚本恢复，保证任何线程都能拿到同一组 skill。
 *
 * 用法：node scripts/fetch-skills.mjs
 */
import { mkdir, writeFile, readdir, readFile } from "node:fs/promises";
import { join, dirname, resolve, relative, isAbsolute } from "node:path";
import { fileURLToPath } from "node:url";
import { inflateRawSync } from "node:zlib";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const TARGET = join(ROOT, ".skills");

/** 与 docs/skill-engineering.md §2 索引表保持同步。改一处必须改另一处。 */
const SKILLS = [
  { repo: "alchaincyf/nuwa-skill", branch: "main", commit: "fe0374687037c4cc51a65c1e0c145afe2981dc69" },
  { repo: "awesome-skills/code-review-skill",        branch: "main" },
  { repo: "nextlevelbuilder/ui-ux-pro-max-skill",    branch: "main" },
  { repo: "bendrape1-byte/silk-design",              branch: "main" },
  { repo: "AThevon/genjutsu",                        branch: "main" },
  { repo: "Vincentwei1021/video-talkcraft",          branch: "main" },
  { repo: "AgriciDaniel/banana-claude",              branch: "main" },
  { repo: "SamurAIGPT/Generative-Media-Skills",      branch: "main" },
  { repo: "blader/humanizer",                        branch: "main" },
];

/** 最小 zip 解包：只用 Node 内置 zlib，避免依赖外部命令。 */
function unzip(buf) {
  let eocd = -1;
  for (let i = buf.length - 22; i >= 0 && i > buf.length - 70000; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error("zip: EOCD not found");
  const count = buf.readUInt16LE(eocd + 10);
  let off = buf.readUInt32LE(eocd + 16);
  const files = [];
  for (let n = 0; n < count; n++) {
    if (buf.readUInt32LE(off) !== 0x02014b50) throw new Error("zip: bad central directory");
    const method = buf.readUInt16LE(off + 10);
    const compSize = buf.readUInt32LE(off + 20);
    const nameLen = buf.readUInt16LE(off + 28);
    const extraLen = buf.readUInt16LE(off + 30);
    const commentLen = buf.readUInt16LE(off + 32);
    const localOff = buf.readUInt32LE(off + 42);
    const name = buf.toString("utf8", off + 46, off + 46 + nameLen);
    const lnameLen = buf.readUInt16LE(localOff + 26);
    const lextraLen = buf.readUInt16LE(localOff + 28);
    const dataStart = localOff + 30 + lnameLen + lextraLen;
    const comp = buf.subarray(dataStart, dataStart + compSize);
    let data;
    if (method === 0) data = comp;
    else if (method === 8) data = inflateRawSync(comp);
    else throw new Error("zip: unsupported method " + method);
    files.push({ name, data });
    off += 46 + nameLen + extraLen + commentLen;
  }
  return files;
}

async function fetchSkill({ repo, branch, commit }) {
  const url = `https://codeload.github.com/${repo}/zip/${commit ?? `refs/heads/${branch}`}`;
  const res = await fetch(url, { headers: { "User-Agent": "codex" } });
  if (!res.ok) throw new Error(`${repo}: HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  const files = unzip(buf);
  const top = files[0].name.split("/")[0];
  const directory = repo.split("/")[1] + "-" + branch;
  const destinationRoot = resolve(TARGET, directory);
  let written = 0;
  for (const f of files) {
    if (f.name.endsWith("/")) continue;
    const rel = f.name.slice(top.length + 1);
    if (!rel) continue;
    const dest = resolve(destinationRoot, rel);
    const within = relative(destinationRoot, dest);
    if (within.startsWith("..") || isAbsolute(within)) throw new Error("zip: unsafe path");
    await mkdir(dirname(dest), { recursive: true });
    await writeFile(dest, f.data);
    written++;
  }
  if (commit) await writeFile(join(destinationRoot, ".upstream-commit"), commit + "\n");
  return { top: directory, written, mb: (buf.length / 1048576).toFixed(1) };
}

await mkdir(TARGET, { recursive: true });
const existing = new Set(await readdir(TARGET).catch(() => []));
for (const s of SKILLS) {
  const only = process.argv.find(a => a.startsWith("--only="))?.slice(7);
  if (only && s.repo !== only) continue;
  const guess = s.repo.split("/")[1] + "-main";
  if (existing.has(guess)) {
    if (s.commit) {
      const installed = await readFile(join(TARGET, guess, ".upstream-commit"), "utf8").catch(() => "");
      if (installed.trim() !== s.commit) {
        console.error(`fail  ${guess}: existing installation is unverified; preserve it and install into a clean directory`);
        process.exitCode = 1;
        continue;
      }
    }
    console.log(`skip  ${guess} (already present)`); continue;
  }
  try {
    const r = await fetchSkill(s);
    console.log(`ok    ${s.repo} -> ${r.top}/ (${r.written} files, ${r.mb}MB)`);
  } catch (e) {
    console.error(`fail  ${s.repo}: ${e.message}`);
    process.exitCode = 1;
  }
}
console.log("\nDone. 入口与路由见 docs/skill-engineering.md §2 / §3");
