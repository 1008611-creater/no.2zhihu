# 单篇创作数据 API

## 接口说明

获取当前 Access Secret 所属用户自己创作的单篇内容数据，包括阅读、互动、转粉和可用的受众画像。

| 说明 | 值 |
| :- | :- |
| HTTP URL | https://developer.zhihu.com/api/v1/user/creator_content_stats |
| HTTP Method | GET |

仅支持本人已发布的内容。草稿、未发布或其他不可用状态的内容不在支持范围内。

## 请求参数

| 名称 | 类型 | 必填 | 说明 |
| :- | :- | :- | :- |
| ContentUrl | String | 是 | 当前用户创作的回答、文章、想法或视频链接 |
| StartDate | String | 否 | 开始日期，格式 `YYYY-MM-DD`，需与 EndDate 同时提供 |
| EndDate | String | 否 | 结束日期，格式 `YYYY-MM-DD`，不得早于 StartDate |

成功响应的 `Data.Items` 包含内容标识、标题、`Metrics` 和 `Audience`。链接无效、内容不存在或作者不属于当前用户时返回参数错误。

## 响应字段

仅返回与已核验本人归属目标一致的数据。`Data.Items` 没有统计数据时可为空数组，不等同于各指标均为零。

| 字段 | 类型 | 可选 | 说明 |
|---|---|---|---|
| Items | Array | 否 | 单篇内容统计条目列表 |
| Items[].ContentType | String | 否 | 内容类型：answer、article、pin 或 zvideo |
| Items[].ContentToken | String | 否 | 内容标识，保留字符串精度 |
| Items[].Url | String | 否 | 内容链接 |
| Items[].Title | String | 是 | 内容标题，空标题省略 |
| Items[].Metrics | Object | 是 | 内容指标，字段见 Metrics |
| Items[].Audience | Object | 是 | 受众画像，字段见 Audience |

日期必须成对提供或同时省略；省略时使用服务默认统计范围，不承诺固定天数。

### 字段阅读说明

JSON 字段名区分大小写。可选数值指标未返回时不应补零；已提供的数值指标为 0 时会保留。状态、字符串和集合字段也可能因零值、空字符串或空集合而省略，不能仅凭缺失判断上游未提供。Int64 计数字段需保留整数精度。比例沿用上游原值，单位未明确时不要自行乘 100 或拼接百分号。

指标可用范围取决于内容类型和上游覆盖，不承诺所有字段同时存在。画像及互动明细缺失时不补全。统计可能延迟，日期范围不保证对每项指标同时生效。

### Metrics

| 字段 | 类型 | 可选 | 说明 |
|---|---|---|---|
| Date | String | 是 | 统计日期 |
| ViewCount | Int64 | 是 | 阅读量 |
| PlayCount | Int64 | 是 | 播放量 |
| UpvoteCount | Int64 | 是 | 赞同数 |
| CommentCount | Int64 | 是 | 评论数 |
| LikeCount | Int64 | 是 | 喜欢数 |
| CollectCount | Int64 | 是 | 收藏数 |
| ShareCount | Int64 | 是 | 分享数 |
| RepinCount | Int64 | 是 | 转发数 |
| PublishCount | Int64 | 是 | 发布内容数 |
| ClickRate | Float64 | 是 | 点击率 |
| ReadFinishedRate | Float64 | 是 | 阅读完成率 |
| PlayFinishedRate | Float64 | 是 | 播放完成率 |
| PageShowUV | Int64 | 是 | 内容曝光用户数（UV） |
| NewFollowerCount | Int64 | 是 | 新增关注用户数 |
| FollowerConversionRate | Float64 | 是 | 转粉率 |
| PositiveInteractionRate | String | 是 | 正向互动率 |
| FollowerGain | Int64 | 是 | 内容带来的转粉数量 |
| IncreasedUpvoteCount | Int64 | 是 | 新增赞同数 |
| DecreasedUpvoteCount | Int64 | 是 | 减少的赞同数 |
| IncreasedLikeCount | Int64 | 是 | 新增喜欢数 |
| DecreasedLikeCount | Int64 | 是 | 减少的喜欢数 |
| UpvoteCount7Days | Int64 | 是 | 7 日赞同数 |
| Yesterday | Metrics | 是 | 昨日指标，字段结构同 Metrics |
| Today | Metrics | 是 | 今日指标，字段结构同 Metrics |

### AudienceProfileItem

| 字段 | 类型 | 可选 | 说明 |
|---|---|---|---|
| Name | String | 否 | 画像分类名称 |
| Ratio | Float64 | 否 | 该分类的画像占比 |
| Count | Int64 | 是 | 该分类对应数量；缺失时不补零 |

### AudienceContentItem

| 字段 | 类型 | 可选 | 说明 |
|---|---|---|---|
| ContentType | String | 否 | 内容类型 |
| ContentToken | String | 否 | 内容标识，使用字符串保留精度 |
| Title | String | 否 | 内容标题 |
| FollowCount | Int64 | 否 | 该内容对应的关注数量 |

### Audience

| 字段 | 类型 | 可选 | 说明 |
|---|---|---|---|
| Status | String | 是 | 画像数据状态 |
| Reason | String | 是 | 画像状态或数据缺失原因 |
| Source | Array<AudienceProfileItem> | 是 | 访问来源分布 |
| Activeness | Array<AudienceProfileItem> | 是 | 活跃程度分布 |
| ActiveTime | Array<AudienceProfileItem> | 是 | 活跃时间分布 |
| Content | Array<AudienceContentItem> | 是 | 画像关联的内容列表 |
| Gender | Array<AudienceProfileItem> | 是 | 性别分布 |
| Age | Array<AudienceProfileItem> | 是 | 年龄分布 |
| Interest | Array<AudienceProfileItem> | 是 | 兴趣分布 |
| Location | Array<AudienceProfileItem> | 是 | 地域分布 |
| OS | Array<AudienceProfileItem> | 是 | 操作系统分布 |

## 响应示例

以下为结构示例，仅展示部分字段；示例数值不代表实际账号数据。

```json
{
  "Code": 0,
  "Message": "success",
  "Data": {
    "Items": [
      {
        "ContentType": "article",
        "ContentToken": "123",
        "Url": "https://zhuanlan.zhihu.com/p/123",
        "Title": "示例文章",
        "Metrics": {
          "Date": "2026-09-08",
          "ViewCount": 100,
          "UpvoteCount": 10
        }
      }
    ]
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
