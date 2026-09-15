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

- **必须 `build` 检查通过**（PS1 编码 → `tsc --noEmit` → `next build`）
- **分支必须与 main 同步才能合并**（`strict: true`）← **这条根治「过期 base」**
- 禁止强推、禁止删除 main

**效果**：base 过期时 GitHub 会直接禁用合并按钮并提示 `This branch is out-of-date`。
解法是点仓库页面的 **「Update branch」**，或本地同步后再推。

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
- [ ] PR 页面 CI 绿（`build`）
- [ ] 分支已与 main 同步（分支保护会强制）
- [ ] 合并后部署，并在浏览器实测该 PR 的验收项

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

## 七、验证的坑：不要用 curl 验客户端文案

标 `○ (Static)` 的页面（`/` `/mirror` `/square` `/mesh`）**只输出 shell**，
交互内容全在客户端 JS。`curl | grep 文案` 返回 0 **属正常**。

正确验法（服务器上）：

```bash
cd /opt/no2zhihu/.next && grep -rl '<文案>' server static
```

只有**编译产物里也没有**，才是真的没生效。

---

## 八、已知环境不稳定

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
