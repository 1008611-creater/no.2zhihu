# 知乎热榜 API

## 接口说明
获取当前知乎热榜内容，返回结构化的标题、链接、缩略图与摘要列表。

## 接口信息

| 说明 | 值 |
| - | - |
| HTTP URL | https://developer.zhihu.com/api/v1/content/hot_list |
| HTTP Method | GET |

## 请求参数
### Header
- Authorization：`Bearer <your_access_secret>`
- X-Request-Timestamp：秒级 Unix 时间戳
- Content-Type：固定值 `application/json`

### Query

| 名称 | 类型 | 必填 | 说明 |
| :- | :- | :- | :- |
| Limit | Int32 | 否 | 返回数量，默认 30，最大 30 |

说明：

- 当 `Limit <= 0` 或 `Limit > 30` 时，服务端会自动回退为 `30`。

## 响应参数

Data：

| 参数名 | 类型 | 是否必返 | 描述 |
| :- | :- | :- | :- |
| Total | Int64 | 是 | 实际返回的热榜条数 |
| Items | Array[Item] | 是 | 热榜内容列表 |

Item：

| 参数名 | 类型 | 是否必返 | 描述 |
| :- | :- | :- | :- |
| Title | String | 是 | 热榜标题 |
| Url | String | 是 | 热榜对应的知乎链接 |
| ThumbnailUrl | String | 是 | 缩略图 URL，无封面图时为空字符串 |
| Summary | String | 是 | 内容摘要，无摘要时为空字符串 |

说明：

- 当前仅返回问题和文章两类热榜内容。
- `ThumbnailUrl` 和 `Summary` 始终返回，无数据时值为 `""`。

响应示例：
``` json
{
    "Code": 0,
    "Message": "success",
    "Data": {
        "Total": 2,
        "Items": [
            {
                "Title": "如何评价某个热点问题？",
                "Url": "https://www.zhihu.com/question/123456789",
                "ThumbnailUrl": "https://pic1.zhimg.com/v2-d4b0f8158e064dbcc71eb6ce970230a9.jpg",
                "Summary": "这是该问题的内容摘要"
            },
            {
                "Title": "一篇正在热榜上的文章标题",
                "Url": "https://zhuanlan.zhihu.com/p/987654321",
                "ThumbnailUrl": "",
                "Summary": ""
            }
        ]
    }
}
```

## 错误码说明

| 错误码 | 说明 |
| - | - |
| 0 | 成功 |
| 20001 | 鉴权失败 |
| 30001 | 频率限制 |
| 90001 | 内部错误 |

## 代码示例
Curl 请求示例:
``` shell
curl 'https://developer.zhihu.com/api/v1/content/hot_list?Limit=10' \
  -H 'Authorization: Bearer <your_access_secret>' \
  -H "X-Request-Timestamp: $(date +%s)"
```
