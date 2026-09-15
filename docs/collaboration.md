# 多会话协作约定

本仓库同时有多个 agent 会话在开发（本机工作区与服务器 `/opt/no2zhihu` 都是共用的）。
并行本身没问题，问题出在**缺少隔离和验证**。本文记录踩过的坑与对应的硬规矩。

---

## 一、三条铁律

### 铁律 1：每个会话一个 worktree

**坑**：所有会话共用一个工作副本，你**未提交**的改动就是「公共资源」。
别人一句 `git reset --hard` 就把它抹掉，而且**不可恢复** ——
未 `git add` 的内容从未生成 git 对象，`git fsck --lost-found` 也找不回来。
（已实际发生：25 个文件的改动整体消失，靠一份外置 diff 备份才救回。）

**做法**：

```bash
node scripts/new-worktree.mjs <会话名>
cd .tools/<会话名>
```

每个会话有自己的工作目录，共享同一个 `.git` 对象库。
别人的 reset 只影响他自己的目录。

### 铁律 2：完成一个可交付单元就立刻 commit + push

**坑**：攒着不提交，等于把成果放在别人随时能踩的地方。

**做法**：一个能独立说清楚的小改动做完，立刻提交并推上去。
**推上去才算真正安全。**

提交时**只 add 自己的精确路径**：

```bash
git add -- <你的文件>
git diff --cached --numstat      # 核对文件数，别多别少
```

**绝不要 `git add -A`** —— 工作区里混着其他会话未提交的改动。

### 铁律 3：合并前必须跑一次合并校验

**坑（最贵的那个）**：PR 的 base 过期时，它的 tree 里没有别人后来合入的修复。
`git merge` 会报「成功」，却可能把这些修复一起改掉或删掉。
**CI 拦不住** —— CI 只跑 PR 分支自身，看不见 main 上别人新合了什么。

**做法**：

```bash
git fetch origin
node scripts/verify-merge.mjs <pr-branch>
```

判据是：**PR 没碰的文件，合并后不该发生变化。**
变了就说明 base 过期导致内容被回退，退出码为 1。

---

## 二、两个工具

### `scripts/verify-merge.mjs` —— 合并前校验

```bash
node scripts/verify-merge.mjs <pr-branch> [--main <ref>] [--forbid <词>] [--skip-forbid]
```

| 步骤 | 检查内容 |
|---|---|
| 1 | base 是否为 main 的祖先，落后多少提交 |
| 2 | **静默回退检测**：用 `merge-tree` 在内存里算合并结果，找出「PR 没碰却变了」的文件 |
| 3 | 列出 main 上 PR 尚未包含的提交，以及与 PR 改动重叠的文件 |
| 4 | 禁用词扫描（扫 `.next` 产物，不是 curl HTML） |

退出码：`0` 可安全合并 / `1` 有风险 / `2` 用法或环境错误。

**它不碰工作区** —— 用 `git merge-tree --write-tree` 在内存里算，不会留下 merge 状态。

### `scripts/new-worktree.mjs` —— 创建隔离工作区

```bash
node scripts/new-worktree.mjs <会话名> [--base <ref>] [--no-link] [--dry-run]
```

建在 `.tools/<会话名>`，分支 `feat/<会话名>`，自动链接主仓库的 `node_modules`
并复制 `.env.local`。用完 `git worktree remove .tools/<会话名>` 清理。

---

## 三、合并前检查清单

上线线程合并一个 PR 前，逐项确认：

- [ ] `git fetch origin` —— 本地 `origin/*` 只是缓存，可能陈旧
- [ ] `node scripts/verify-merge.mjs <branch>` —— **退出码必须是 0**
- [ ] PR 页面 CI 是绿的（类型检查 + 构建）
- [ ] 若校验报「PR 没碰的文件被改动」→ 先 rebase 再合，**不要硬合**
- [ ] 合并后部署，并按该 PR 的验收项在浏览器实测

---

## 四、验证的坑：不要用 curl 验客户端文案

标 `○ (Static)` 的页面（`/` `/mirror` `/square` `/mesh`）**只输出 shell**，
交互内容全在客户端 JS 里。`curl | grep 文案` 返回 0 **属正常**，不能据此判断失败。

正确验法（在服务器上）：

```bash
cd /opt/no2zhihu/.next
grep -rl '<文案>' server static
```

只有**编译产物里也没有**，才是真的没生效。

---

## 五、服务器注意事项

服务器 `/opt/no2zhihu` 同样是共用工作区，且是**多站点共用机**
（同机还跑 `ans.cauai.fun`、`sub2api`、`omniroute`）。

- **动 nginx / systemd 时勿波及他站**
- **构建前确认工作区干净**：Next 构建会打包工作区文件，不管提交与否
- **`git reset --hard` 前先查 HEAD 是否领先 origin/main**：
  ```bash
  git merge-base --is-ancestor origin/main HEAD && echo SAFE || echo "⚠️ 先存档"
  ```
- **构建用 `su -` 而不是 `sudo -u`**（后者会带回 root 属主，导致下次构建 EACCES）
- **部署完不要清服务器工作区** —— 里面可能有别人正在写的改动

---

## 六、已知的环境不稳定

- **本机 git 写 refs 可能被沙箱拦截**：`git checkout -b` 会打印成功但 ref 没落盘，
  紧接着 `git commit` 会变成**无父提交的 root-commit**。
  提交后务必 `git cat-file -p HEAD` 检查有没有 `parent` 行。
- **`origin/*` 引用可能落不了盘或事后消失**：用 `git ls-remote origin refs/heads/main`
  取真实 sha，必要时用脚本直接写 `.git/refs/remotes/origin/main`。
- **本机 bash 的 coreutils 不可用**（`ls`/`cat`/`grep`/`find`/`tail`/`date` 全部 command not found），
  只有 `git`/`node`/`python`/`ssh`/`scp` 可用。需要管道或复杂命令时走 node 或 python。
