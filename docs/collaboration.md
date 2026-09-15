# 协作分工（二线程模型）

> **2026-09-15 改定。** 此前是「2 个开发 + 1 个审计上线」三线程并行。
> 实测**协调成本超过了并行收益**：分支互相踩、base 反复过期、在落后工作区得出的结论是错的、
> 审计线程还误判过一次（把「树间差异」当成「合并会删掉的东西」）。
> 现在收敛为两条线程 —— **同一时间只有一个活跃的特性分支**，这一类问题从根上消失。

---

## 一、角色

| 线程 | 职责 | 不做 |
|---|---|---|
| **开发线程** | 改代码、自测、提 PR | 不碰服务器、不部署、不合并 |
| **审计上线线程** | 审计 PR、合并、部署、线上复验 | 不写特性代码 |

**关键：同一时间只有一个开发线程在写。** 这是全部简化收益的来源。

---

## 二、已配置的结构性防线

`main` 分支保护已开启（2026-09-15）：

- **必须 `build` 检查通过**（PS1 编码 → `tsc --noEmit` → `next build` → **运行时冒烟**）
- 禁止强推、禁止删除 main
- 已开启 `allow_auto_merge`：提 PR 后可直接开 auto-merge，CI 绿即自动合并

### `strict` 已关闭（同日更晚）

原本开了 `strict: true`（分支必须与 main 同步才能合并）来根治「过期 base」，
但实测**代价高于收益**：每合 1 个 PR，其余在途 PR 全部失效 → 队列长度 N 时
每合 1 个产生 N-1 次人工 rebase（实测合一个 PR 花 10+ 分钟，而 CI 只要 1–2 分钟）。

关掉后不再有 `BEHIND`。安全性改由**部署门控**兜住：
`.github/workflows/ci.yml` 里 `deploy` 的 `needs: build` —— **CI 不过就不部署**，
所以线上永远保持上一个好版本。main 的历史上可能短暂出现坏 commit，
但用户看的是线上，不是 main。

**可逆**：`PATCH /repos/{owner}/{repo}/branches/main/protection/required_status_checks`
传 `{"strict":true,"contexts":["build"]}` 即可开回。

> ⚠️ merge queue 本可替代它，但 GitHub 的 merge queue **只在「组织拥有的公开仓库」可用**；
> 本仓库属于个人账号（`owner_type: User`）→ 用不了。

### 流水线与冒烟检查

CI 与部署是**一条流水线**（`build` → `deploy`），不再是两个并行触发的 workflow。
原先 `ci.yml` 与 `deploy.yml` 都挂在 `push: main` 上，等于**验证还没跑完部署就开始了**。

`build` 阶段会起服务跑 `scripts/smoke.mjs`（8 条断言：5 个页面 + `/api/health`
+ `/api/auth/session` 必须含 `tokenValid` + `/api/auth/user-data` 必须 401）。
它与部署后用的是**同一份脚本** —— 所以「CI 绿而线上红」能直接指向部署/环境问题，不用猜。

### 合并队列怎么处理

`node scripts/audit-merge.mjs --apply` 一次处理整条队列（查冲突 → 同步 base → 等 CI → 合并），
**冲突的自动跳过**（默认 dry-run，需显式 `--apply`）。

> 🚨 **`DIRTY` 在 GitHub 语义里就是「合并有冲突」**，必须与 `CONFLICTING` 一并判 ——
> 踩过：#11/#35 显示 `DIRTY`，却因为 merge-tree 取不到对象被误判成「未判定」而放行。
>
> **它不做自动解冲突**：冲突需要人判断「取哪一侧」，这是审计不可让渡的部分。

---

## 三、开发线程流程

```bash
# 1. 开工前：从最新 main 开始（别用本地旧分支）
git fetch origin main
git checkout -B feat/<名字> origin/main

# 2. 改代码，随时自测
npx tsc --noEmit && npm run build

# 3. 交 PR 前自检
node scripts/verify-merge.mjs feat/<名字>

# 4. 提交推送，开 PR
```

**提交纪律**：
- **不要 `git add -A`** —— 工作区可能有别人的未提交改动。用 `git add -- <精确路径>`，
  提交前 `git diff --cached --numstat` 核对文件数。
- **完成一个可交付单元就立刻 commit + push**。未提交的改动一旦被 `reset` **不可恢复**
  （从未生成 git 对象，`git fsck --lost-found` 也找不到）。
- **不要 `git reset --hard` 清工作区**，会打掉别人未提交的活。

---

## 四、审计上线线程流程

1. **取权威 SHA 一律用远端 API**，不要用本地 `origin/main`：
   ```bash
   gh api repos/1008611-creater/no.2zhihu/commits/main --jq .sha
   ```
   > ⚠️ 本机沙箱会拦截 git 写 refs，`git fetch` 打印成功但 `refs/remotes/origin/main` 可能没落盘。
   > 基于陈旧 ref 的比对会**一直跟错误的 base 比**，把过期分支误判成干净。

2. 校验 base：`git merge-base --is-ancestor <main> <pr_head>`

3. **要看合并的真实效果，就模拟合并**：
   ```bash
   node scripts/verify-merge.mjs <pr-branch>     # 用 merge-tree 在内存里算，不碰工作区
   ```

   > 🚨 **别用 `git diff <main> <pr_head>` 判断「会不会回退」** —— 那是**直接比较两棵树**，
   > 而 `git merge` 对 **PR 未修改的文件会保留 main 的版本**。
   > 曾据此误判「某 PR 合并会回退上一轮的 240 行」，实测模拟合并后标记 8/8 全在。
   > 那些「删除几百行」只是说明分支上该文件是旧版，不代表合并会回退它。

4. 审内容：凭证没外泄、诚实性没破、分层没破

5. 合并 → 部署 → 线上复验

---

## 五、合并前检查清单

- [ ] 用 **API 字面 SHA** 取 main（不用本地 ref）
- [ ] `node scripts/verify-merge.mjs <branch>` 退出码为 **0**
- [ ] PR 的 **`build` 是绿的**（它含 PS1 编码检查 → `tsc` → `next build` → **运行时冒烟**）
- [ ] `mergeable` 不是 `CONFLICTING` / `DIRTY`（**`DIRTY` 就是「有冲突」**，不是「只是落后」）
- [ ] 合并后**不必手动部署**（流水线自动做），跑一次
      `node scripts/smoke.mjs --base https://zhihu.cauai.fun` 复验即可

### 哪些检查必须过、哪些可以忽略（省时间的关键）

分支保护**只要求 `build`**。下面这些失败**不阻塞合并**，追它们是纯浪费时间：

| 检查 | 为什么可以忽略 |
|---|---|
| **Vercel** | 只是备用部署（主站自托管）。且免费版有限流，常报 `rate limited — retry in 24 hours`，与代码无关 |
| **流程变更声明** | 是**提醒**不是门禁。改了 `.github/` / `scripts/` / `AGENTS.md` / 协作文档却没写 `## 流程变更` 时，它会在 PR 对话里留一条 comment（补上声明后自动删除）——check 本身恒绿 |

判据：`gh pr view <n> --json statusCheckRollup` 里，**只有 `build` 的结论决定能不能合**。

### 提交前的队列自检

- 提 PR 前跑 `node scripts/pr-queue.mjs`（在途数 + 两两文件重叠矩阵）
- 与本 PR 目标重叠 ≥50% 的另一个 PR → **停手先问**，不要埋头写完再发现撞车
  （踩过：两条线程各自独立做完同一个 IA 重构，都绿、都改同一批 7 个文件）

---

## 六、服务器注意事项

`/opt/no2zhihu` 是**多站点共用机**（同机还跑 `ans.cauai.fun`、`sub2api`、`omniroute`）。

- **动 nginx / systemd 勿波及他站**
- **构建前确认工作区干净**（Next 会打包工作区文件，不管提交与否）
- **`reset --hard` 前先查 HEAD 是否领先远端**，领先就先 `git branch rescue/<sha>` 存档
- **有并发构建就停手等**（`ps aux | grep 'next build'`）
- **`git checkout` 以 root 写文件** → 构建前 `chown -R no2zhihu:no2zhihu /opt/no2zhihu`
- **构建用 `su - no2zhihu -s /bin/bash -c '...'`**（`sudo -u` 会带回 root 属主 → EACCES）
- **对齐提交用字面 SHA**：`git checkout -B main <sha>`
- **部署前记录回滚点**：`git rev-parse HEAD > /root/no2zhihu-rollback-commit.txt`
- **部署完不要清服务器工作区**

---

## 七、三条铁律与两个工具（多会话隔离与验证）

> 来自 `feat/dev-workflow-guards`。并行会话本身没问题，问题出在**缺少隔离和验证**，
> 于是成本全压在最后一环。这一节给两个最贵的坑各配一条规矩和一个工具。

### 铁律 1：每个会话一个隔离工作区

共用工作副本时，你**未提交**的改动就是「公共资源」——
别人一句 `git reset --hard` 就把它抹掉，而且**不可恢复**：
未 `git add` 的内容从未生成 git 对象，`git fsck --lost-found` 也找不回来。

```bash
node scripts/new-worktree.mjs <会话名>
cd .tools/<会话名>
```

### 铁律 2：完成一个可交付单元就立刻 commit + push

攒着不提交，等于把成果放在别人随时能踩的地方。**推上去才算真正安全。**

只 add 自己的精确路径，提交前核对文件数：

```bash
git add -- <你的文件>
git diff --cached --numstat
```

**绝不 `git add -A`** —— 工作区里混着其他会话未提交的改动。

### 铁律 3：合并前必须跑一次合并校验

**坑（最贵的那个）**：PR 的 base 过期时，它的 tree 里没有别人后来合入的修复。
`git merge` 会报「成功」，却可能把这些修复一起改掉或删掉。
**CI 拦不住** —— CI 只跑 PR 分支自身，看不见 main 上别人新合了什么。

```bash
git fetch origin
node scripts/verify-merge.mjs <pr-branch>
```

判据是：**PR 没碰的文件，合并后不该发生变化。** 变了就说明 base 过期导致内容被回退。

### 两个工具

| 工具 | 作用 | 退出码 |
|---|---|---|
| `scripts/verify-merge.mjs` | 用 `git merge-tree --write-tree` **在内存里**算出合并结果（不碰工作区、不留 merge 状态），检测「静默回退」、列出 main 上未包含的提交、扫禁用词 | 0 可合 / 1 有风险 / 2 用法错 |
| `scripts/new-worktree.mjs` | 建隔离工作区 `.tools/<会话名>`，分支 `feat/<会话名>`，自动链接 `node_modules`、复制 `.env.local` | — |

---

## 八、验证的坑：不要用 curl 验客户端文案

标 `○ (Static)` 的页面（`/` `/mirror` `/square` `/mesh`）**只输出 shell**，
交互内容全在客户端 JS。`curl | grep 文案` 返回 0 **属正常**。

正确验法（服务器上）：

```bash
cd /opt/no2zhihu/.next && grep -rl '<文案>' server static
```

只有**编译产物里也没有**，才是真的没生效。

---

## 九、已知环境不稳定

- **本机 git 写 refs 可能被沙箱拦截**：`git checkout -b` 打印成功但 ref 没落盘 →
  紧接着 `git commit` 会变成**无父的 root-commit**。提交后务必
  `git cat-file -p HEAD` 检查有没有 `parent` 行。
- **`origin/*` 引用可能落不了盘**：用 `git ls-remote` 取真实 sha，必要时用脚本直写
  `.git/refs/remotes/origin/main`。
- **`git worktree` 在本机不可靠**：管理目录 `.git/worktrees/<name>` 会消失 →
  报 `fatal: not a git repository: (NULL)`。需要隔离工作区时改用
  `git clone --local --no-hardlinks --no-checkout <主库> <目标>`。
- **`git rebase` 在本机会因 todo 文件创建失败**（`could not mark as interactive`）→
  改用 `git cherry-pick <sha>` 逐个重放。
- **本机 bash 的 coreutils 不可用**（`ls`/`cat`/`grep`/`find`/`tail`/`date` 全 command not found），
  只有 `git`/`node`/`python`/`ssh`/`scp` 可用。需要管道或复杂命令时走 node 或 python。

<!-- flow-check 行为验证：本行由临时测试 PR 添加，验证后即关闭 -->
