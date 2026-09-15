# 技术架构

> 最后更新：2026-09-15 · 本文是技术决策的**唯一事实源**，代码与本文冲突时以本文为准

## 一、技术栈决策（已定稿）

| 层 | 选型 | 版本 | 决策理由 |
|---|---|---|---|
| 框架 | **Next.js App Router** | 14.2.5 | 一套代码同时交付页面与服务端代理；凭证留在服务端；可自托管也可 Vercel 一键部署 |
| 语言 | **TypeScript** | 5.5+ | `strict` 模式，上游响应全部显式建模 |
| UI 运行时 | **React** | 18.3.1 | Next 14 配套 |
| 动效 | **Motion**（`motion/react`） | ^11.11 | 弹簧驱动 + 声明式；看山角色引擎与页面动效统一用它 |
| 样式 | **手写 CSS + 设计 token** | — | 见下方决策 |
| 校验 | **Zod** | ^3.23 | route handler 入参校验 |
| 服务端隔离 | **server-only** | ^0.0.1 | 编译期阻止 `lib/zhihu` 被打进客户端 bundle |
| 部署 | **自托管（推荐）/ Vercel（备用）** | — | 自托管：常驻进程、缓存共享、无 60s 上限，见 [self-hosting.md](self-hosting.md) |

### 关于样式：为什么不用 Tailwind

`app/globals.css` 已是完整的手写 token 体系（`:root` 中 30+ 个变量），
`package.json` 中**不含** Tailwind 依赖。
**决策：坚持手写 CSS，不引入 Tailwind。** 理由：

1. 本作品视觉核心是**几何 + 动效**，大量使用渐变、遮罩、`clip-path`、多层伪元素，
   这些用工具类表达反而更长、更难维护。
2. 设计 token 已集中在 `:root`，与 [design-system.md](design-system.md) 一一对应，可审计。
3. 减少构建依赖 = 减少截止前的失败面。

> 执行项：确认仓库中无 `tailwind.config.*`、无 `postcss.config.*`、无 `@tailwind` 指令残留。
> 若后续有人想引入 Tailwind，必须先修改本文档并说明理由。

## 一之二、分身分类：答主型 vs 视角型

v1 主线是「**具体知乎答主的分身**」。分身分两类，评价标准不同：

| 类别 | `kind` | 载体 | 评价标准 | 地位 |
|---|---|---|---|---|
| **答主型** | `persona` | `Persona` 四要素 | 「像这个人」>「答案完美」 | 主体，首页主叙事 |
| **视角型** | `experience` / `analysis` / `counter` / `method` / `story` / `risk` | `SkillSeed` | 视角是否稳定、可解释 | 补充层（`supplementary: true`） |

### 视角型什么时候真的出场（2026-09-15 修正）

在此之前，「补充层」只是一句**设计意图**：`recommendPersonas` 只遍历 `PERSONA_SKILLS`，
`skillFromSeed` **全项目从未被调用过**。后果是 —— `scorePersona` 的底分是 `0.25`，
答主只要没有任何领域 / 立场命中，得分就**恰好等于底分**；16 位答主在零信号时全部同分，
稳定排序让它恒取「名册前两位」。于是半佛仙人成了**无处不在的填充物**：问半导体也推他，
问失眠也推他。产品承诺「多视角作答、标出共同缺口」，而视角本身是凑数的。

现行规则（`lib/domain/router.ts`）：

1. **零信号答主不入选** —— `score` 必须**严格高于** `BASE_SCORE`（0.25）。该常量因此必须具名。
2. **席位不足时用视角型补位**，按 `SkillSeed.triggers` 命中数排序 ——
   问「为什么」时「拆解者」必然对口，问「推荐」时「实操派」必然对口；
   它们**永远与问题相关**，且带 `supplementary: true`，**不伪装成真人答主**。
3. **通用兜底只留两个**（拆解者 → 反驳者），用于问法不在任何 `triggers` 里的情况
   （例如「半导体国产替代走到哪一步了」既无「为什么」也无「怎么做」）。
4. **宁可少给，绝不退回凑数。** 兜底后仍不足就如实少给 ——
   少一位视角，好过三位里两位在自说自话。
5. 视角型**没有相关性得分**，前端 chip 不渲染分数，改显示「补位」。

> 由此产生一条约束：`routeQuestion` 的自动路径**不能**对视角型调用
> `scorePersona(s.persona!, …)` —— 视角型没有 `persona`。
> 这正是这条路此前「即使调了也会崩」的原因。

### 答主人格四要素

每位答主由 `lib/domain/personas/<handle>.ts` 里的一份 `Persona` 定义，字段固定四组：

1. `knows` —— 他知道什么：领域、经历、专业边界。
2. `stance` —— 他怎么看问题：价值判断、常见立场、思考路径。
3. `voice` —— 他怎么说话：句长偏好、语气、口头禅、举例方式、情绪强度、**字数区间**。
4. `doesNotKnow` —— 他明确不装懂的范围。

外加 `corpus` 元数据：抓取条数、抓取时间、是否真实抓取（`real`）、代表性来源。

### 语言指纹（2026-09-15 新增，解决「像 GPT 直答」）

**问题**：四要素里的 `voice` 全是**形容词**——「毒舌」「口语」「节奏快」「短句为主」。
形容词无法落地：任何人格都能认领同一批形容词，模型读完后仍然按通用文风输出，
于是 16 位答主的回答拉不开差距，整体像 GPT 直答。

**方案**：在 `voice` 下新增四个**可执行 / 可核对**的字段（`lib/domain/types.ts` 的 `PersonaVoice`）：

| 字段 | 类型 | 作用 | 为什么能落地 |
|---|---|---|---|
| `opening` | `string` | 开口方式：第一句长什么样 | 直接约束第一个 token，模型无从回避 |
| `punctuation` | `string` | 标点与排版习惯 | **可数、可核对**（「段落 2–3 句」「句号密」「括号每段至少一个」），不是感觉 |
| `avoid` | `string[]` | 反面例句：绝不写出来的具体句子 | 给出**具体句子**而非「不要公式化」这种口号 |
| `exemplars` | `string[]` | 语感范例（构造，**不是**抓取到的原话） | 提供 few-shot 锚点；不改变 `corpus.real` 语义，不冒充真实引文 |

16 位答主全部补齐，每位 `avoid` 4 条、`exemplars` 3 条。

**三处重复钉住**（模型「读了但没照做」是常态，单处注入不够）：

1. `lib/server/mirror.ts` 的 `systemPromptFor()` —— 新增独立段「【这个人的语言指纹 · 这部分比上面更要紧】」
2. `buildUserPrompt()` 末尾 —— 新增「【落笔前的最后提醒 · 这两条最影响「像不像他」】」重复 `opening` / `punctuation` 并列出 `avoid`
3. 辩论模式的 `DEBATE_REPLY_PROMPT` —— 注入「【两人的语言指纹 · 回应时必须各自守住】」，并明令双方语气/句长/标点必须明显不同

**兜底**：`sanitizeAnswer()` 增加末尾套话剥离（`CLOSING_PATTERNS` → `stripClosing`），
只在**最后一段**剥离，最多循环 2 次；剥空则整段丢弃。对准「总之」「综上」
「希望以上…」「以上就是我…」「仅供参考」这类 GPT 收尾腔。

**防回归**：`lib/domain/personas/index.ts` 导出 `VOICE_FINGERPRINT_FIELDS` 与
`missingVoiceFingerprint()`，模块加载时自检——`NODE_ENV !== "production"` 时缺字段
直接 `throw`，生产环境只警告（避免整站 500）。新增答主漏填不会静默退化。

**可见性**：`/personas/[handle]` 增加「语言指纹」「语感范例」「他不会写的句子」三个区块，
让评委能直接核对这套机制（`exemplars` 区块带「按本人风格构造，不是抓取到的原话」说明）。

### 人格从哪来（数据管线）

```
scripts/persona-crawler.mjs     用 cookie 打 moments/{username}/activities，只留本人回答 → .personas-raw/
        ↓
scripts/distill-personas.mjs    把原始回答喂给直答，抽四要素 → lib/domain/personas/<handle>.ts
```

- 原始语料写 `.personas-raw/`（**已 gitignore，不入公开仓库**）。
- 人格文件只存**特征与短引用**，不存大段原文。
- **未抓取时** `corpus.real=false`，卡片如实显示「预置人格 · 未抓取全量回答」，不假数据。
- 用户临时指定一位**没预置**的答主时，走 `lib/server/persona.ts` 在线蒸馏：搜索 → 按 `AuthorName` 过滤 → 抽四要素；**必须如实返回命中条数**，命中 0 条时标注低置信度。

> 合规边界：官方制作指南禁止批量爬取。抓取脚本与原始语料仅本地一次性使用、不入公开仓库；见 [acceptance.md](acceptance.md) §六 风险表。

## 二、目录结构（目标态）

```
app/
  layout.tsx                    根布局 + 元信息
  globals.css                   设计 token + 基础样式（唯一全局样式文件）
  page.tsx                      首页：提问入口 + 看山 + 流程
  mesh/page.tsx                 Human Mesh 视图
  api/
    health/route.ts             健康检查（部署探针）
    zhihu/
      hot/route.ts              热榜（缓存 10 分钟）
      search/route.ts           知乎搜索 / 全网搜索
      question-answers/route.ts 问题回答摘要
      recommendations/route.ts  问题推荐
      hackathon/route.ts        比赛内容（实测 401，需浏览器登录态）
      zhida/route.ts            直答生成
      quota/route.ts            额度查询
    mirror/
      route.ts                  ★ 核心：问题 → 路由 → 证据 → 回答 → 缺口
      invite/route.ts           继续邀请一位答主（只生成这一位，不重跑旧的）
      debate/route.ts           一轮互相回应（识别冲突 → 双方各回一段，上限 2 次直答）
components/
  kanshan/                      看山角色引擎（见 character-engine.md）
    Kanshan.tsx                 对外组件（SVG + Motion 弹簧）
    KanshanStage.tsx            按流程阶段驱动看山 + 旁白
    states.ts                   状态表 / 眼神表 / 停留区间 / 姿态表
  mirror/                       镜像工作台组件（Skill / Answer / Gap / Handoff）
  mesh/                         Human Mesh 关系图
  ui/                           通用组件（TopBar / QuotaBadge）
lib/
  zhihu/                        服务端知乎客户端（server-only）
    client.ts                   fetch + 鉴权 + 超时 + 错误归一
    cache.ts                    进程内 TTL + 请求去重
    types.ts                    上游响应类型
    errors.ts                   错误分类与用户文案
  server/                       编排层（唯一同时接触知乎 IO 与领域规则）
    mirror.ts                   ★ 核心：问题 → 路由 → 证据 → 回答 → 缺口 + 邀请 + 互相回应
    persona.ts                  在线蒸馏：临时指定一位没预置的答主，如实返回命中条数
  domain/                       纯业务逻辑（无 IO）
    types.ts                    领域模型（含 Persona 四要素）
    personas/                   答主人格名册（6 位真实答主，一人一文件 + index.ts）
    skills.ts                   答主型主体（由 personas 派生）+ 视角型补充层
    router.ts                   Human Router：手动指定优先，自动推荐补位
    gap.ts                      ★ 缺口识别
    handoff.ts                  搬运文案与深链规则
    mesh.ts                     Human Mesh 关系推导
  motion/                       动效工具（clamp 等）
docs/                           规格文档
```

## 三、数据流

```
浏览器
  │  POST /api/mirror { question, handles? }
  ▼
route handler（薄，只做校验与转发）
  │  ① Zod 校验入参
  ▼
lib/server/mirror.ts（编排层，唯一同时接触 IO 与领域规则）
  │  ② routeQuestion(question, handles)  ← lib/domain，手动指定优先，纯函数，0 额度
  │  ③ 并行对每位答主：zhihuSearch()      ← lib/zhihu，带缓存
  │  ④ zhida(evidence → 按该答主 voice)   ← 并发 2 + 退避重试（并发 4 会触发 429）
  │  ⑤ findGaps(answers)                 ← lib/domain，纯函数
  │  ⑥ 组装 MirrorQuestion
  ▼
JSON（不含任何凭证）
  │
浏览器渲染：人格卡 + 证据 + 缺口 + 看山状态
  │
  ├─ POST /api/mirror/invite { question, handle }  → 只追加这一位，不重跑旧的
  └─ POST /api/mirror/debate { question, entries } → 一轮互相回应，上限 2 次直答
```

**关键约束**：`/api/mirror` 是全流程唯一的重接口。它的缓存键 = `hash(question + 是否直答 + 证据条数)`，
TTL 30 分钟。同一问题重复演示**不消耗新额度**——这是 Demo 期间反复演练的保障。
降级结果（直答失败产生的「证据直引」）用更短的 TTL，避免一次偶发限流让接下来半小时全显示不可用。

## 四、缓存策略（额度保护）

| 接口 | TTL | 去重 | 备注 |
|---|---:|---|---|
| quota | 60 s | ✅ | 仅调试用 |
| hot_list | 10 min | ✅ | **100/天**，绝不轮询 |
| zhihu_search | 5 min | ✅ | 5000/天 |
| global_search | 5 min | ✅ | 5000/天 |
| question_answers | 10 min | ✅ | **100/天** |
| question_recommendations | 30 min | ✅ | 与 creator 共享 100/天 |
| zhida | 30 min | ✅ | **100/天**，键 = 完整 messages |
| hackathon content | 30 min | ✅ | 无鉴权 |
| **mirror 全流程** | **30 min** | ✅ | 键 = 问题 + 分身集合 |

实现见 `lib/zhihu/cache.ts`：进程内 Map + inflight 合并。
**已知局限**：Serverless 多实例不共享。缓解方案见下节。

## 五、降级与容错

| 情况 | 行为 |
|---|---|
| 未配置 `ZHIHU_ACCESS_SECRET` | 进入只读降级：展示内置示例问题与快照，页面顶部提示「当前为演示模式」 |
| 上游 401/20001 | 展示 `ZhihuApiError.userMessage`，不暴露原始响应 |
| 额度耗尽 30002 | 提示「今日额度已用尽」并展示已有缓存结果 |
| 超时 / 网络错误 | 12 秒超时后返回结构化错误，前端展示重试按钮 |
| 搜索无结果 | 如实显示「该分身没有找到证据」，不编造 |

`ZhihuApiError` 已实现 `userMessage`，前端直接展示即可，见 `lib/zhihu/errors.ts`。

## 六、部署（Vercel）

| 项 | 值 |
|---|---|
| 构建命令 | `next build` |
| 环境变量 | `ZHIHU_ACCESS_SECRET`（Production + Preview） |
| 运行时 | Node.js（**不是 Edge**）——上游 TLS 依赖 Node 栈 |
| 域名 | `zhihu.cauai.fun` 公网 HTTPS（备用 `*.vercel.app`） |
| 探针 | `/api/health` 返回 `{ ok, credentials, cache }` |

> ⚠️ 不要部署到 Edge Runtime。审计确认 Windows/部分环境下 Schannel 握手失败，
> Node 自带 TLS 栈正常，因此所有调用上游的 route 必须显式声明 `export const runtime = 'nodejs'`。

## 七、Serverless 缓存局限与处置

进程内 Map 在 Serverless 多实例下会各自为政。对本次交付：

- **可接受**。Demo 流量小，实例数少；即使缓存未命中，额度上限（热榜 100/天）也只影响重复演示。
- **兜底**：`/api/mirror` 的结果额外写入 `.snapshots/`（本地），
  演示时优先读快照。这是「Demo 一定跑得起来」的最后一道保险。
- **不在本次范围**：引入 Redis / KV 做分布式缓存。

## 八、待办技术决策（已知未定）

| 项 | 状态 | 影响 |
|---|---|---|
| 是否接入 OAuth | 未定，等 App ID/App Key | 仅影响人气奖与加分 |
| 缺口识别用规则还是模型 | **已定：规则**（lib/domain/gap.ts，纯函数、零额度、可复现） | — |
| 快照落盘 vs KV | 倾向落盘 | 见第七节 |
