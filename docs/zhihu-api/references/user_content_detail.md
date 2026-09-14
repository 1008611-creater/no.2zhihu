# 我的创作全文 API

## 接口说明

获取当前 Access Secret 所属用户自己创作内容的全文。支持回答、文章、想法和视频。

| 说明 | 值 |
| :- | :- |
| HTTP URL | https://developer.zhihu.com/api/v1/user/content_detail |
| HTTP Method | GET |

仅支持本人已发布的内容。草稿、未发布或其他不可用状态的内容不在支持范围内。

## 请求参数

| 名称 | 类型 | 必填 | 说明 |
| :- | :- | :- | :- |
| ContentUrl | String | 是 | 当前用户创作的回答、文章、想法或视频链接 |

成功响应的 `Data` 包含 `ContentType`、`ContentToken`、`Url`、`Title` 和全文 `Body`。链接无效、内容不存在或作者不属于当前用户时返回参数错误，响应不会泄露作者归属信息。

```shell
curl -G 'https://developer.zhihu.com/api/v1/user/content_detail' \
  --data-urlencode 'ContentUrl=https://www.zhihu.com/question/1/answer/2' \
  -H 'Authorization: Bearer <your_access_secret>' \
  -H "X-Request-Timestamp: $(date +%s)"
```

## 响应字段与边界

以下字段均位于 `Data` 中。

| 字段 | 类型 | 说明 |
|---|---|---|
| ContentType | String | 内容类型：answer、article、pin 或 zvideo |
| ContentToken | String | 内容标识，保留字符串精度 |
| Url | String | 内容链接 |
| Title | String | 内容标题，可能为空字符串 |
| Body | String | 正文，可能包含 HTML；展示时转义或安全清洗 |

视频类型仅返回关联正文，不提供视频文件下载。没有可用正文时返回内容不可用，不把空 Body 宣称为全文。

支持知乎 HTTPS 链接 `/answer/{id}`、`/question/{id}/answer/{id}`、`/p/{id}`（文章）、`/pin/{id}`、`/zvideo/{id}`。内容归属必须通过服务端验证，无法确认归属时不返回正文。全文与评论分别调用。

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
