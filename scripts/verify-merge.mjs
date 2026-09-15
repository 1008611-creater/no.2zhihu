#!/usr/bin/env node
/**
 * 合并前校验 —— 专治「过期 base 的 PR 静默回退别人的修复」。
 *
 * ## 为什么 CI 拦不住这个问题
 *
 * CI 只跑 PR 分支自身（类型检查 + 构建），它看不见 main 上别人新合了什么。
 * 而「静默回退」是**合并这个动作**产生的结果：PR 的 base 落后时，
 * 它的 tree 里没有后来别人合入的修复，`git merge` 会报「成功」，
 * 却把那些修复一起删掉。
 *
 * 所以这个检查必须在**本地、合并之前**跑，CI 代替不了。
 *
 * ## 原理
 *
 * 用 `git merge-tree --write-tree` 在不碰工作区的前提下算出合并结果树，
 * 再对比两个集合：
 *
 *   D_pr    = PR 自己删掉的文件   （它的真实意图，合法）
 *   D_merge = 合并结果相对 main 删掉的文件
 *
 * `D_merge - D_pr` 就是**被回退掉的东西** —— 非空即危险。
 *
 * ## 用法
 *
 *   node scripts/verify-merge.mjs <pr-branch> [选项]
 *
 * 选项：
 *   --main <ref>     基线分支，默认自动探测 origin/main，退回 main
 *   --forbid <词>    追加禁用词（可重复），扫描 .next 产物
 *   --skip-forbid    跳过禁用词扫描
 *   --quiet          只输出结论
 *
 * 退出码：
 *   0  可以安全合并
 *   1  有风险，不要合并
 *   2  用法或环境错误
 */

import { spawnSync } from "node:child_process";

const ANSI = Boolean(process.stdout.isTTY);
const wrap = (code, s) => (ANSI ? `\u001b[${code}m${s}\u001b[0m` : s);
const red = (s) => wrap(31, s);
const green = (s) => wrap(32, s);
const yellow = (s) => wrap(33, s);
const dim = (s) => wrap(2, s);
const bold = (s) => wrap(1, s);

let REPO = process.cwd();

function git(args) {
  const r = spawnSync("git", args, {
    cwd: REPO,
    encoding: "utf8",
    maxBuffer: 128 * 1024 * 1024,
  });
  return {
    code: r.status === null ? 1 : r.status,
    out: (r.stdout || "").trim(),
    err: (r.stderr || "").trim(),
  };
}

const lines = (s) => (s ? s.split("\n").map((x) => x.trim()).filter(Boolean) : []);

/** merge-tree 的冲突行格式：`<mode> <oid> <stage>\t<path>`，取 tab 后的路径。 */
const conflictPath = (line) => {
  const i = line.indexOf("\t");
  return i >= 0 ? line.slice(i + 1) : line;
};

// ---------------------------------------------------------------- 参数

const argv = process.argv.slice(2);
const opts = { branch: null, main: null, forbid: [], skipForbid: false, quiet: false };

for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === "--main") opts.main = argv[++i];
  else if (a === "--forbid") opts.forbid.push(argv[++i]);
  else if (a === "--skip-forbid") opts.skipForbid = true;
  else if (a === "--quiet") opts.quiet = true;
  else if (!a.startsWith("--")) opts.branch = a;
}

if (!opts.branch) {
  console.error(
    "用法: node scripts/verify-merge.mjs <pr-branch> [--main <ref>] [--forbid <词>] [--skip-forbid]"
  );
  process.exit(2);
}

// ---------------------------------------------------------------- 环境

{
  const r = spawnSync("git", ["rev-parse", "--show-toplevel"], { encoding: "utf8" });
  if (r.status !== 0) {
    console.error(red("✗ 当前目录不在 git 仓库里"));
    process.exit(2);
  }
  REPO = r.stdout.trim();
}

const say = (s = "") => {
  if (!opts.quiet) console.log(s);
};

say();
say(bold("═".repeat(62)));
say(bold("  合并前校验"));
say(bold("═".repeat(62)));
say(dim(`  仓库：${REPO}`));
say();

// ---------------------------------------------------------------- refs

function resolveRef(candidates) {
  for (const ref of candidates) {
    const r = git(["rev-parse", "--verify", "--quiet", `${ref}^{commit}`]);
    if (r.code === 0 && r.out) return { ref, sha: r.out };
  }
  return null;
}

const mainRef = resolveRef(opts.main ? [opts.main] : ["origin/main", "main"]);
if (!mainRef) {
  console.error(red("✗ 找不到基线分支（试过 origin/main / main）。用 --main <ref> 指定。"));
  process.exit(2);
}

const prRef = resolveRef([opts.branch, `origin/${opts.branch}`]);
if (!prRef) {
  console.error(red(`✗ 找不到分支 ${opts.branch}`));
  console.error(dim("  先 git fetch origin，或检查分支名拼写"));
  process.exit(2);
}

const short = (sha) => sha.slice(0, 8);

// ---------------------------------------------------------------- 1. base 合法性

say(bold("[1/4] 基线合法性"));
const mainDate = git(["log", "-1", "--format=%ci", mainRef.sha]).out;
const prDate = git(["log", "-1", "--format=%ci", prRef.sha]).out;
say(dim(`  main = ${mainRef.ref} @ ${short(mainRef.sha)}  ${mainDate}`));
say(dim(`  PR   = ${opts.branch} @ ${short(prRef.sha)}  ${prDate}`));
say(dim("  提示：origin/* 只是本地缓存，可能陈旧。刚有人推过 main 的话先 git fetch origin"));

const mb = git(["merge-base", mainRef.ref, prRef.sha]);
if (mb.code !== 0 || !mb.out) {
  console.error(red("✗ 算不出 merge-base，两个分支可能没有共同祖先"));
  process.exit(1);
}
const baseSha = mb.out;

const isAncestor = git(["merge-base", "--is-ancestor", mainRef.ref, prRef.sha]).code === 0;
const behind = lines(git(["rev-list", "--count", `${prRef.sha}..${mainRef.ref}`]).out)[0] || "0";
const ahead = lines(git(["rev-list", "--count", `${mainRef.ref}..${prRef.sha}`]).out)[0] || "0";

if (isAncestor) {
  say(green("  ✓ base 是 main 的祖先 —— PR 包含了 main 的全部内容"));
} else {
  say(yellow(`  ⚠ base 已过期：main 领先 ${behind} 个提交，PR 领先 ${ahead} 个提交`));
  say(dim(`    merge-base = ${short(baseSha)}`));
  say(dim("    → 继续做回退检测（下面第 2 步），这一步才是决定性的"));
}
say();

// ---------------------------------------------------------------- 2. 静默回退检测

say(bold("[2/4] 静默回退检测"));
say(dim("  用 merge-tree 在内存里算出合并结果，不碰工作区"));

const mt = git(["merge-tree", "--write-tree", mainRef.ref, prRef.sha]);

if (mt.code !== 0 && !mt.out) {
  say(red("  ✗ merge-tree 不可用（需要 git ≥ 2.38）"));
  say(dim(`    ${mt.err}`));
  say(dim("    → 降级方案：手工跑 git merge --no-commit --no-ff 后检查 git diff --cached"));
  say();
} else {
  const mtLines = lines(mt.out);
  const mergedTree = mtLines[0];
  const conflicts = [...new Set(mtLines.slice(1).map(conflictPath))];

  if (conflicts.length > 0) {
    say(red(`  ✗ 合并有冲突（${conflicts.length} 个文件）—— 必须 rebase 后才能合`));
    for (const f of conflicts.slice(0, 20)) say(red(`      ${f}`));
    if (conflicts.length > 20) say(red(`      ... 还有 ${conflicts.length - 20} 个`));
    say(dim("    有冲突时 merge-tree 的结果不完整，跳过回退分析。"));
    say();
  } else {
    // PR 自己改动的文件（它的合法意图）
    const prTouched = new Set(
      lines(git(["diff", "--name-only", baseSha, prRef.sha]).out)
    );
    // 合并结果相对 main 改动的文件
    const mergeTouched = lines(
      git(["diff", "--name-only", mainRef.ref, mergedTree]).out
    );
    // PR 没碰、合并后却变了的文件 —— 被合并动作意外改动的
    const unexpected = mergeTouched.filter((f) => !prTouched.has(f));

    const mergeDeleted = new Set(
      lines(git(["diff", "--diff-filter=D", "--name-only", mainRef.ref, mergedTree]).out)
    );

    say(dim(`  PR 自己改动 ${prTouched.size} 个文件`));
    say(dim(`  合并结果相对 main 改动 ${mergeTouched.length} 个文件`));

    if (unexpected.length === 0) {
      say(green("  ✓ 没有意外改动 —— 合并只应用 PR 自己的改动，不动 main 的内容"));
    } else {
      say(red(`  ✗ ${unexpected.length} 个 PR 没碰的文件，合并后却变了：`));
      for (const f of unexpected.slice(0, 25)) {
        say(red(`      ${f}${mergeDeleted.has(f) ? "  [被删除]" : ""}`));
      }
      if (unexpected.length > 25) say(red(`      ... 还有 ${unexpected.length - 25} 个`));
      say();
      say(red("    → PR 没碰的文件不该变。变了说明 base 过期导致内容被回退。"));
      say(dim("    → 处理：git rebase origin/main 后重推，再重跑本校验。"));
    }
  }

  // main 新增的文件是否都在合并结果里
  const mainAdded = lines(
    git(["diff", "--diff-filter=A", "--name-only", baseSha, mainRef.ref]).out
  );
  if (mainAdded.length > 0) {
    const missing = [];
    for (const f of mainAdded) {
      const r = git(["cat-file", "-e", `${mergedTree}:${f}`]);
      if (r.code !== 0) missing.push(f);
    }
    if (missing.length === 0) {
      say(green(`  ✓ main 新增的 ${mainAdded.length} 个文件在合并结果里都在`));
    } else {
      say(red(`  ✗ main 新增的 ${missing.length} 个文件在合并结果里丢了：`));
      for (const f of missing.slice(0, 25)) say(red(`      ${f}`));
    }
  }
  say();
}

// ---------------------------------------------------------------- 3. main 上的新提交

say(bold("[3/4] main 上 PR 尚未包含的提交"));
const missingCommits = lines(
  git(["log", "--oneline", "--no-decorate", `${prRef.sha}..${mainRef.ref}`]).out
);
if (missingCommits.length === 0) {
  say(green("  ✓ PR 已包含 main 的全部提交"));
} else {
  for (const line of missingCommits.slice(0, 12)) say(dim(`  ${line}`));
  if (missingCommits.length > 12) say(dim(`  ... 还有 ${missingCommits.length - 12} 条`));
  const files = lines(
    git(["diff", "--name-only", `${prRef.sha}...${mainRef.ref}`]).out
  );
  say(dim(`  这些提交共动了 ${files.length} 个文件`));
  const overlap = lines(git(["diff", "--name-only", baseSha, prRef.sha]).out).filter((f) =>
    files.includes(f)
  );
  if (overlap.length > 0) {
    say(yellow(`  ⚠ 与 PR 改动重叠 ${overlap.length} 个文件（重点看第 2 步结论）：`));
    for (const f of overlap.slice(0, 12)) say(yellow(`      ${f}`));
  }
}
say();

// ---------------------------------------------------------------- 4. 禁用词扫描

const DEFAULT_FORBID = [
  "预置风格设定",
  "尚未经本人语料验证",
  "依据公开资料撰写",
  "依据其公开表达资料撰写",
  "语料待补充",
];

if (opts.skipForbid) {
  say(bold("[4/4] 禁用词扫描"));
  say(dim("  已跳过（--skip-forbid）"));
  say();
} else {
  say(bold("[4/4] 禁用词扫描（.next 产物）"));
  const nextDir = `${REPO}/.next`;
  const fs = await import("node:fs");
  if (!fs.existsSync(nextDir)) {
    say(dim("  没有 .next 目录 —— 先跑 npm run build 才有产物可扫"));
    say();
  } else {
    const words = [...DEFAULT_FORBID, ...opts.forbid];
    const { readdirSync, readFileSync, statSync } = fs;
    const hits = new Map(words.map((w) => [w, []]));

    const walk = (dir) => {
      let entries;
      try {
        entries = readdirSync(dir);
      } catch {
        return;
      }
      for (const name of entries) {
        const p = `${dir}/${name}`;
        let st;
        try {
          st = statSync(p);
        } catch {
          continue;
        }
        if (st.isDirectory()) walk(p);
        else {
          let text;
          try {
            text = readFileSync(p, "utf8");
          } catch {
            continue;
          }
          for (const w of words) {
            if (text.includes(w)) hits.get(w).push(p.slice(REPO.length + 1));
          }
        }
      }
    };
    walk(`${nextDir}/server`);
    walk(`${nextDir}/static`);

    let any = false;
    for (const [w, files] of hits) {
      if (files.length === 0) {
        say(green(`  ✓ ${w}  — 0 命中`));
      } else {
        any = true;
        say(red(`  ✗ ${w}  — ${files.length} 个产物文件命中`));
        for (const f of files.slice(0, 5)) say(dim(`      ${f}`));
      }
    }
    if (any) {
      say(dim("    注意：代码注释里的引用属正常，只有 UI 文案才算违规。"));
    }
    say();
  }
}

// ---------------------------------------------------------------- 结论

say(bold("═".repeat(62)));
say(bold("  结论"));
say(bold("═".repeat(62)));
say();

// 重算一次结论（与上面输出解耦，避免状态耦合）
const mtFinal = git(["merge-tree", "--write-tree", mainRef.ref, prRef.sha]);
let safe = true;
const reasons = [];

if (!isAncestor) {
  reasons.push(`base 落后 main ${behind} 个提交`);
}

if (mtFinal.out) {
  const t = lines(mtFinal.out)[0];
  const conf = [...new Set(lines(mtFinal.out).slice(1).map(conflictPath))];
  if (conf.length > 0) {
    safe = false;
    reasons.push(`合并有 ${conf.length} 个文件冲突`);
  } else {
    const prT = new Set(lines(git(["diff", "--name-only", baseSha, prRef.sha]).out));
    const mgT = lines(git(["diff", "--name-only", mainRef.ref, t]).out);
    const unexp = mgT.filter((f) => !prT.has(f));
    if (unexp.length > 0) {
      safe = false;
      reasons.push(`${unexp.length} 个 PR 没碰的文件在合并后被改动（内容回退）`);
    }
  }
}

if (safe && reasons.length === 0) {
  say(green(bold("  ✓ 可以安全合并")));
} else if (safe) {
  say(yellow(bold("  ⚠ 可以合并，但有需要注意的点：")));
  for (const r of reasons) say(yellow(`      · ${r}`));
  say(dim("    回退检测通过 = 不会删掉别人的东西；base 过期只影响历史是否线性。"));
} else {
  say(red(bold("  ✗ 不要直接合并")));
  for (const r of reasons) say(red(`      · ${r}`));
  say();
  say(dim("  处理："));
  say(dim(`      git branch rescue/${opts.branch.replace(/\//g, "-")}-pre-rebase ${short(prRef.sha)}`));
  say(dim(`      git rebase ${mainRef.ref} ${opts.branch}`));
  say(dim(`      node scripts/verify-merge.mjs ${opts.branch}   # 复验`));
}
say();

process.exit(safe ? 0 : 1);
