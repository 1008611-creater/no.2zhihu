# 知乎开放平台 API 审计（实测）

审计时间：2026-09-14
凭证来源：`ZHIHU_ACCESS_SECRET`（仅后端环境变量，禁止入库）

## 1. 结论速览

| 能力 | 接口 | 实测结果 |
|---|---|---|
| 鉴权 | `Authorization: Bearer <secret>` + `X-Request-Timestamp` | 通过 |
| 额度查询 | `GET /api/v1/quota` | 200，返回 9 组额度 |
| 知乎搜索 | `GET /api/v1/content/zhihu_search` | 200，返回真实问答（条数参数是 `Count`） |
| 全网搜索 | `GET /api/v1/content/global_search` | 200（条数参数是 `Count`） |
| 知乎热榜 | `GET /api/v1/content/hot_list` | 200，返回 30 条 |
| 问题回答 | `GET /api/v1/content/question_answers` | 200，返回回答摘要 |
| 直答 Agent | `POST /v1/chat/completions` | 200，返回真实生成内容 |
| 问题推荐 | `GET /api/v1/user/question_recommendations` | 200 |
| 我的内容 | `GET /api/v1/user/contents` | 200，但 **`ContentType` 为必填**（不传报 10001） |
| 账号创作数据 | `GET /api/v1/user/creator_account_stats` | 200 |
| 黑客松故事 | `GET https://api.zhihu.com/km-indep-home/hackathon/v2/story/list` | **401**，见下方说明 |
| 黑客松知识 | `GET https://api.zhihu.com/km-indep-home/hackathon/v2/knowledge/list` | **401**，见下方说明 |

额度（当前账号，2026-09-14）：

```
全网搜 5000/天   知乎搜索 5000/天   热榜 100/天
问题回答 100/天  用户数据 10000/天  创作能力 100/天
直答 5000/天     知识库 500/天     小工具 10/天
```

## 2. 环境问题与解决

`curl.exe` / PowerShell 访问 `developer.zhihu.com` 时在 TLS 握手阶段失败：

```
schannel: AcquireCredentialsHandle failed: SEC_E_NO_CREDENTIALS (0x8009030E)
```

这是 Windows Schannel 凭证链问题，不是知乎接口不可用。改用 Node 自带 TLS 栈（`fetch` / `node:https`）后全部返回 200。**结论：服务端用 Node 运行时即可正常调用，不需要额外网络配置。**

### 2.1 参数大小写坑（2026-09-14 复测发现）

搜索类接口的条数参数是 **`Count`**，不是 `Limit`：

| 请求 | 实际返回 |
|---|---|
| `zhihu_search?Query=AI Agent&Limit=3` | HTTP 200，**返回 10 条**（`Limit` 被静默忽略） |
| `zhihu_search?Query=AI Agent&Count=3` | HTTP 200，返回 3 条 |

`Limit` 不报错、不提示，只是被忽略。这类「看起来成功」的偏差最容易在演示时变成事故，
所以本项目统一以官方文档的字段名为准，并在 `lib/zhihu/client.ts` 顶部记录了这条结论。

同类问题还有一处：`GET /api/v1/user/contents` 的 `ContentType` 是**必填**，
不传会返回 `Code=10001 ContentType is required`。

### 2.2 黑客松内容接口需要浏览器登录态

官方制作指南里提到的两个内容接口：

```
GET https://api.zhihu.com/km-indep-home/hackathon/v2/story/list
GET https://api.zhihu.com/km-indep-home/hackathon/v2/knowledge/list
```

实测结论（2026-09-14，已尝试带 Access Secret、带浏览器 UA/Referer、带 activity_code 参数）：

```json
{"error":{"code":100,"name":"AuthenticationInvalidRequest","message":"ERR_PARSE_LOGIN_TICKET"}}
```

这是知乎站内页面调用的接口，依赖浏览器登录票据，**开放平台 Access Secret 对它无效**。
因此本项目的 `/api/zhihu/hackathon` 在服务端不可用时返回真实的 502 与提示文案，
不填充任何替代数据（对应 AGENTS.md 铁律第 2 条）。

### 2.3 搜索接口是「内容语义检索」，不是「按作者检索」（2026-09-14 实测）

这一条直接决定「临时指定一位没预置的答主」这个功能能不能用，所以单独记录。

把答主昵称当作检索词时，返回的绝大多数是**别人讨论这个人**的内容，而不是**这个人写的内容**：

| 检索词 | 返回条数 | 其中作者是本人的 |
|---|---|---|
| `张佳玮` | 10 | 0 |
| `马伯庸` | 10 | 0 |
| `采铜` | 10 | 0 |
| `肥肥猫` | 10 | 0 |
| `Raymond Wang` | 10 | 0 |
| `陈章鱼` | 10 | 3 |
| `半佛仙人` | 10 | 1–2 |
| `李松蔚 心理` | 10 | 1 |

尝试过的无效方向：

- 加长检索词（`张佳玮 的回答`、`张佳玮 是什么样的人`）——命中仍为 0。
- 用 `SortBy=VoteUpCount:desc:(500,)` 过滤高赞——直接返回 0 条。
- 用 `global_search` 全网搜——返回的仍是「如何评价张佳玮」这类第三方内容。
- 用 `/api/v1/user/contents` 按 url_token 取本人创作——该接口**只读凭证所属账号**，读别人必须走 OAuth 授权。

**有效方案**：并发跑多个检索变体（`人名+主题`、`人名`、`人名+的回答`），按 `Url` 去重后，再用 `AuthorName` 严格相等过滤。
实测把命中从 0 提升到 1–3 条，已实现在 `lib/server/persona.ts` 的 `distillPersona()`。

**产品口径**：命中 0 条时不假装成功——返回 `confidence: "low"`，并在 UI 上写明「检索到 N 条，但没有一条作者是本人」。
这是 `AGENTS.md` 铁律第 2 条（不编造知乎数据）的直接落地。

**另一条更重要的口径**：预置答主路径**根本不检索人名**。
`lib/domain/router.ts` 的 `buildPersonaQuery()` 用「问题主题 + 该答主的领域关键词」构造检索词——
领域词负责选材，人格负责组织语言。这样每位答主拿到的都是与问题真正相关的公开回答，
而不是一堆关于他本人的八卦。这也是为什么 6 位预置答主在演示中效果稳定的原因。

### 2.4 直答接口会丢弃 `system` 角色（2026-09-15 实测）

这是本次审计里影响面最大的一条。`POST /v1/chat/completions` **不处理 `system` 消息**，
只按 `user` 内容作答；`system` 里的指令被静默丢弃，不报错、不提示。

两组对照实验（线上 `zhida-fast-1p5`）：

| 实验 | 请求 | 实际输出 |
|---|---|---|
| A | `system`：「你的每一段都必须以「※」开头」<br>`user`：「简单介绍一下杭州」 | **没有任何「※」** |
| B | 同一句话放进 `user`（不写 `system`） | **每一段都以「※」开头** |
| C | `system`：「只输出 `{"ping":true}`」<br>`user`：「你好，请介绍一下你自己」 | 自我介绍「我是知乎直答，由知乎与面壁智能联合打造…」——**根本没收到 system** |

`assistant` 角色**正常**（多轮上下文可用），只有 `system` 被丢弃。

**影响面**：项目里所有写在 `system` 的约束此前全部等于没写 —— 答主人格口吻、
「只能使用知乎证据里的信息」、「不要 Markdown / 不要分点」、防雷同参照、
以及人格蒸馏与互相回应的 JSON 格式要求。

**由此表现出的症状**（修复前，均已在线上复现）：

- 「临时指定一位没预置的答主」恒失败：模型只收到 `[n] 标题 + 摘要` 的材料，
  按直答的本能行为输出了**信源评估报告**（键名是「信源结构」「权威性得分」），
  而不是人格 JSON，于是 `failureReason: "invalid_format"`。
- 「互相回应」恒返回 `replies: 0`：`DEBATE_PICKER_PROMPT` 被丢弃 → 模型不输出 JSON →
  `parseClash` 返回 null → 界面显示「没有识别出足够尖锐的冲突」。看起来像优雅降级，
  实际是指令没送到。

**处理**：`lib/zhihu/client.ts` 的 `foldSystemIntoUser()` 在发请求前把 `system` 内容
折叠进第一条 `user` 消息（指令在前、材料在后），并在折叠**之后**计算缓存键。
调用方仍可照常写 `system`，无需改动。上游修好后删掉这一处即可。

### 2.4 人格蒸馏偶发失败：模型把材料当成「待评估的信源」（2026-09-15 实测）

**现象**：`distillPersona()` 偶发返回 `failureReason: "invalid_format"`。模型输出的是一份
**信源评估报告**，而不是人格 JSON：

```json
{ "分析对象": "...", "信源结构": "...", "各片段评估": [{"权威性得分": "0.60-0.63"}], "内在局限": "..." }
```

**结论：这不是提示词结构问题，是上游的偶发行为。** 为了确认，逐条验证了几个看似合理的解释：

| 假设 | 验证方式 | 结论 |
|---|---|---|
| 抽 JSON 不够健壮（首尾括号截取） | 改成括号配平扫描 | 不是原因 —— 输出里根本没有人格字段可抽 |
| `system` 角色被上游丢弃 | 同一句格式约束分别放 `system` / `user`，各 3 次独立采样 | **两者都 3/3 生效，`system` 正常** |
| 指令放 `user` 比放 `system` 更可靠 | 真实蒸馏提示词 A/B，各 3 份材料 | **两者都 3/3 成功，无差异** |
| 材料里的数字/机构触发了信源评估 | 用证据密集材料（期刊、机构、百分比）复测 | **10/10 成功，不是触发条件** |
| 提示词没把「材料」与「任务」分开 | 折叠 + 改材料形态 + 明确禁止评估 | 全部通过，但**不是必要条件** |

**决定性证据**：同一条 messages 在 07:22 失败、在 07:53 成功。失败率随时间波动
（一次会话内连续 2/2 失败，另一次 20+ 次连续成功）。

> ⚠️ 排查时的陷阱：客户端对「模型 + 完整 messages」做了 30 分钟缓存，
> **一次偶发失败会被缓存反复回放**，看起来就像「恒失败」。判断是否为真·必现，
> 必须换一条 messages 或等缓存过期后重测，不能在同一窗口内重复调用同一输入。

**由此暴露的一个真实缺陷（已修）**：重试路径 `content: raw.slice(0, 4000)` **只把上一次的输出发回去**，
不带原始材料 —— 对「输出了完全不同 schema」这种失败形态没有任何可修的东西；
而且它要求「缺失信息留空」，与 `parseDistill` 要求 `knows` 非空**互相矛盾**。
现在改为**重发原始材料 + 更强的指令**（明确禁止评估信源）。

**产品口径**：失败时如实降级为低置信度人格并在 UI 标注，不假装成功（`AGENTS.md` 铁律第 2 条）。

## 3. 鉴权契约

```http
Authorization: Bearer <Access Secret>
X-Request-Timestamp: <秒级 Unix 时间戳>
Content-Type: application/json
```

- Access Secret 与 OAuth App Key 是两种独立凭证。
- 代表已授权用户调用时追加 `X-OAuth-Token: <oauth access_token>`。
- App Key 不能作为上述任一 Header。

## 4. 关键限制：平台没有「发布」接口

这是本次审计最重要的发现。知乎开放平台全部 54 个文档条目中，**不存在把回答/文章写入知乎的接口**。全部接口都是只读，或与发布无关：

| 方法 | 路径 | 用途 |
|---|---|---|
| POST | `https://openapi.zhihu.com/access_token` | OAuth 换取 token |
| POST | `https://developer.zhihu.com/v1/chat/completions` | 直答生成 |
| POST | `/api/v1/knowledge/search` | 知识库检索 |
| POST | `/api/v1/knowledge/files` | 上传文件到知识库 |

`PublishCount` 只是统计字段，不是发布能力。官方文档明确写明发布相关字段、scope 和 token 撤销/刷新**未文档化**，不得猜测实现。

因此「真人修改后搬运到真实知乎」这一步不能通过开放平台 API 完成。可选的真实发布路径见 `docs/publish-path.md`。

## 5. 错误码

| Code | 含义 |
|---|---|
| 0 | 成功 |
| 10001 | 参数错误 / 内容不可用 |
| 20001 | 鉴权或授权失败 |
| 30001 | 频率、并发或当日额度超限 |
| 30002 | 成功次数额度耗尽 |
| 30003 | 风控拒绝 |
| 90001 | 服务内部错误 |

## 6. 安全边界

- Access Secret、App Key、OAuth Token 只存后端环境变量，不进入前端、日志、URL、截图或仓库。
- `.env.local` 已写入 `.gitignore`。
- 实测额度（2026-09-14）：搜索 / 直答各 5000/天，热榜 / 问题回答 / 创作能力各 100/天，用户数据 10000/天。热榜与问题回答偏低，必须缓存与去重，禁止轮询。
