# 贡献指南

> 知乎黑客松 2026 · 二号知乎 · Human Mesh
> 任何改动在合并前都要过这里的所有检查项。

## 一、先读什么

动手前按顺序读这三份，不要跳：

1. [AGENTS.md](AGENTS.md) —— 工程铁律、目录约定、禁止事项。
2. [docs/INDEX.md](docs/INDEX.md) —— 文档总索引，按任务查表。
3. [docs/architecture.md](docs/architecture.md) —— 技术决策的唯一事实源。

产品是什么、评审看重什么，见 [docs/prd.md](docs/prd.md)。

## 二、本地跑起来

```bash
git clone https://github.com/1008611-creater/no.2zhihu.git
cd no.2zhihu
npm install
cp .env.example .env.local     # Windows: copy .env.example .env.local
npm run dev                    # http://localhost:3000
```

`.env.local` 需要向队长要 `ZHIHU_ACCESS_SECRET`（**不要**贴在群里、issue、PR 或提交里）。
没有这个值也能跑：页面会进入只读演示模式，不消耗额度。

提交前至少跑一次：

```bash
npm run build
```

## 三、分支模型

`main` 始终可构建、可部署。**不要直接推 `main`。**

| 分支前缀 | 用途 | 示例 |
|---|---|---|
| `feat/` | 新功能 | `feat/kanshan-gap-state` |
| `fix/` | 修 bug | `fix/search-count-param` |
| `docs/` | 只改文档 | `docs/update-roadmap` |
| `chore/` | 构建、依赖、配置 | `chore/add-lockfile` |
| `design/` | 视觉与动效 | `design/mesh-edge-motion` |

```bash
git switch -c feat/your-thing
# ... 改动 ...
git push -u origin feat/your-thing
```

## 四、提交信息

用 Conventional Commits，中文正文可以：

```
feat(kanshan): 新增 gap 状态的耳朵弹起动效
fix(zhihu): 搜索条数参数改为 Count
docs(arch): 补充 lib/server 分层说明
```

一次提交只做一件事。不要把格式化、重构、功能混在一个提交里。

## 五、Pull Request

- 标题同提交规范；描述用仓库自带的 PR 模板填。
- **必须**写明：改了什么、为什么改、怎么验证的（贴命令或截图）。
- 涉及视觉改动，**必须**附前后截图。
- 改了架构、目录约定、额度消耗，**必须**同步改 `docs/`，并在 PR 里链接对应章节。
- 至少 1 人 review 通过后才能合并。作者自己不能给自己点通过。
- 合并方式用 **Squash and merge**，保持 `main` 线性。

### 谁负责 review 什么

| 改动范围 | 需要谁看 |
|---|---|
| `lib/zhihu/`、`app/api/` | 熟悉知乎开放平台接口的人（额度与鉴权风险） |
| `components/kanshan/`、`app/globals.css` | 负责视觉的人（风格一致性） |
| `lib/domain/` | 任意一人（纯函数，看逻辑与边界） |
| `docs/`、`README.md` | 任意一人 |

## 六、绝对不能提交的东西

- `.env.local`、任何真实 Access Secret / OAuth Token / App Key。
- `.official/`、`.refs/`、`.tools/`、`.snapshots/`、`.probe*/`（已在 `.gitignore`）。
- 知乎原文截图或整段转载（只允许引用带作者与链接的摘要）。
- 参考项目 `grok-icon-study` 的几何数据或素材（归 xAI，见 AGENTS.md 铁律 6）。
- 刘看山官方素材原件（仅比赛授权范围内使用，不进公开仓库）。

推送前自检：

```bash
git status --short          # 确认没有意外文件
rg "ZHIHU_ACCESS_SECRET|Bearer " --glob '!node_modules'   # 命中位置必须只在服务端
```

## 七、评审权重对应的优先级

初审权重：**AI 场景价值 40% / 创新度 25% / 完成度 25% / 设计感 10%**。

也就是说：**核心闭环能不能真跑通** 远比 多加一个页面重要。做取舍时按这个顺序砍。

## 八、遇到分歧怎么办

1. 先看 `docs/` 里有没有已经定过的结论（多数问题定过）。
2. 文档与代码冲突 → 以 `docs/architecture.md` 为准，改代码或改文档，**不要两边都不动**。
3. 确实要推翻既有决策 → 先改文档并说明理由，再改代码，同一个 PR 里完成。
