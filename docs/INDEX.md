# 文档索引

> 唯一入口。改代码前先看这里，找对应文档，再动手。
> 最后更新：2026-09-14 ｜ 仓库：https://github.com/1008611-creater/no.2zhihu

## 一、先读这几份

| 顺序 | 文档 | 作用 |
|---|---|---|
| 1 | [../AGENTS.md](../AGENTS.md) | 工程铁律、目录约定、禁止事项。**所有参与者必读** |
| 2 | [../CONTRIBUTING.md](../CONTRIBUTING.md) | 分支模型、提交规范、PR 流程。**动手前必读** |
| 3 | [prd.md](prd.md) | 产品是什么、给谁用、核心闭环、知乎能力映射 |
| 4 | [skill-engineering.md](skill-engineering.md) | **Skill 工程总纲（唯一权威）**：分层模型、7 个 skill 索引、按任务路由表、读法与边界、组合纪律、审计记录、缺口清单 |

> 技术决策看 [architecture.md](architecture.md)（唯一事实源）。
> **只剩交付时**：直接看 [../DEPLOY.md](../DEPLOY.md)（三步）与 [acceptance.md](acceptance.md)（验收）。

## 二、按任务查

前端 v2 当前实现、验证及并发分支问题见 [frontend-v2-progress.md](frontend-v2-progress.md)。

公共人物 / 名人能力蒸馏：先看 [女娲生产与产品接入规范](public-figure-skills.md)，生产任务命中 [女娲适配入口](skills/nuwa/SKILL.md)。工程路由已接入，人物内容和运行时启用需分别验收。

v1 最新收尾证据与构建阻塞见 [v1-closeout-review.md](v1-closeout-review.md)。

| 我要做的事 | 去看 |
|---|---|
| 加入项目、配环境、提 PR | [../CONTRIBUTING.md](../CONTRIBUTING.md) |
| 了解仓库配置、角色权限、分支保护 | [repo-collaboration.md](repo-collaboration.md) |
| 确认比赛规则、截止时间、还缺什么材料 | [prerequisites.md](prerequisites.md) |
| 了解赛道定位、评审权重、答辩话术 | [prd.md](prd.md) |
| 浏览答主名册 / 单个答主档案 | 页面 `/personas` 与 `/personas/<handle>`，数据源 `lib/domain/personas/` |
| 加一个接口 / 改数据流 | [architecture.md](architecture.md) |
| 提交前代码审查 / 找 bug | [skill-engineering.md](skill-engineering.md) §3 #1 → code-review-skill |
| 调样式、加动效、配色 | [design-system.md](design-system.md) |
| 做看山的形象与动效（官方素材映射） | [character-engine.md](character-engine.md) |
| 处理「不能直接发布到知乎」这件事 | [publish-path.md](publish-path.md) |
| 看还剩哪些活、验收标准是什么 | [roadmap.md](roadmap.md) |
| 本地跑起来 / 部署 / 出错 | [runbook.md](runbook.md) |
| 查接口实测结果、额度、错误码 | [api-audit.md](api-audit.md) |
| 查该用哪个 skill / 哪些不要用 / 入口在哪 | [skill-engineering.md](skill-engineering.md) ← **§3 路由表，唯一入口** |
| 查参考项目与本项目的关系 | [references.md](references.md) |
| 查知乎开放平台接口 / 鉴权 / 额度 / MCP | [zhihu-api/INDEX.md](zhihu-api/INDEX.md) ← **先查索引，只读命中的一份** |
| 写计划书 / 提交材料 | [submission.md](submission.md) |
| 交「产品说明计划书」（必交） | [product-plan.md](product-plan.md) |
| 对照 P0 验收项 | [acceptance.md](acceptance.md) |
| 演示 / 录制 / 答辩 | [demo-script.md](demo-script.md) |
| 部署到 Vercel（备用）、配环境变量 | [deployment.md](deployment.md) |
| **部署到自己的服务器（推荐）** | [self-hosting.md](self-hosting.md) ｜ 一条命令：`scripts/deploy-server.sh` |
| 导出封面图 / icon 的 PNG | 跑 `scripts/export-assets.ps1`（产物在 `docs/assets/export/`） |
| PowerShell 老是 5.1 / 想默认用 7.x | 跑 `npm run fix:powershell`，说明见 [agent-environment.md](agent-environment.md) §7 |
| 检查 .ps1 编码是否合规（BOM） | 跑 `npm run check:ps1` |
| AI 说「命令跑不了」/ 推不上仓库 / 构建验证 | [agent-environment.md](agent-environment.md) ← **执行边界与三层解法** |
| 录演示视频 / 准备答辩 | [demo-video-script.md](demo-video-script.md) |

## 三、事实基线（截至 2026-09-14，已核验）

- 截止：**2026-09-15 10:00**，截止后不接受补交。
- 必交：① 公网可访问 Demo ② 产品说明/计划书。
- 选交加分：③ 代码仓库链接 ④ 演示视频。
- 初审权重：AI 场景价值 40% / 创新度 25% / 完成度 25% / 设计感 10%。
- 知乎开放平台**没有写入/发布接口**，全部 54 个条目均为只读 → 见 [publish-path.md](publish-path.md)。
- 官方 Skill 最新版 **0.7.2-beta.20260911131715**（2026-09-12 发布）。
- 刘看山素材与知乎故事素材**仅比赛期间授权**，见 [../NOTICE.md](../NOTICE.md)。
- 搜索类接口的条数参数是 `Count` 不是 `Limit`（传错静默回退 10 条）→ 见 [api-audit.md](api-audit.md)。
- 直答默认**开启**，设 `ZHIHU_USE_ZHIDA=0` 可关（见 [architecture.md](architecture.md)）。
- **GitHub 推送已完成**：`gh auth login` 已登录 `1008611-creater`，无需 PAT；推送脚本内置登录检测与 `.env.local` 泄漏闸门 → 见 [roadmap.md](roadmap.md) 第七节。
- **OAuth 不纳入本次交付**：官方明确「是否接入由作品需求决定」，属选交项；App ID / App Key 在赛事项目创建后才分配到项目详情页，当前「我的项目 = 0」看不到属正常。
- **公网地址定为自托管**：`https://zhihu.cauai.fun` → 服务器 `114.134.185.16`；DNS 托管在 Cloudflare（`cauai.fun`），`zhihu` 记录已添加（灰云，指向 114.134.185.16），站点已上线 → 见 [self-hosting.md](self-hosting.md)。

## 四、外部入口

| 用途 | 地址 |
|---|---|
| **代码仓库（公开）** | https://github.com/1008611-creater/no.2zhihu （已推送，`main` = `a0c30e2`，云端 CI 全绿） |
| 赛事主页 | https://www.zhihu.com/hackathon?activity_code=zhihu_hackathon_2026_p2 |
| 参赛者开发流程文档 | https://pcnsiq9mmnww.feishu.cn/wiki/Pd1UwIIBriW0DBk8qlIczBAVnJc |
| 开发者手册与提交清单 | https://my.feishu.cn/docx/Mc80dR5XvoPaYDxcTasc04POnjd |
| 技术指南 | https://rcnmkynuc7as.feishu.cn/wiki/WAmmw2SqXiNlOQkdeRGcGesenCd |
| 提额申请 | https://my.feishu.cn/wiki/PNKtwTHW6iQhnNk9c78ctfR9nye |
| Access Secret 申请 | https://developer.zhihu.com/profile |
| 官方 Skill 下载 | https://developer-cdn.zhihu.com/zhihu-cli/releases/beta/skill/0.7.2-beta.20260911131715/zhihu-cli-skill-0.7.2-beta.20260911131715.zip |
| 参考项目（动效架构） | https://github.com/blessonism/grok-icon-study |

## 五、目录速查

```
app/                 Next.js App Router 页面与 API 路由
  api/zhihu/*        知乎能力代理（服务端，唯一能碰凭证的地方）
  personas/          答主名册与答主档案（嵌套子页面）
components/          UI 组件
  kanshan/           看山角色引擎（官方素材映射，10 状态）
  mirror/            分身卡 / 回答卡 / 缺口卡 / 搬运面板
  mesh/              Human Mesh 关系图 + 我的搬运清单（MineHandoffPanel）
  ui/                TopBar / QuotaBadge 等通用件
lib/server/          服务端编排（mirror.ts：唯一同时接触 IO 与领域规则的层）
lib/zhihu/           知乎开放平台客户端（server-only）
lib/domain/          纯业务逻辑（无 IO，可测试）
lib/store/           前端共享状态（MirrorProvider）
lib/motion/          动效工具
docs/                本目录
docs/zhihu-api/      知乎开放平台官方接口文档（INDEX.md 为索引，references/ 按需读）
.github/             PR 模板、Issue 模板、云端 CI（workflows/ci.yml）
.official/           官方 Skill 与素材（已 gitignore，不入库）
scripts/             工具脚本（推送 / 部署 / 导出 / 编码检查 / PowerShell 修复）
.refs/               参考项目（已 gitignore，不入库）
.skills/             内置顶级 Skill 工程（7 个，路由见 docs/skill-engineering.md；已 gitignore，用 scripts/fetch-skills.mjs 恢复）
```

## 六、维护约定

- 任何架构或约定变更，**先改文档再改代码**，并在 PR 描述里链接对应章节。
- 每份文档顶部保留「最后更新」日期。
- 新增文档必须在上表登记，否则视为不存在。
