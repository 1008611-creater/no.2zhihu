# 知乎搜索 Skill

## 能力说明

该 Skill 提供面向 AI 助手与 Agent 的知乎站内搜索能力，适合在回答问题前补充知乎内容、检索高相关讨论、获取站内观点与经验。

## 下载方式

- `https://developer.zhihu.com/download/zhihu_search_skills.zip`

## 请求参数

| 名称 | 类型 | 必填 | 说明 |
| :- | :- | :- | :- |
| `query` | String | 是 | 搜索问题或关键词 |
| `count` | Int | 否 | 返回结果数量，默认 `10`，取值范围 1-10 |

```json
{
  "query": "RAG",
  "count": 5
}
```

## 响应参数

| 字段 | 类型 | 说明 |
| :- | :- | :- |
| `Code` | Int | 状态码，`0` 表示成功 |
| `Message` | String | 状态说明 |
| `Data` | Object | 搜索结果 |
| `Data.HasMore` | Bool | 是否还有更多结果 |
| `Data.SearchHashId` | String | 本次搜索标识 |
| `Data.EmptyReason` | String | 无搜索结果时的原因说明 |
| `Data.Items` | Array | 搜索结果列表 |
| `Data.Items[].Title` | String | 标题 |
| `Data.Items[].ContentType` | String | 内容类型 |
| `Data.Items[].ContentID` | String | 内容 ID |
| `Data.Items[].ContentText` | String | 内容摘要，其中可能包含 `<em>` 高亮标签 |
| `Data.Items[].Url` | String | 内容链接 |
| `Data.Items[].CommentCount` | Int | 评论数 |
| `Data.Items[].VoteUpCount` | Int | 赞同数 |
| `Data.Items[].AuthorName` | String | 作者名称 |
| `Data.Items[].AuthorAvatar` | String | 作者头像链接 |
| `Data.Items[].AuthorBadge` | String | 作者标识 |
| `Data.Items[].AuthorBadgeText` | String | 作者标识说明 |
| `Data.Items[].EditTime` | Int | 内容更新时间 |
| `Data.Items[].AuthorityLevel` | String | 内容权威等级 |
| `Data.Items[].RankingScore` | Float | 搜索排序得分 |
| `Data.Items[].CommentInfoList` | Array | 相关评论列表 |
| `Data.Items[].CommentInfoList[].Content` | String | 评论内容 |

```json
{
  "Code": 0,
  "Message": "success",
  "Data": {
    "HasMore": true,
    "SearchHashId": "search-hash-id",
    "Items": [
      {
        "Title": "RAG 评测方法综述",
        "ContentType": "article",
        "ContentID": "123456789",
        "ContentText": "……",
        "Url": "https://zhuanlan.zhihu.com/p/123456789",
        "AuthorName": "作者"
      }
    ]
  }
}
```

调用失败时会返回错误信息并以非零状态结束。请根据错误提示检查请求参数、认证配置或调用频率。
