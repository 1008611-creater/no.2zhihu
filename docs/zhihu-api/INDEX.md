# 知乎开放平台接口索引

> 唯一入口。**先查本表，只读命中的那一份**。不要一次读完 `references/`。
> 来源：https://developer.zhihu.com/console/api/v3/docs ｜ 拉取日期：2026-09-14 ｜ 33 页 / 约 9.8 万字符

## 一、用法（重要）

1. 在下表按**意图**找到一行，只读该行的 `references/*.md`。
2. 只有任务确实横跨两件事时（如「鉴权 + 某个接口」）才读第二份，**最多两份**。
3. 表里没有的，不要猜接口。先读 `references/authorization.md`，再说明缺哪项能力。
4. 本文件是索引，**不复制正文**。正文只存在于 `references/`，避免上下文重复膨胀。

## 二、不读正文也能确定的事实

- **域名**：`https://developer.zhihu.com`
- **鉴权**：所有接口统一 `Authorization: Bearer <your_access_secret>` + `X-Request-Timestamp: <秒级 Unix 时间戳>`。凭证只走服务端（见 [AGENTS.md](../../AGENTS.md) 第 1 条）。
- **响应外壳**：`{"Code":0,"Message":"success","Data":...}`，`Code:0` 为成功。
- **通用错误码**：`10001` 参数错误 ｜ `20001` 鉴权失败 ｜ `30001` 频率限制 ｜ `90001` 内部错误。
- **每种能力三种形态**：REST API ／ Skill（zip）／ MCP。写后端取 API，接 Agent 取 Skill，接 MCP 客户端取 MCP。
- **额度**：按自然日限免，查询本身不消耗业务额度。

## 三、路由表

| 意图 / 触发词 | 能力 | 读这一份 |
|---|---|---|
| Access Secret、Bearer、鉴权、签名 | 鉴权 | `references/authorization.md` |
| zhihu-cli、命令行、安装 Skill | CLI | `references/zhihu_cli.md` |
| 剩余额度、用量统计 | 额度 | `references/quota.md` |
| 知乎站内搜索、搜回答/文章 | 知乎搜索 | `references/zhihu_search.md` |
| 知乎搜索 Skill | 知乎搜索 | `references/zhihu_search_skill.md` |
| 知乎搜索 MCP | 知乎搜索 | `references/zhihu_search_mcp.md` |
| 全网搜索、新闻、官网、外部资料 | 全网搜索 | `references/global_search.md` |
| 全网搜索 Skill | 全网搜索 | `references/global_search_skill.md` |
| 全网搜索 MCP | 全网搜索 | `references/global_search_mcp.md` |
| 直答、综合回答、对话补全 | 直答 | `references/zhida.md` |
| 直答 Skill | 直答 | `references/zhida_skill.md` |
| 直答 MCP | 直答 | `references/zhida_mcp.md` |
| 热榜、trending、今日热议 | 热榜 | `references/hot_list.md` |
| 热榜 Skill | 热榜 | `references/hot_list_skill.md` |
| 热榜 MCP | 热榜 | `references/hot_list_mcp.md` |
| 推荐问题、按画像找题 | 问题发现 | `references/question_recommendations.md` |
| 问题下的回答摘要 | 问题发现 | `references/question_answers.md` |
| 我的创作全文 | 创作能力 | `references/user_content_detail.md` |
| 我的创作评论 | 创作能力 | `references/user_content_comments.md` |
| 账号创作数据、账号统计 | 创作能力 | `references/creator_account_stats.md` |
| 单篇创作数据、单篇统计 | 创作能力 | `references/creator_content_stats.md` |
| 知识库列表 | 知识库 | `references/knowledge_bases.md` |
| 知识库内容列表 | 知识库 | `references/knowledge_base_items.md` |
| 知识库文件上传 | 知识库 | `references/knowledge_file_upload.md` |
| 知识库检索、查资料 | 知识库 | `references/knowledge_search.md` |
| PDF 解析 | 小工具 | `references/pdf_parse.md` |
| PPT 生成 | 小工具 | `references/ppt_generation.md` |
| 第三方应用 OAuth 登录 | 用户数据 | `references/zhihu_oauth_integrated.md` |
| 用户的内容 | 用户数据 | `references/user_contents.md` |
| 用户的关注 | 用户数据 | `references/user_followees.md` |
| 用户的收藏 | 用户数据 | `references/user_collections.md` |
| 用户收藏夹列表 | 用户数据 | `references/user_favlists.md` |
| 收藏夹内容 | 用户数据 | `references/favlist_contents.md` |

## 四、易混点

- 「搜索」单独出现时有歧义：默认知乎站内搜索（`zhihu_search`），并提示还有全网搜索。
- 「收藏」指用户自己的收藏（`user_collections`）；「收藏夹」指收藏夹列表及其内容（`user_favlists` / `favlist_contents`）。
- 写代码优先读 **API** 分册；接 Agent / MCP 客户端优先读 **Skill / MCP** 分册。
- 个人数据接口只读 Access Secret 所属账号。跨用户访问属于第三方应用场景，必须走 OAuth。
- 本站**无写入/发布接口**，全部能力为只读（见 [publish-path.md](../publish-path.md)）。

## 五、维护

- 站点文档更新后，重新拉取并覆盖 `references/`；本表的行与文件名保持一一对应。
- 新增页面必须在本表登记，否则视为不存在。
