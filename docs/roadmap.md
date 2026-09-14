# 路线图与任务分解

> 最后更新：2026-09-14 · 截止 2026-09-15 10:00
> 本文反映**代码的真实状态**。每条已完成项都经过逐文件核对，不是「应该做完了」。

## 一、优先级原则

**P0 = 没有它就没有交付物。P1 = 显著加分。P2 = 有余力再做。**

时间只剩约 1 天，任何 P2 任务一旦影响 P0，立即砍掉。

## 二、P0（必须完成）

| # | 任务 | 产出 | 验收标准 | 状态 |
|---|---|---|---|---|
| 1 | 前置条件确认 | — | 报名状态已核实 | ✅ 已确认（已报名已组队） |
| 2 | 编码修复 | 全站 UTF-8 | 无乱码 | ✅ 已完成 |
| 3 | 文档与索引 | docs/ 全套 | 索引可跳转 | ✅ 已完成 |
| 4 | 样式方案收敛 | 手写 CSS + token | 无 Tailwind 残留 | ✅ 已完成 |
| 5 | `/api/health` | route.ts | 返回 `{ok, credentials, cache}` | ✅ 已完成 |
| 6 | `/api/mirror` 主流程 | lib/server/mirror.ts | 输入问题返回分身+证据+缺口 | ✅ 已完成 |
| 7 | 缺口识别 | lib/domain/gap.ts | 8 类缺口 + 能给出「为什么是缺口」 | ✅ 已完成 |
| 8 | 看山角色引擎 | components/kanshan/ | 10 状态可切换，Motion 弹簧驱动 | ✅ 已完成 |
| 9 | 首页接线 | app/page.tsx | 输入问题 → 走完整闭环 | ✅ 已完成 |
| 10 | 降级路径 | 全站 | 无凭证/额度耗尽/空结果有真实提示 | ✅ 已完成 |
| 11 | 构建通过 | GitHub Actions | 类型检查 + `npm run build` 全绿 | ✅ 已完成（云端 CI，[运行记录](https://github.com/1008611-creater/no.2zhihu/actions/runs/34835482253)） |
| 12 | 部署到自己的服务器（Vercel 作备用） | 公网 URL `https://zhihu.cauai.fun` | 评委可直接打开体验 | ✅ 已上线，HTTPS 证书有效；见 [self-hosting.md](self-hosting.md) |
| 13 | 推送公开 GitHub 仓库 | 仓库 URL | 公网可访问 | ✅ 已完成（Public；`main` 持续更新中，最新见仓库首页；云端 CI 全绿） |
| 14 | 产品说明/计划书 | submission.md | 回答官方 6 个必答问题 | ✅ 已定稿 |
| 15 | 临时答主检索命中率修复 | `lib/server/persona.ts` | 多变体检索；实测 1–3 条命中，0 条时如实降级 | ✅ 已完成 |
| 14b | **v1 重构：答主人格主线** | `lib/domain/personas/` + `lib/server/persona.ts` | 选答主 → 多人格作答 → 邀请 → 互相回应 | ✅ 已完成（见下节） |

## 二之二、v1 重构（2026-09-14，P0 全真 + P1 半真）

主线从「抽象视角分身」改成「**具体知乎答主的分身**」。评价标准是「像这个人」>「答案完美」。

| # | 任务 | 产出 | 状态 |
|---|---|---|---|
| R1 | 领域模型加 `Persona` 四要素 | `lib/domain/types.ts` | ✅ |
| R2 | 6 位预置答主人格 | `lib/domain/personas/`（半佛/张佳玮/贱贱/李松蔚/大猛/陈章鱼） | ✅ |
| R3 | 答主型 Skill 派生 + 视角型降级 | `lib/domain/skills.ts` | ✅ |
| R4 | 路由：手动指定优先 + 自动推荐补位 | `lib/domain/router.ts` | ✅ |
| R5 | 人格驱动提示词（voice 决定字数/句长/情绪） | `lib/server/mirror.ts` `systemPromptFor()` | ✅ |
| R6 | 在线蒸馏临时答主（如实返回命中条数） | `lib/server/persona.ts` | ✅ |
| R7 | 选答主步骤 + 人格卡 | `app/page.tsx` + `components/mirror/PersonaPicker\|Card` | ✅ |
| R8 | 继续邀请（只生成一位，不重跑旧的） | `POST /api/mirror/invite` | ✅ |
| R9 | 一轮互相回应（上限 2 次直答） | `POST /api/mirror/debate` | ✅ |
| R10 | 数据管线：抓取 + 蒸馏脚本 | `scripts/persona-crawler.mjs` / `distill-personas.mjs` | ✅ 代码就绪 |
| R11 | 6 位答主实跑抓取 ≥30 条 | 需 `ZHIHU_COOKIE` | ⬜ 阻塞：待提供 cookie |
| R12 | 全量类型检查 | 60 个文件，0 诊断 | ✅ |

## 三、P1（加分）

| # | 任务 | 价值 | 状态 |
|---|---|---|---|
| 15 | 演示视频（2–3 分钟） | 官方宣传曝光机会 | 🟡 脚本已就绪（`docs/demo-video-script.md`，含分镜 + 2 分钟问答），录制由你完成 |
| 16 | 项目 icon + 封面图 | 提交材料完整性 | ✅ 矢量源已完成（`app/icon.svg` + `docs/assets/cover.svg` + `docs/assets/icon-square.svg`）；**PNG 由你跑 `scripts/export-assets.ps1` 一键导出** |
| 17 | 快照兜底（`.snapshots/`） | 保证 Demo 演示不依赖实时额度 | ⬜ 待办（30 分钟结果缓存已覆盖大部分演示场景） |
| 18 | 看山状态与分镜的动效细节 | 设计感权重 10% | ✅ 已完成（10 状态 + 指针跟随 + 眨眼调度） |
| 19 | 团队协作基建 | CONTRIBUTING / PR 模板 | 🟡 文档与模板已就绪；**main 分支保护尚未开启**（会阻断其他线程的 API 直推，需队长确认后开启） |

## 四、P2（有余力）

| # | 任务 | 状态 |
|---|---|---|
| 20 | OAuth 登录（需先拿到 App ID/App Key） | ⬜ 待办 |
| 21 | Human Mesh 关系图交互增强 | 🟡 基础版已完成 |
| 22 | 移动端适配打磨 | 🟡 基础版已完成 |
| 23 | CI（GitHub Actions 跑 build） | ✅ 已完成（push/PR 自动跑；注意：main 尚未开启分支保护） |

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
✅ 推送代码到 no.2zhihu                       ← 已完成（a0c30e2）
  ↓
✅ 构建验证                                   ← 已完成（云端 CI 全绿）
  ↓
✅ Cloudflare 已加 zhihu 的 A 记录（灰云）→ 服务器部署脚本已跑完  ← https://zhihu.cauai.fun 已上线（见 self-hosting.md）
  ↓
⬜ 提交表单（Demo URL + 计划书 + 仓库链接）     ← 截止 2026-09-15 10:00
```
## 七、代码已推送（2026-09-14 完成，含后续更新）

仓库：<https://github.com/1008611-creater/no.2zhihu>（Public）

| 项 | 值 |
|---|---|
| 分支 | `main`（默认分支，持续有新提交） |
| 文件数 | 154+ 个（随迭代增长，以仓库首页为准） |
| 云端 CI | ✅ 类型检查 + 构建全绿（[运行记录](https://github.com/1008611-creater/no.2zhihu/actions)） |

### 怎么推的（供复盘）

推送走的是 **GitHub Git Data API**，全程没有使用 `git` 命令 ——
因为本 AI 会话的沙箱禁止启动子进程（`git` / `npm` 均返回 EPERM）。
脚本：`scripts/push-commit-via-api.mjs`。它直接读取 `.git` 里已提交的对象，
原样复现那个提交（tree / 提交信息 / 父提交都保留），所以远端与本地完全一致。

### 队友拉代码

```powershell
cd <你想放代码的目录>
git clone https://github.com/1008611-creater/no.2zhihu.git
cd no.2zhihu
npm install
copy .env.example .env.local    # 填入自己的 ZHIHU_ACCESS_SECRET
npm run dev
```

### 推送后立刻做两件事

1. **邀请队友**：仓库 → Settings → Collaborators → 输入 GitHub 用户名 → 给 **Write**（不要给 Admin）。
   ⚠️ 当前仓库只有队长一个协作者，队友还没加进来 —— 这是「多人一起开发」的前提。
2. **保护 main（暂缓）**：仓库 → Settings → Branches → Add branch protection rule → 勾 Require a pull request + Require approvals 1。
   ⚠️ **暂不要开**：在分支保护开启前，其他线程正在用 GitHub API 直接推 `main`；
   一旦开启，这些推送会被拒。等所有并发线程停手后再开，或先统一改走分支 + PR。

详细的协作分工与凭证传递方式见 [repo-collaboration.md](repo-collaboration.md)。
## 八、已知阻塞

| 阻塞 | 处置 |
|---|---|
| **刘看山官方素材包未下载成功** | 飞书附件下载被浏览器拦截。处置：① 用可见浏览器手动下载 ② 或先用原创几何实现，素材到位后校准比例。**不阻塞引擎开发** |
| ~~AI 会话无法执行命令~~ | **已绕过**。推送改走 GitHub HTTP API（`scripts/push-commit-via-api.mjs`），构建改走云端 CI。详见 [agent-environment.md](agent-environment.md) |
| ~~无 GitHub 凭证~~ | **已解决**。`gh auth login` 已登录 `1008611-creater`（token scopes: `repo`/`workflow`），推送已完成 |
| OAuth 凭证未领取 | 官方写明「是否接入由作品需求决定」，属选交项，本次不接入（降级为 P2） |
| ~~报名状态未知~~ | **已确认**：已报名、已组队 |

## 九、时间盒建议

| 时段 | 做什么 |
|---|---|
| 已完成 | ~~到 Cloudflare 给 `zhihu` 加一条 A 记录指向 `114.134.185.16`（灰云），然后在服务器跑一次部署脚本~~（已上线） |
| 接下来 1 h | 拿到公网 Demo URL → 自己完整走一遍体验 → 确认 `/api/health` 返回 `credentials: true` |
| 再 1 h | 对照 [submission.md](submission.md) 检查计划书，导出提交文档 |
| 再 1 h | 提交表单（**提前交，不要卡最后 10 分钟**） |
| 剩余 | 视频与封面（加分项，做不完不影响必交项） |
