# 线程：审计上线（audit）

- **工作区**：`E:\codex\heikesong3\.tools\rel-20260915`（审计 clone，只读 main）；
  验证用 `.tools/b2new`（main 源码包 + 待验改动）
- **分支**：无常驻分支；只在需要时建临时分支（如 `fix/audit-status-workflow`）
- **正在改**：**只改审计工具与协作护栏** —— `scripts/audit-*.mjs`、
  `scripts/check-thread-declaration.mjs`、`.github/workflows/thread-declaration.yml`。
  **不改任何业务代码**（`app/` `components/` `lib/`）
  （**2026-09-15 晚有一次已结束的例外，见下**）
- **状态**：常驻
- **最后更新**：2026-09-15 23:55
- **职责**：审计内容 → 合并 → 线上复验。**唯一的合并与上线决策者**；
  开发线程只提 PR，不合并、不部署。
- **不做什么**：不替开发线程改业务代码；不机械解语义冲突（会在 PR 上写清成因与建议解法）
- **怎么跟我沟通**：**在 PR 上写清楚**即可 —— 我看所有 PR，是天然的全局信息枢纽。
  若某条结论要传给别人（例如「A 线程的做法 B 线程也该知道」），我会在对应 PR 上转述。

## 2026-09-15 晚 · 一次例外（已结束，已回归常态）

老大直接发来 4 条实机反馈（含截图）并要求本线程修完，于是本线程临时承担了开发角色：

| PR | 内容 | 状态 |
|---|---|---|
| #54 | 右栏被切掉 / 滚不动；「查看详情」「互相回应」两处报错；名册浮层被后面的卡片盖住 | 已合并 · 线上复验 43/43 |
| #56 | 复验 #54 时发现：`prefers-reduced-motion: reduce` 下 `/square` 有概率**永久卡死**（React #418 → #329，effect 从未运行） | 已合并 · 线上复验 |
| #58 | #54 没碰到的残留坑：`/api/mirror/debate` 的 zod 上限 `entries.max(8)` / `body.max(4000)` 是照「模型回答」拍的，但收的是**用户已拿到的回答正文** → 邀请 >8 位、长回答 >4000 字必 400，且报错是英文直接弹给用户。放宽到 **24 / 8000**，四条约束全换中文文案，`DebatePanel` 客户端同步裁剪 + `AbortController(120s)` | 已合并 · 线上复验（12 条 / 6000 字 → 200；25 条 / 1 条 → 中文 400） |

两条都补了可执行自检（`check-mirror-shape.mjs` / `check-hydration-safety.mjs`，已进 `check:logic`）。
例外到此为止 —— 之后仍按上面的边界走。

## ⚠️ 给下一个用本机的人：这里的 git 不可信

沙箱里 git **写不进 `.git/refs` 与索引**：`git checkout -b` 报「Switched to a new branch」
但分支 ref 不落盘，`HEAD` 随即变成 unborn，然后 `git status` 会把**整个仓库显示成新增文件**
（本次因此误判过一次：以为 295 个文件被 staged）。`git reset --mixed HEAD` 也清不掉索引。

所以在本机：

- 取 base / 对照版本：用 `git show <sha>:<path>`（**对象库是好的**），
  或直接下载 `https://codeload.github.com/<owner>/<repo>/tar.gz/<sha>` 源码包逐字节对比
- 提交：走 GitHub Git Data API（blobs → tree(base_tree) → commit → ref），
  `scripts/push-via-api.mjs` 是现成脚本
- `preflight.mjs` / `verify-merge.mjs` 依赖 `git diff`，在这里**跑不了** ——
  要做等价检查（查重 / 接线 / 产物）并在 PR 描述里说明跳过的原因

## 收到但暂不采纳的移交项（来自 #62，2026-09-15）

dev-square-source 线程收工时移交本线程两条，裁决如下 —— **都先不动**，理由写在这里，
免得下一个人又当成 bug 修一遍：

1. **直答额度口径「不一致」**（`AGENTS.md` §1.5 写 100/天，`/api/v1/quota` 实测 5000/天）。
   **不是缺陷**：§1.5 那句是**自我约束的支出上限**（「不滥用额度」），不是对平台配额的陈述；
   自限比平台给的更严，方向是对的。`lib/server/mirror.ts` 按更小的数算预算也是对的。
   若嫌歧义，正确的改法是**加半句说明**（「平台发放 5000/天，本仓库自限 100/天」），
   而不是把 100 改成 5000 —— 后者是把节流阀拆了。
2. **`docs/product-plan.md:95` 仍写「预置 6 位」**：内部计划文档，记录的是演进过程，
   不是对外的提交物（对外的 `docs/submission.md` 已在 #61 改对）。按历史记录保留。

## 已知但未修（部署打断在途会话）

每次构建都会替换 `.next/static` → 页面上还开着旧 HTML 的用户会在下次点击时拿到
`/_next/static/chunks/...` 的 500（本次 23:33 部署的日志里能看到十几条）。
**不是回归**，是既有取舍（见 MEMORY「部署打断在途会话」）。真要修得改部署流程
（先构建到临时目录再原子切换），属 CI/部署改动，不在本线程边界内 —— 留给专门线程。
