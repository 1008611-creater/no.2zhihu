# 二号知乎 · Human Mesh

[![CI](https://github.com/1008611-creater/no.2zhihu/actions/workflows/ci.yml/badge.svg)](https://github.com/1008611-creater/no.2zhihu/actions/workflows/ci.yml)

> 让每个问题，先在另一个知乎里发生。

知乎黑客松 2026 参赛作品。用户提出一个真实问题，看山（刘看山）召集多个由知乎公开回答蒸馏出的
**Skill 分身**分别作答，标出这组回答**共同缺失的那一块**，再把缺口派给真实的人接管。
虚拟回答负责把问题问清楚，真人负责给出只有亲身经历才能给出的答案。

**代码仓库**：<https://github.com/1008611-creater/no.2zhihu>（Public，已推送）
**线上 Demo**：https://zhihu.cauai.fun （已上线）

## 状态

| 阶段 | 状态 |
|---|---|
| 前置条件审计 | 已完成，见 [docs/prerequisites.md](docs/prerequisites.md) |
| PRD / 赛道定位 | 已完成，见 [docs/prd.md](docs/prd.md) |
| 技术架构 | 已定稿，见 [docs/architecture.md](docs/architecture.md) |
| 视觉与动效规范 | 已定稿，见 [docs/design-system.md](docs/design-system.md) |
| 看山角色引擎 | 已实现（10 状态 / Motion 驱动），见 [docs/character-engine.md](docs/character-engine.md) |
| 知乎开放平台接入 | 已接通并实测（搜索 / 热榜 / 问题回答 / 直答 / 问题推荐） |
| GitHub 公开仓库 | ✅ 已推送（Public，main 分支），<https://github.com/1008611-creater/no.2zhihu> |
| 构建验证 | ✅ 云端 CI 已跑通（类型检查 + 构建全绿），见 [Actions](https://github.com/1008611-creater/no.2zhihu/actions) |
| 线上 Demo | ✅ `https://zhihu.cauai.fun`（HTTPS 证书有效，`/api/health` 返回 `credentials: true`） |
| 主流程实测 | ✅ 真实知乎数据跑通（提问 → 选答主 → 证据 → 作答 → 缺口），单次约 19 秒 |

## 快速开始

```bash
npm install
cp .env.example .env.local   # 填入 ZHIHU_ACCESS_SECRET
npm run dev                  # http://localhost:3000
```

环境变量、部署与故障排查见 [docs/runbook.md](docs/runbook.md)。
团队协作（分支、PR、权限、凭证传递）见 [CONTRIBUTING.md](CONTRIBUTING.md) 与 [docs/repo-collaboration.md](docs/repo-collaboration.md)。

## 文档索引

全部文档入口在 [docs/INDEX.md](docs/INDEX.md)。参与开发前请先读 [AGENTS.md](AGENTS.md)。

## 合规

- 知乎开放平台凭证（Access Secret / OAuth Token）只存在服务端环境变量，不进入前端、日志、截图或仓库。
- 知乎内容一律保留作者与来源，不把第三方原文冒充为本作品原创。
- 刘看山形象与知乎故事素材仅在比赛授权范围内使用。
- 参考项目 `.refs/grok-icon-study` 仅用于学习动效架构；其几何与素材归 xAI 所有，本仓库不使用其任何素材。
- 第三方权利与授权边界详见 [NOTICE.md](NOTICE.md)。
