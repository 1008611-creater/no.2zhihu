# P0 验收清单

> 最后更新：2026-09-14 ｜ 截止 2026-09-15 10:00
> 状态图例：✅ 已实测通过 ｜ 🟡 需你在本机/线上复验 ｜ ⬜ 未完成

---

## 一、闭环验收（Demo 必须完整走通）

> v1 口径：主线是「**具体知乎答主的分身**」。评价标准是「像这个人」>「答案完美」。
> 旧的 6 个视角型分身（反驳者 / 亲历者 / 风险审计 / 实操派 / 拆解者 / 讲故事的人）保留但降级为补充层。

| # | 验收项 | 判定方式 | 状态 |
|---|---|---|---|
| 1 | 输入问题后进入**选择答主**步骤，可多选 | `app/page.tsx` 四步状态机 `ask → pick → run → done` | ✅ |
| 2 | 答主人格卡展示**领域、风格标签、语癖、不装懂边界、蒸馏条数** | `components/mirror/PersonaCard.tsx` / `PersonaPicker.tsx` | ✅ |
| 3 | 每位答主带**真实知乎来源**（标题 / 作者 / 链接 / 赞同数） | 实测每位 3 条真实来源 | ✅ |
| 4 | 回答群组按人格排布，**换人不重样** | `components/mirror/AnswerCard.tsx` | ✅ |
| 5 | 回答由**知乎直答**按该答主 voice 生成（非降级） | `lib/server/mirror.ts` `systemPromptFor()`；实测 `generatedBy: zhida` | ✅ |
| 6 | 字数区间由**人格自己决定**，不再全站统一 | `Persona.voice.wordRange`（80–600 字不等） | ✅ |
| 7 | 看山能触发**缺口识别**并生成真人邀请 | 实测稳定产出 1–3 条缺口，每条带候选 | ✅ |
| 8 | 缺口说明**为什么是缺口** + **需要什么样的真人** | `Gap.reason` / `Gap.needProfile` | ✅ |
| 9 | **继续邀请**：追加一位答主，**不重跑已有分身** | `POST /api/mirror/invite` → `invitePersona()` | ✅ |
| 10 | **一轮互相回应**：识别冲突后双方各回一段，不循环 | `POST /api/mirror/debate` → `runDebate()`，上限 2 次直答 | ✅ |
| 11 | 临时指定**未预置的答主**：现场蒸馏，**如实返回命中条数** | `lib/server/persona.ts` 多变体检索；实测命中 1–3 条，命中 0 条时标注低置信度 | ✅ |
| 12 | 真人提交后能**更新回答、问题状态和 Mesh 节点** | Mesh 节点含 `persona` 类型 | ✅ |
| 13 | 编辑后的回答能完成**搬运流程** | 导出正文含全部来源归属 | ✅ |
| 14 | 搬运**不伪造发布** | `/api/handoff` 返回 `canPublishViaApi: false` + 真实编辑器深链 | ✅ |
| 15 | 移动端和桌面端均可完成演示脚本 | CSS 断点 + 单列布局 | 🟡 需线上复验 |
| 16 | 线上具备**健康检查** | `/api/health` 返回 `{ok, credentials, cache, at}` | ✅ 实测 `credentials: true` |
| 17 | 线上具备**缓存**与**错误提示** | TTL 缓存（30 分钟；降级 60 秒）+ 降级文案 | ✅ |
| 18 | **无凭证降级模式**可用 | 未配 Secret 时返回真实提示，不白屏 | ✅ |

---

## 一之二、数据管线验收（答主人格从哪来）

| # | 验收项 | 判定方式 | 状态 |
|---|---|---|---|
| D1 | 抓取脚本：`moments/{username}/activities` + `x-zse-96` + cookie | `scripts/persona-crawler.mjs` | ✅ 代码就绪 |
| D2 | 只保留 `author.url_token === username` 的本人回答 | 同上，过滤转发与他人内容 | ✅ |
| D3 | 原始语料不入公开仓库 | `.personas-raw/` 已 gitignore | ✅ |
| D4 | 蒸馏脚本：真实回答 → 四要素 → `lib/domain/personas/<handle>.ts` | `scripts/distill-personas.mjs` | ✅ 代码就绪 |
| D5 | 人格文件只存**特征与短引用**，不存大段原文 | 6 位答主 TS 文件 | ✅ |
| D6 | 未抓取时**如实标注**「预置人格 · 未抓取全量回答」 | `corpusLabel()`；`corpus.real=false` | ✅ |
| D7 | 6 位答主实跑抓取 ≥30 条 | 需 `ZHIHU_COOKIE`（浏览器登录态） | ⬜ 阻塞：待提供 cookie |
| D8 | 临时答主检索命中率：多变体 + 作者严格过滤 | `lib/server/persona.ts`；实测 1–3 条，0 条时如实降级 | ✅ |

> **D7 说明**：官方「用户数据」接口只能读凭证所属账号，直连知乎需登录 cookie。
> 三条替代路径均已实测失败，确认抓取必须有浏览器 cookie。拿不到时产品完整可用，卡片如实显示「预置人格」。
>
> **D8 说明**：知乎搜索是内容语义检索而非按作者检索。已实测多种检索策略（见 [api-audit.md](api-audit.md) §2.3），
> 最终采用「多变体检索 + 按 `Url` 去重 + 按 `AuthorName` 严格过滤」，命中率从 0 提升到 1–3 条。
> 预置答主路径不走这条逻辑，而是用「问题主题 + 答主领域词」检索证据，效果更稳定。

---

## 二、工程验收

| # | 验收项 | 判定方式 | 状态 |
|---|---|---|---|
| 19 | TypeScript 全量类型检查 0 错误 | 60 个文件，0 诊断 | ✅ |
| 20 | 构建通过 | 服务器 `npm run build`（Node 22 / Ubuntu 22.04） | ✅ 实测 Compiled successfully |
| 21 | 公开仓库可访问 | GitHub API 返回 `private: false` | ✅ 已推送，云端 CI 全绿 |
| 22 | 凭证未入库 | `.env.local` 被 gitignore；全仓库密钥命中 0 处 | ✅ |
| 23 | 站点元信息完整 | icon / apple-icon / manifest / robots / sitemap / OG 图 | ✅ |
| 24 | 文档内链无死链 | 全部相对链接指向存在的文件 | ✅ |

---

## 三、提交材料验收（官方清单）

| 提交项 | 必需 | 我们的产出 | 状态 |
|---|---|---|---|
| ① 可运行体验链接 | **必交** | `https://zhihu.cauai.fun`（自托管；Vercel 备用） | ✅ 已上线，HTTPS 证书有效 |
| ② 产品说明计划书 | **必交** | [product-plan.md](product-plan.md) / [submission.md](submission.md) | ✅ 已定稿 |
| ③ 代码仓库链接 | 加分 | https://github.com/1008611-creater/no.2zhihu | ✅ 已推送，公网可访问 |
| ④ 项目演示视频 | 加分 | [demo-video-script.md](demo-video-script.md)（脚本就绪，待录制） | 🟡 |

---

## 四、官方评审权重对照

| 维度 | 权重 | 我们靠什么拿分 |
|---|---|---|
| AI 场景价值 | 40% | 缺口识别 + 真人接管，解决「AI 答得快但不可信」的真实断层 |
| 创新度 | 25% | 「多个 AI 答完后指出共同盲区」这一步，市面上没有 |
| 完成度 | 25% | 全链路真实接口打通，无假数据，降级完备 |
| 设计感 | 10% | 看山角色引擎（10 状态）+ motion graphic 文字几何风 |

---

## 五、验收怎么复核

不想相信本文的结论，可以按下面这张表自己验：

| 想验什么 | 去看 / 去跑 |
|---|---|
| 答主人格名册（6 位） | `lib/domain/personas/` + `index.ts` |
| 答主 → Skill 派生 | `lib/domain/skills.ts`（`skillFromPersona`） |
| 分身目录与降级补充层 | `lib/domain/skills.ts` |
| 路由逻辑（手动指定 + 自动推荐） | `lib/domain/router.ts` |
| 人格驱动提示词 | `lib/server/mirror.ts` `systemPromptFor()` |
| 在线蒸馏（临时答主） | `lib/server/persona.ts` |
| 抓取 / 蒸馏脚本 | `scripts/persona-crawler.mjs` / `scripts/distill-personas.mjs` |
| 缺口规则（8 类） | `lib/domain/gap.ts` |
| 搬运稿生成 | `lib/domain/handoff.ts` |
| Mesh 构图 | `lib/domain/mesh.ts` |
| 看山状态机 | `components/kanshan/states.ts` |
| 上游串行与重试 | `lib/zhihu/client.ts` |
| 缓存策略 | `lib/zhihu/cache.ts` |
| 主流程编排 | `lib/server/mirror.ts` |
| 发布边界 | `docs/publish-path.md` |

---

## 六、已知风险

| 风险 | 影响 | 处置 |
|---|---|---|
| 知乎上游限流 | 并发取证据时部分分身拿到空来源 | 已改为串行闸门 + 退避重试；降级结果只缓存 60 秒 |
| 直答额度 | 演示中途耗尽 | 实测 5000/天（已用 121），额度充裕；仍按问题缓存 30 分钟，`ZHIHU_USE_ZHIDA=0` 可强制关闭 |
| 首次请求较慢 | 冷启动/构建后首次调用 | `/api/mirror` 设 `maxDuration = 60`；演示前预热一次 |
| 刘看山素材授权 | 赛后不可商用 | 仓库附 NOTICE.md 明确授权范围 |
| 答主语料抓取 | 官方指南禁止批量爬取 | 脚本与原始语料不入公开仓库（`.personas-raw/` gitignored）；人格文件只存特征与短引用；未抓取时如实标注 |
