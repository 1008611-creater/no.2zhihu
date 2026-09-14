# 知乎热榜 Skill

## 能力说明

该 Skill 提供面向 AI 助手与 Agent 的知乎热榜获取能力，适合用于热点追踪、内容推荐、趋势发现等场景。

## 下载方式

- `https://developer.zhihu.com/download/hot_list_skills.zip`

## 请求参数

| 名称 | 类型 | 必填 | 说明 |
| :- | :- | :- | :- |
| `limit` | Int | 否 | 返回结果数量，默认 `30`，取值范围 1-30 |

```json
{
  "limit": 10
}
```

## 响应参数

| 字段 | 类型 | 说明 |
| :- | :- | :- |
| `Code` | Int | 状态码，`0` 表示成功 |
| `Message` | String | 状态说明 |
| `Data` | Object | 热榜结果 |
| `Data.Total` | Int64 | 热榜结果总数 |
| `Data.Items` | Array | 热榜内容列表 |
| `Data.Items[].Title` | String | 热榜标题 |
| `Data.Items[].Url` | String | 内容链接 |
| `Data.Items[].ThumbnailUrl` | String | 缩略图链接 |
| `Data.Items[].Summary` | String | 内容摘要 |

```json
{
  "Code": 0,
  "Message": "success",
  "Data": {
    "Total": 10,
    "Items": [
      {
        "Title": "如何评价某个热点问题？",
        "Url": "https://www.zhihu.com/question/123456789",
        "ThumbnailUrl": "https://pic1.zhimg.com/example.jpg",
        "Summary": "热点问题摘要"
      }
    ]
  }
}
```

调用失败时会返回错误信息并以非零状态结束。请根据错误提示检查认证配置或调用频率。
