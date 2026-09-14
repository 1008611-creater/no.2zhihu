# AGENTS.md — 工程铁律

> 给所有在此仓库工作的人与 AI Agent。与 [docs/INDEX.md](docs/INDEX.md) 配套。
> 仓库：https://github.com/1008611-creater/no.2zhihu ｜ 协作流程见 [CONTRIBUTING.md](CONTRIBUTING.md)

## 1. 不可违反

1. **凭证永不出服务端。** `ZHIHU_ACCESS_SECRET`、`ZHIHU_OAUTH_APP_KEY`、OAuth Token 只允许出现在
   `process.env` 与 `lib/zhihu/` 内部。禁止出现在：客户端组件、`NEXT_PUBLIC_*`、URL、
   日志、错误响应体、截图、演示视频、git 历史。
2. **不编造知乎数据。** 所有展示的知乎内容必须来自真实接口响应。接口失败时展示真实错误与降级，
   禁止用假数据填充页面来「看起来能用」。
3. **保留来源。** 展示知乎内容必须带 `AuthorName` 与 `Url`。不得把第三方原文改写成作品原创。
4. **不承诺做不到的事。** 开放平台无发布接口，UI 不得出现「一键发布到知乎」这类文案。
5. **不滥用额度。** 热榜 100/天、直答 100/天。禁止轮询、禁止在 render 中直接发请求、
   禁止在循环里逐个调用。新接口默认必须走缓存。
6. **不使用未授权素材。** `.refs/grok-icon-study` 只读其**架构思路**（状态机、弹簧、多边形绘制），
   其几何数据与素材归 xAI，禁止复制进本仓库。看山形象使用官方素材包或原创几何。

## 2. 目录约定

| 目录 | 放什么 | 不许放什么 |
|---|---|---|
| `app/` | 页面、layout、route handler | 业务规则、直接 fetch 上游 |
| `app/api/**/route.ts` | 薄适配层：校验入参 → 调 lib → 返回 JSON | 复杂逻辑、直接拼上游 URL |
| `lib/zhihu/` | 上游客户端、类型、缓存、错误 | React、DOM、UI 文案 |
| `lib/domain/` | 纯函数业务逻辑 | 网络、`server-only`、env 读取 |
| `lib/server/` | 服务端编排：唯一同时接触「知乎 IO」与「领域规则」的层 | React、DOM |
| `components/` | 展示与交互 | 直接 fetch 上游接口 |
| `components/kanshan/` | 看山角色引擎（Motion 状态表驱动） | 业务逻辑 |
| `docs/` | 规格与审计 | 密钥、token、个人隐私 |
| `docs/zhihu-api/` | 官方接口文档：`INDEX.md` 路由表 + `references/` 分册 | 整目录通读、复制正文进别处 |

依赖方向严格单向，**不允许反向 import**：

```
app/ (页面)      → components/ → lib/domain/
app/api/ (路由)  → lib/server/ → lib/domain/
                                → lib/zhihu/   (server-only)
```

- `lib/domain/` **不得** import `lib/zhihu/`，也不得读 `process.env`——它必须是纯函数。
- 需要同时用到「上游 IO」与「领域规则」的逻辑，**只能**写在 `lib/server/`（目前唯一文件是 `mirror.ts`）。
- `lib/zhihu/` 首行必须 `import "server-only"`。

### 查知乎接口资料

需要接口参数、鉴权、额度、MCP 细节时：先读 [docs/zhihu-api/INDEX.md](docs/zhihu-api/INDEX.md) 的路由表，
**只读命中的那一份** `references/*.md`。禁止整目录通读，也不要一次读多份（跨两件事时最多两份）。
索引里已列出通用事实（域名、鉴权头、响应外壳、通用错误码），多数问题不必翻开分册。

## 3. 代码风格

- TypeScript `strict`，不使用 `any`；上游响应一律在 `lib/zhihu/types.ts` 定义后使用。
- 服务端文件首行 `import "server-only"`。
- 命名：组件 `PascalCase.tsx`，工具 `camelCase.ts`，常量 `SCREAMING_SNAKE`。
- 中文注释写「为什么」，不写「做了什么」。
- 不使用 Tailwind 工具类（本项目为手写 CSS + 设计 token，见 design-system.md）。

## 4. 顶级 Skill 工程（.skills/）

本项目内置 7 个从 GitHub 精选的顶级 skill，用于**提升具体环节的效果**。它们是按需工具，不是默认上下文。

**唯一权威：`docs/skill-engineering.md`（总纲）。** 动手前查它的 §3 路由表；命中就按 §4 读法读该 skill 入口，不命中就用普通能力。

四条硬规则：

- **命中就必用**：路由表判为「必须」的工作，不读入口 `SKILL.md` 就动手属流程违规。
- **不命中就不读**：不要为了凑规则加载 skill，**不要整目录扫描 `.skills/`**（68MB，会瞬间吃掉上下文）。
- **一次一个 owner**：同一时刻上下文里最多一个 skill；重大任务最多 2–3 个，按阶段顺序。
- **铁律优先**：本文件 §1 高于任何 skill 的建议。

分层模型（渐进加载，保证该用的时候能用到、不用的时候不占上下文）：

| 层 | 内容 | 何时读 |
|---|---|---|
| L0 铁律 | 本文件 §1 + §2 | 每轮必读 |
| L1 路由 | `docs/skill-engineering.md` §3 路由表 | 每轮查一次 |
| L2 执行 | 命中的那个 `SKILL.md`（按 §4 读法只读指定部分） | 仅命中时 |
| L3 证据 | 本文件 §5 + 总纲 §6 验收判据 | 仅收尾时 |

7 个 owner 一览（完整清单、入口、读法、边界见总纲 §2 与 §4）：

| 环节 | Skill | 判定 | 入口 |
|---|---|---|---|
| 代码审查 | code-review-skill | 必须 | `.skills/code-review-skill-main/SKILL.md` |
| UI/UX 设计 | ui-ux-pro-max | 必须 | `.skills/ui-ux-pro-max-skill-main/.claude/skills/ui-ux-pro-max/SKILL.md` |
| 网页动效 | silk-design | 必须 | `.skills/silk-design-main/SKILL.md` |
| 动效/创意编码 | genjutsu | 必须 | `.skills/genjutsu-main/skills/cast/SKILL.md` |
| 演示视频 | video-talkcraft | 必须（若做视频） | `.skills/video-talkcraft-main/SKILL.md` |
| 图像资产 | banana-claude | 必须 | `.skills/banana-claude-main/skills/banana/SKILL.md` |
| 多模态生成 | Generative-Media-Skills | 条件 | `.skills/Generative-Media-Skills-main/core/media/SKILL.md` |

**看山角色引擎是例外**：造型与几何必须原创，动效 skill 只用于弹簧参数、时序与过渡节奏，见 `docs/character-engine.md`。

**外部生成（图像/视频）属付费动作**，需当轮明确授权；banana-claude 与 Generative-Media-Skills 不得用于同一任务。

**跨线程约定**：任何线程动手前走 L0 → L1 → 命中才进 L2；收尾按总纲 §7 记录证据。

## 5. 提交前自检

- [ ] `npm run build` 通过，无类型错误。
- [ ] 新增接口有缓存 TTL，且额度消耗在 docs/api-audit.md 的预算内。
- [ ] 无凭证泄漏：`rg "ZHIHU_ACCESS_SECRET|Bearer "` 检查命中位置仅限服务端。
- [ ] 失败路径有真实提示，不是空白页或无限 loading。
- [ ] 若改了架构或约定，docs/ 已同步更新。
- [ ] 走分支 + PR，不直推 `main`（见 [CONTRIBUTING.md](CONTRIBUTING.md)）。
- [ ] 提交前确认 `.env.local` 仍被忽略：`git check-ignore -v .env.local` 必须有输出。
