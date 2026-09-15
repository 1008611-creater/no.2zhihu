# 前端 v2 交付说明（2026-09-15）

> 本文件记录本轮「全站前端重构 v2」的最终状态、验证证据与仍需人工执行的两步。
> 计划原文见 [frontend-v2-progress.md](frontend-v2-progress.md)。

## 一、已交付（代码已合并到 main）

| 计划阶段 | 状态 | 落地位置 |
|---|---|---|
| 3.0 隔离与基线 | ✅ | 分支 `feat/frontend-v2` → PR #3 → squash 合并 |
| 3.1 皮肤与设计系统 | ✅ | `app/globals.css`、`app/frontend-v2.css`、`app/fonts/`（自托管字体） |
| 3.2 动效语言 | ✅ | `lib/motion/tokens.ts`、`components/providers/MotionProvider.tsx`、`components/ui/RouteTransition.tsx` |
| 3.3 路由结构与子界面 | ✅ | `app/(flow)/`、`app/(explore)/`、`app/loading.tsx`、`app/error.tsx`、`app/not-found.tsx` |
| 3.4 跳转与状态传递 | ✅ | `/fill?answerId=&from=`、`components/mirror/InviteDrawer.tsx`、`lib/motion/useInviteUrl.ts` |
| 3.5 可视化 | ✅ | `components/mesh/MeshGraph.tsx`（d3-force）、`components/mirror/EvidenceOverview.tsx` |
| 3.6 看山 IP | ✅ | `public/kanshan/`、`components/kanshan/` |

### 逐项对照原计划

- **子界面**：9 个页面全部收进两个路由分组，各带嵌套 layout；补齐 `loading` / `error` / `not-found` 三类路由反馈。
- **跳转交互**：GSAP 圆形转场（入场 320ms / 出场 200ms）；抽屉补齐 focus trap、ESC 关闭、滚动锁定、`aria-modal`、URL 状态同步（可分享、可后退）。
- **嵌套**：页面由扁平 `<section>` 堆叠改为主区 + 侧栏 + 折叠区；`JourneyNav` 提供步骤导航与面包屑。
- **可视化**：`MeshGraph` 由手写同心环升级为 d3-force 物理布局 + d3-scale，支持拖拽、缩放平移、路径高亮、节点详情浮层；新增证据总览图表与 count-up 数字。
- **动效**：设计规范里的弹簧参数首次真正落地 —— 卡片 `260/26`、缺口 `180/18`、色条 `300/30`、错峰 `0.06`、缺口揭示前 `400ms` 留白；全站统一 reveal 配置；Lenis 平滑滚动；`prefers-reduced-motion` 全链路降级为静态终态。
- **字体**：`next/font/local` 自托管 Space Grotesk + JetBrains Mono，不再回退系统字体。
- **看山**：接入官方素材包（6 段动态 GIF / 6 张静帧 / 3 张三视图），状态表驱动，静态图作 reduced-motion 兜底。

## 二、验证证据

| 验证项 | 证据 |
|---|---|
| 全量类型检查 | 105 个文件，**0 错误**（唯一诊断是与代码无关的 tsconfig `incremental` 提示） |
| 云端 CI | [运行记录](https://github.com/1008611-creater/no.2zhihu/actions/runs/34913290123)：编码检查 / 装依赖 / 类型检查 / 构建 **四步全绿** |
| 代码已合并 | [PR #3](https://github.com/1008611-creater/no.2zhihu/pull/3) 已 squash 合并到 `main` |
| 凭证未入库 | `.env.local`、`.git-remote-token`、`.remote-cache.json` 均已排除；已核对推送树中不含任何密钥文件 |
| 线上服务在线 | `https://zhihu.cauai.fun/api/health` → `{"ok":true,"credentials":true}` |

## 三、仍需人工执行（2 步，各约 1 分钟）

### 1. 让线上站点吃到新代码

线上服务器当前仍在跑旧构建（`/personas` 返回 404 即为证据）。SSH 到服务器执行：

```bash
curl -fsSL https://raw.githubusercontent.com/1008611-creater/no.2zhihu/main/scripts/deploy-server.sh -o deploy-server.sh
sudo bash deploy-server.sh --update
```

脚本会拉取最新 `main`、重新构建并重启服务。跑完访问 `https://zhihu.cauai.fun/personas` 应返回 200。

### 2. 删除明文令牌

`E:\codex\heikesong3\.git-remote-token` 是明文 PAT（已确认未入库）。建议删除并在 GitHub 设置里轮换：

```powershell
Remove-Item E:\codex\heikesong3\.git-remote-token
```

## 四、本会话环境限制（为什么这两步不能由我完成）

本 AI 沙箱禁止启动子进程（`git` / `npm` / `ssh` 一律返回 `EPERM`），因此：

- 构建与类型检查 → 交给 GitHub 云端 CI（已完成）；
- 代码推送 → 走 GitHub HTTP API（已完成）；
- 服务器更新与令牌轮换 → 需要你在本机执行（沙箱无法 SSH）。

原理详见 [agent-environment.md](agent-environment.md)。
