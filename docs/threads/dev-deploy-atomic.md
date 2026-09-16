# 线程：dev-deploy-atomic（原子部署）

- **工作区**：`E:\codex\_devwork\dev-deploy-atomic`（main 源码包解压，无 `.git`；
  `node_modules` 是指向 `E:\codex\heikesong3\node_modules` 的 junction）
- **分支**：`fix/atomic-deploy` @ 基线 `3d0f6eda`
- **正在改**：
  - `.github/workflows/ci.yml`
  - `next.config.js`
  - `package.json`
  - `scripts/deploy-atomic.sh`（新增）
  - `scripts/check-atomic-deploy.mjs`（新增）
  - `scripts/deploy-server.sh`
  - `docs/self-hosting.md`
  - `docs/threads/dev-deploy-atomic.md`（本文件）
- **状态**：进行中
- **最后更新**：2026-09-16 16:35
- **备注**：修审计线程移交的「部署打断在途会话」（`docs/threads/audit.md` 明写
  「属 CI/部署改动，不在本线程边界内 —— 留给专门线程」）。

## 在解决什么

旧流程 `git reset --hard → npm run build → restart` 里，`next build` 会**原地替换 `.next/static`**。
在 1~3 分钟的构建窗口里，线上进程还活着、旧 HTML 已经发给浏览器了，
但它引用的 `/_next/static/chunks/*.js` 已不在磁盘上 → 用户点一下就 `ChunkLoadError`。

**实测对照**（本机复刻两种流程，构建窗口内每 50ms 轮询那个 chunk 是否还在）：

| 流程 | 构建窗口内「chunk 不可达」占比 | 切换耗时 |
|---|---|---|
| 旧：先删 `.next` 再构建 | **46.5%** | — |
| 新：构建到 `.next.new` 再原子切换 | **0.0%** | **45.3 ms** |

> 如实说明量级差异：本机构建约 30 秒，服务器约 1~3 分钟 —— **线上窗口比 46.5% 更宽**。
> 另：审计线程记的是「拿到 500」，我在现网实测**未知 chunk 返回的是 404 +
> `content-type: text/html`**（nginx 日志里 `/_next/static` 的 5xx **为 0**）。
> 两者都会让浏览器抛 `ChunkLoadError`，但具体状态码我按实测写 404，不沿用 500。

## 与其它线程的避让（发现并处理了一次同文件冲突）

`#77`（`feat/square-ui`）零重叠；`#78`（`fix/persona-page-metadata`）**在 `package.json` 上重叠**：

- #78 改的是 `check:logic` **那一行**（加 `check:meta`）
- 我原本也要把 `check:deploy` 挂进 `check:logic` → **会撞在同一行**

**处理**：我不动 `check:logic`，改为
① `package.json` 只**新增**一行 `check:deploy`（不碰 `check:logic`）；
② 自检作为 **`ci.yml` 里独立的一步**执行（`ci.yml` 是我的文件，与 #78 零重叠）。
两者合并顺序不影响结果。

其余文件（`next.config.js` / `scripts/deploy-*.sh` / `docs/self-hosting.md` / `scripts/check-atomic-deploy.mjs`）
全仓无第二方在动。已用 API 拉取 #77 / #78 的文件清单逐个核对。

## 边界

只动 CI / 部署脚本 / `next.config.js` / 部署文档。
**不碰** `app/` `components/` `lib/` `public/`，不碰 `scripts/smoke.mjs`（复用，不改）。
不合并、不部署。
