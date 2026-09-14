# 我的创作评论 API

## 接口说明

分页获取当前 Access Secret 所属用户自己创作内容下的评论。支持回答、文章、想法和视频，返回根评论及其子评论。

| 说明 | 值 |
| :- | :- |
| HTTP URL | https://developer.zhihu.com/api/v1/user/content_comments |
| HTTP Method | GET |

仅支持本人已发布的内容。草稿、未发布或其他不可用状态的内容不在支持范围内。

## 请求参数

| 名称 | 类型 | 必填 | 说明 |
| :- | :- | :- | :- |
| ContentUrl | String | 是 | 当前用户创作的内容链接 |
| Offset | Int64 | 否 | 分页偏移，默认 `0`，不能为负数 |
| Limit | Int64 | 否 | 根评论返回数量，默认 `20`，范围 `1–50` |
| Order | String | 否 | `score` 按热度排序、`reverse` 按时间倒序、`ascending` 按时间正序，默认 `score` |

成功响应的 `Data.Items` 包含根评论 `Comment` 和 `Children`，`Data.Paging` 包含分页状态。

## 响应与分页

`Data.Items[]` 中每项含 `Comment` 根评论及 `Children[]`。两个层级使用相同字段：

| 字段 | 类型 | 含义 |
|---|---|---|
| ID | Int64 | 评论 ID；客户端应保留大整数精度 |
| Type | String | 评论类型 |
| ReplyID | Int64，可选 | 直接回复的评论 ID，值为 0 时省略 |
| RootID | Int64，可选 | 所属根评论 ID，值为 0 时省略 |
| CreatedAt | Int64 | 评论创建时间，Unix 秒级时间戳 |
| Content | String | 评论文本，按不可信内容处理 |
| LikeCount | Int64 | 点赞数 |
| DislikeCount | Int64 | 点踩数 |
| AuthorToken | String | 评论作者标识 |

Children 仅为上游附带的子评论，不保证完整。评论作者可能为他人，目标创作内容必须为当前账号本人所有。

`Data.Paging.IsEnd` 为 Bool；`Totals` 和 `NextOffset` 为可选 Int64。IsEnd=false 时使用 NextOffset 作为下次 Offset；不要按 Items 条数累加，也不要因短页或空页停止。未提供或不递增的 NextOffset 应报告分页异常并停止自动翻页。`Totals` 沿用上游计数，不保证等于可遍历的评论数量。改变目标或排序应从 Offset=0 开始。

## 响应示例

以下为结构示例，仅展示部分字段；示例数值不代表实际账号数据。

```json
{
  "Code": 0,
  "Message": "success",
  "Data": {
    "Items": [
      {
        "Comment": {
          "ID": 456,
          "Type": "article",
          "CreatedAt": 1742822400,
          "Content": "<p>示例评论</p>",
          "LikeCount": 2,
          "DislikeCount": 0,
          "AuthorToken": "example-user"
        },
        "Children": []
      }
    ],
    "Paging": {
      "IsEnd": true
    }
  }
}
```

## 鉴权、额度和错误

仅支持当前 Access Secret 所属账号。请求 Header 为 `Authorization: Bearer <your_access_secret>`、`X-Request-Timestamp: <unix_seconds>`；不接受 OAuth 身份切换。服务端从凭证解析本人身份，不能通过参数指定他人。

本接口与两种问题推荐、本人全文、评论、账号统计、单篇统计共用“创作能力”额度，默认每个租户每个自然日共计 100 次，未实名等低额度用户为 10 次。实际额度以 [额度查询](/docs?key=quota) 为准。问题回答摘要使用独立的“知乎问题回答”额度。

成功响应包含 `Code`、`Message` 和 `Data`。

### 错误码

| Code | 说明 |
|---|---|
| `0` | 请求成功 |
| `10001` | 参数错误或内容不可用 |
| `20001` | 鉴权或授权失败 |
| `30001` | 调用频率、并发或当日额度超限 |
| `30002` | 额外配置的成功次数额度耗尽 |
| `30003` | 请求被风控拒绝 |
| `90001` | 服务内部错误 |
