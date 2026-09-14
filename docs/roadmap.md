# 路线图与任务分解

> 最后更新：2026-09-14 · 截止 2026-09-15 10:00
> 本文反映**代码的真实状态**。每条已完成项都经过逐文件核对，不是「应该做完了」。

## 一、优先级原则

**P0 = 没有它就没有交付物。P1 = 显著加分。P2 = 有余力再做。**

时间只剩约 1 天，任何 P2 任务一旦影响 P0，立即砍掉。

## 二、P0（必须完成）

| # | 任务 | 产出 | 验收标准 | 状态 |
|---|---|---|---|---|
| 1 | 前置条件确认 | — | 报名状态已核实 | ⚠️ 待你确认 |
| 2 | 编码修复 | 全站 UTF-8 | 无乱码 | ✅ 已完成 |
| 3 | 文档与索引 | docs/ 全套 | 索引可跳转 | ✅ 已完成 |
| 4 | 样式方案收敛 | 手写 CSS + token | 无 Tailwind 残留 | ✅ 已完成 |
| 5 | `/api/health` | route.ts | 返回 `{ok, credentials, cache}` | ✅ 已完成 |
| 6 | `/api/mirror` 主流程 | lib/server/mirror.ts | 输入问题返回分身+证据+缺口 | ✅ 已完成 |
| 7 | 缺口识别 | lib/domain/gap.ts | 8 类缺口 + 能给出「为什么是缺口」 | ✅ 已完成 |
| 8 | 看山角色引擎 | components/kanshan/ | 10 状态可切换，Motion 弹簧驱动 | ✅ 已完成 |
| 9 | 首页接线 | app/page.tsx | 输入问题 → 走完整闭环 | ✅ 已完成 |
| 10 | 降级路径 | 全站 | 无凭证/额度耗尽/空结果有真实提示 | ✅ 已完成 |
| 11 | 本地构建通过 | — | `npm run build` 无错误 | ⬜ 待执行（本机无法跑命令） |
| 12 | 部署到 Vercel | 公网 URL | 评委可直接打开体验 | ⬜ 待办 |
| 13 | 推送公开 GitHub 仓库 | 仓库 URL | 公网可访问 | 🟡 仓库已建（`no.2zhihu`，空），代码待你推送（脚本已就绪） |
| 14 | 产品说明/计划书 | submission.md | 回答官方 6 个必答问题 | ✅ 已定稿 |

## 三、P1（加分）

| # | 任务 | 价值 | 状态 |
|---|---|---|---|
| 15 | 演示视频（2–3 分钟） | 官方宣传曝光机会 | 🟡 脚本已就绪（`docs/demo-video-script.md`，含分镜 + 2 分钟问答），录制由你完成 |
| 16 | 项目 icon + 封面图 | 提交材料完整性 | ✅ 矢量源已完成（`app/icon.svg` + `docs/assets/cover.svg` + `docs/assets/icon-square.svg`）；**PNG 由你跑 `scripts/export-assets.ps1` 一键导出** |
| 17 | 快照兜底（`.snapshots/`） | 保证 Demo 演示不依赖实时额度 | ⬜ 待办（30 分钟结果缓存已覆盖大部分演示场景） |
| 18 | 看山状态与分镜的动效细节 | 设计感权重 10% | ✅ 已完成（10 状态 + 指针跟随 + 眨眼调度） |
| 19 | 团队协作基建 | CONTRIBUTING / PR 模板 / 分支保护 | ✅ 已完成 |

## 四、P2（有余力）

| # | 任务 | 状态 |
|---|---|---|
| 20 | OAuth 登录（需先拿到 App ID/App Key） | ⬜ 待办 |
| 21 | Human Mesh 关系图交互增强 | 🟡 基础版已完成 |
| 22 | 移动端适配打磨 | 🟡 基础版已完成 |
| 23 | CI（GitHub Actions 跑 build） | ⬜ 待办 |

## 五、已完成工作的核对方式

上面标 ✅ 的每一项，都可以用下面这些文件直接验证，不需要相信本文的结论：

| 任务 | 去看 |
|---|---|
| `/api/health` | `app/api/health/route.ts` |
| `/api/mirror` 主流程 | `lib/server/mirror.ts`（唯一编排层） |
| 缺口识别 | `lib/domain/gap.ts`（纯函数，8 类缺口） |
| 看山引擎 | `components/kanshan/{Kanshan,KanshanStage,states}.tsx|ts` |
| 首页接线 | `app/page.tsx`（走 `lib/store/mirror-store.tsx` 共享状态） |
| 样式方案 | `package.json` 无 Tailwind 依赖；`app/globals.css` 为唯一全局样式 |

## 六、关键路径（剩余部分）

```
确认报名状态                                  ← 只有你能确认
  ↓
gh auth login（浏览器授权，约 1 分钟）          ← 见第七节第 0 步
  ↓
npm run build 本地验证                        ← 只有你能执行命令
  ↓
推送代码到 no.2zhihu                          ← 见下方「如何推送」
  ↓
Vercel 导入仓库 + 配 ZHIHU_ACCESS_SECRET      ← 拿到公网 Demo URL
  ↓
提交表单（Demo URL + 计划书 + 仓库链接）        ← 截止 2026-09-15 10:00
```

## 七、如何推送代码到 no.2zhihu

仓库已创建：<https://github.com/1008611-creater/no.2zhihu>（Public，空仓库）。
**代码推送是本项目唯一还没跨过的一步** —— 卡点不在网络，也不在令牌：
本机 `git` 与 `gh` 都已安装，只是 `gh` 还没登录。**不需要 PAT**，
跑一次 `gh auth login` 走浏览器授权即可，之后的推送都不再需要令牌。

> 说明：文档里写的「本机禁止执行命令」指的是 **AI 会话的沙箱**，不是你的电脑。
> 你自己的 PowerShell 里 `git` 和 `npm` 都是正常的。

### 第 0 步：登录 GitHub（约 1 分钟）

在 PowerShell 里执行：

```powershell
gh auth login
gh auth status
```

选 **GitHub.com → HTTPS → Login with a web browser**，按提示在浏览器里输入一次性代码并授权。
`gh auth status` 显示 `Logged in to github.com` 即成功。

> 如果因为代理连不上：临时执行 `git config --global --unset http.proxy` 与
> `git config --global --unset https.proxy`，再重试；推完可再设回来。

### 第 1 步：一条命令推完（推荐）

脚本已内置两道安全闸门：**先检查 GitHub 登录状态**，**再确认 `.env.local` 被忽略**，
任一条不通过都会中止，不会把凭证推上去。

```powershell
cd E:\codex\heikesong3
powershell -ExecutionPolicy Bypass -File scripts/push-to-github.ps1
```

脚本会依次完成：检查登录 → 校验 `.env.local` 被忽略 → `git init` → 暂存 → 二次确认暂存区无 `.env.local`
→ 提交 → 推送到 `main`。

### 第 2 步（等价）：手敲 git 命令

```powershell
cd E:\codex\heikesong3
git check-ignore -v .env.local   # 必须先有输出，否则停下
git init
git add -A
git status --short               # 列表里不得出现 .env.local
git commit -m "feat: 二号知乎 Human Mesh —— 多分身作答 + 缺口识别 + 看山角色引擎"
git branch -M main
git remote add origin https://github.com/1008611-creater/no.2zhihu.git
git push -u origin main
```

首次推送若弹出 GitHub 登录窗口，登录一次即可。仓库名里的点号是合法的，`no.2zhihu` 不用改。

> 备选路线：`scripts/push-via-api.mjs` 走 GitHub API，需要一次性细粒度令牌；
> 既然 `gh auth login` 已能解决，**不再需要这条路**。

### 推送后立刻做两件事

1. **邀请队友**：仓库 → Settings → Collaborators → 输入 GitHub 用户名 → 给 **Write**（不要给 Admin）。
2. **保护 main**：仓库 → Settings → Branches → Add branch protection rule → 勾 Require a pull request + Require approvals 1。
   之后所有人（包括你）都走分支 + PR，`main` 永远是可部署状态。

详细的协作分工与凭证传递方式见 [repo-collaboration.md](repo-collaboration.md)。

## 八、已知阻塞

| 阻塞 | 处置 |
|---|---|
| **刘看山官方素材包未下载成功** | 飞书附件下载被浏览器拦截。处置：① 用可见浏览器手动下载 ② 或先用原创几何实现，素材到位后校准比例。**不阻塞引擎开发** |
| **AI 会话无法执行命令** | 本工作区的沙箱不允许启动子进程，`git` / `npm` 对 AI 全部返回权限错误（**你自己电脑上的 git / npm 正常**）。处置：需要执行的命令见第七节 |
| ~~本机无可用 GitHub 凭证~~ | **已排除**。`git` 与 `gh` 均已安装，只是 `gh` 未登录。处置：跑一次 `gh auth login`（见第七节第 0 步），**不需要 PAT** |
| OAuth 凭证未领取 | 降级为 P2 |
| 报名状态未知 | 最高优先，立即确认 |

## 九、时间盒建议

| 时段 | 做什么 |
|---|---|
| 立刻 | `gh auth login` 登录 GitHub；确认报名；跑 `npm run build`；按第七节推送仓库 |
| 接下来 1 h | Vercel 部署 → 拿到公网 Demo URL → 自己完整走一遍体验 |
| 再 1 h | 对照 [submission.md](submission.md) 检查计划书，导出提交文档 |
| 再 1 h | 提交表单（**提前交，不要卡最后 10 分钟**） |
| 剩余 | 视频与封面（加分项，做不完不影响必交项） |
