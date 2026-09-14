# 账号创作数据 API

## 接口说明

获取当前 Access Secret 所属创作者的账号维度数据，包括内容指标、创作数量、粉丝概览和可用的受众画像。

| 说明 | 值 |
| :- | :- |
| HTTP URL | https://developer.zhihu.com/api/v1/user/creator_account_stats |
| HTTP Method | GET |

## 请求参数

| 名称 | 类型 | 必填 | 说明 |
| :- | :- | :- | :- |
| ContentType | String | 否 | `all`、`answer`、`article`、`pin` 或 `zvideo`，默认 `all` |
| StartDate | String | 否 | 开始日期，格式 `YYYY-MM-DD`，需与 EndDate 同时提供 |
| EndDate | String | 否 | 结束日期，格式 `YYYY-MM-DD`，不得早于 StartDate |

成功响应的 `Data` 包含 `Metrics`、`Audience`、`CreationCounts`、`Followers`、`FollowerDetails` 和 `FollowerProfile`；上游未提供的可选指标会省略。

## 响应字段

| Data 字段 | 类型 | 含义 |
|---|---|---|
| ContentType | String | 规范化后的内容类型 |
| Metrics | Object，可选 | 内容指标，详见下文 Metrics 字段表 |
| Audience | Object，可选 | 受众画像及可选 Status/Reason |
| CreationCounts | Object，可选 | Answer、Article、Video、Follower 数量（Int64） |
| Followers | Object，可选 | 粉丝概览，详见 Followers（FollowerSummary）字段表 |
| FollowerDetails | Object，可选 | Daily 日序列、Today 与 Period 周期数据 |
| FollowerProfile | Object，可选 | 画像及互动对象，需结合 Status/Reason 使用 |

日期必须成对提供或同时省略；省略时使用服务默认统计范围，不承诺固定天数。

### 字段阅读说明

JSON 字段名区分大小写。可选数值指标未返回时不应补零；已提供的数值指标为 0 时会保留。状态、字符串和集合字段也可能因零值、空字符串或空集合而省略，不能仅凭缺失判断上游未提供。Int64 计数字段需保留整数精度。比例沿用上游原值，单位未明确时不要自行乘 100 或拼接百分号。

指标可用范围取决于内容类型和上游覆盖，不承诺所有字段同时存在。画像及互动明细缺失时不补全。统计可能延迟，日期范围不保证对每项指标同时生效。

### Metrics

| 字段 | 类型 | 可选 | 说明 |
|---|---|---|---|
| Updated | String | 是 | 统计更新时间 |
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
| IncreasedUpvoteCount | Int64 | 是 | 新增赞同数 |
| DecreasedUpvoteCount | Int64 | 是 | 减少的赞同数 |
| IncreasedLikeCount | Int64 | 是 | 新增喜欢数 |
| DecreasedLikeCount | Int64 | 是 | 减少的喜欢数 |
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

### CreationCounts

| 字段 | 类型 | 可选 | 说明 |
|---|---|---|---|
| Answer | Int64 | 否 | 回答数量 |
| Article | Int64 | 否 | 文章数量 |
| Video | Int64 | 否 | 视频数量 |
| Follower | Int64 | 否 | 粉丝数量 |

### Followers（FollowerSummary）

| 字段 | 类型 | 可选 | 说明 |
|---|---|---|---|
| Total | Int64 | 是 | 粉丝总数 |
| Yesterday | Int64 | 是 | 昨日粉丝净增数 |
| NewYesterday | Int64 | 是 | 昨日新增粉丝数 |
| CancelledYesterday | Int64 | 是 | 昨日取消关注数 |
| ActiveCount | Int64 | 是 | 活跃粉丝数 |
| ActiveRatio | String | 是 | 活跃粉丝占比 |

### FollowerDaily

| 字段 | 类型 | 可选 | 说明 |
|---|---|---|---|
| Date | String | 否 | 统计日期 |
| NetIncrease | Int64 | 是 | 净增粉丝数 |
| NewCount | Int64 | 是 | 新增粉丝数 |
| UnfollowCount | Int64 | 是 | 取消关注数 |
| HomepageVisitorCount | Int64 | 是 | 主页访客数 |
| HomepageFollowCount | Int64 | 是 | 主页带来的关注数 |
| HomepageConversionRate | Float64 | 是 | 主页转粉率 |

### FollowerPeriod

| 字段 | 类型 | 可选 | 说明 |
|---|---|---|---|
| Date | String | 否 | 周期统计对应日期 |
| NetIncrease7Days | Int64 | 是 | 7 日净增粉丝数 |
| NetIncrease14Days | Int64 | 是 | 14 日净增粉丝数 |
| NetIncrease30Days | Int64 | 是 | 30 日净增粉丝数 |
| NewCount7Days | Int64 | 是 | 7 日新增粉丝数 |
| NewCount14Days | Int64 | 是 | 14 日新增粉丝数 |
| NewCount30Days | Int64 | 是 | 30 日新增粉丝数 |
| UnfollowCount7Days | Int64 | 是 | 7 日取消关注数 |
| UnfollowCount14Days | Int64 | 是 | 14 日取消关注数 |
| UnfollowCount30Days | Int64 | 是 | 30 日取消关注数 |
| HomepageVisitorCount7Days | Int64 | 是 | 7 日主页访客数 |
| HomepageVisitorCount14Days | Int64 | 是 | 14 日主页访客数 |
| HomepageVisitorCount30Days | Int64 | 是 | 30 日主页访客数 |
| HomepageFollowCount7Days | Int64 | 是 | 7 日主页带来的关注数 |
| HomepageFollowCount14Days | Int64 | 是 | 14 日主页带来的关注数 |
| HomepageFollowCount30Days | Int64 | 是 | 30 日主页带来的关注数 |
| HomepageConversionRate7Days | Float64 | 是 | 7 日主页转粉率 |
| HomepageConversionRate14Days | Float64 | 是 | 14 日主页转粉率 |
| HomepageConversionRate30Days | Float64 | 是 | 30 日主页转粉率 |

### FollowerDetails

| 字段 | 类型 | 可选 | 说明 |
|---|---|---|---|
| Daily | Array<FollowerDaily> | 是 | 粉丝数据日序列，每项结构见 FollowerDaily |
| Today | FollowerDaily | 是 | 上游提供的当日粉丝数据；实际统计日期以 Date 为准 |
| Period | FollowerPeriod | 是 | 7 日、14 日、30 日周期粉丝数据 |

### FollowerCreatorItem

| 字段 | 类型 | 可选 | 说明 |
|---|---|---|---|
| Avatar | String | 否 | 头像地址 |
| MemberToken | String | 否 | 用户 URL Token |
| Name | String | 否 | 用户名称 |
| FollowCount | Int64 | 否 | 该用户对应的关注数量 |

### FollowerInteractions

| 字段 | 类型 | 可选 | 说明 |
|---|---|---|---|
| Status | Int32 | 否 | 互动数据状态 |
| Creators | Array<FollowerCreatorItem> | 是 | 互动关联的创作者列表 |
| Content | Array<AudienceContentItem> | 是 | 互动关联的内容列表 |

### FollowerProfile

| 字段 | 类型 | 可选 | 说明 |
|---|---|---|---|
| Status | Int32 | 是 | 粉丝画像状态；值为 0 时省略，缺失不代表异常 |
| Reason | String | 是 | 画像状态或数据缺失原因 |
| Audience | Audience | 是 | 粉丝受众画像，字段见 Audience |
| Interactions | FollowerInteractions | 是 | 粉丝互动明细，字段见 FollowerInteractions |

## 响应示例

以下为结构示例，仅展示部分字段；示例数值不代表实际账号数据。

```json
{
  "Code": 0,
  "Message": "success",
  "Data": {
    "ContentType": "all",
    "Metrics": {
      "Updated": "2026-09-08 12:00:00",
      "ViewCount": 100,
      "UpvoteCount": 10,
      "Yesterday": {
        "ViewCount": 20
      }
    },
    "Followers": {
      "Total": 50,
      "Yesterday": 2,
      "NewYesterday": 3,
      "CancelledYesterday": 1
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
