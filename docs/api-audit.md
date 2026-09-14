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
- 热榜 100/天、直答 100/天量级偏低，必须缓存与去重，禁止轮询。
