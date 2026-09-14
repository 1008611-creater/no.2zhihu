# 问题回答 API

## 接口说明

获取一个知乎问题下的回答列表。`Summary` 是服务返回的内容摘要或截取文本，不额外生成 AI 摘要，也不代表回答全文。

## 请求

```http
GET /api/v1/content/question_answers
```

请求头使用开放平台统一 Bearer 鉴权，并携带秒级 `X-Request-Timestamp`。

| Query 参数 | 类型 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| `QuestionUrl` | String | 是 | — | 完整的知乎问题 URL |
| `Offset` | Int64 | 否 | `0` | 分页偏移，不能为负数 |
| `Limit` | Int64 | 否 | `20` | 返回数量，范围 `1-50` |

## 响应

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `Items` | Array | 回答摘要列表 |
| `Items[].ContentType` | String | 固定为 `answer` |
| `Items[].ContentToken` | String | 回答 Token |
| `Items[].Url` | String | 回答链接 |
| `Items[].Summary` | String | 服务返回的回答摘要或截取文本 |
| `Paging.IsEnd` | Bool | 是否已到最后一页 |
| `Paging.NextOffset` | Int64 | 下一页偏移；IsEnd=true 时可省略 |
| `Paging.Totals` | Int64 | 回答总数；未提供时可能不返回 |

```json
{
  "Code": 0,
  "Message": "success",
  "Data": {
    "Items": [
      {
        "ContentType": "answer",
        "ContentToken": "456",
        "Url": "https://www.zhihu.com/question/123/answer/456",
        "Summary": "这是一段回答摘要……"
      }
    ],
    "Paging": {
      "IsEnd": true,
      "Totals": 1
    }
  }
}
```

本接口使用“知乎问题回答”额度，默认每个租户每个自然日 100 次，未实名等低额度用户为 10 次；实际额度以额度查询结果为准。

## 分页说明

无效或无摘要的回答会被过滤，因此单页 `Items` 数量可能少于 `Limit`，甚至为空。请使用服务返回的分页字段，不按过滤后的条数重新计算。

- `Paging.IsEnd=false` 时，按需将 `Paging.NextOffset` 作为下一次请求的 `Offset`。
- `Paging.IsEnd=true` 时停止翻页。请勿根据 `Items` 数量判断结束或自行计算偏移。
- 若 `IsEnd=false` 但缺少 `NextOffset`，停止自动翻页并报告分页信息不完整，避免重复请求。
- `Paging.Totals` 可能包含被过滤的项，不保证等于最终可读取的摘要数。

## 错误码

| Code | 说明 |
| --- | --- |
| `10001` | 问题 URL 或分页参数错误，或者问题不存在 |
| `20001` | 鉴权或授权失败 |
| `30001` | 调用频率、并发限制或当日额度超过限制 |
| `30002` | 额外配置的累计成功次数额度耗尽 |
| `30003` | 请求被风控拒绝 |
| `90001` | 服务内部错误 |
