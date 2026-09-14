# 知识库内容列表 API

首次使用请先登录直答知识库完成初始化 https://zhida.zhihu.com/repositories/square

## 接口说明

分页获取指定知识库中的内容。

## 接口信息

| 说明 | 值 |
| - | - |
| HTTP URL | `https://developer.zhihu.com/api/v1/knowledge/bases/{KnowledgeBaseID}/items` |
| HTTP Method | `GET` |
| API ID | `knowledge_base_items` |

## 请求参数

### Header

- `Authorization`：`Bearer <your_access_secret>`
- `X-Request-Timestamp`：秒级 Unix 时间戳

### Path

| 名称 | 类型 | 必填 | 说明 |
| :- | :- | :- | :- |
| `KnowledgeBaseID` | String | 是 | 知识库 ID |

### Query

| 名称 | 类型 | 必填 | 默认值 | 说明 |
| :- | :- | :- | :- | :- |
| `Cursor` | String | 否 | 空 | 上一页返回的不透明游标；调用方不要解析或修改 |
| `Limit` | Int32 | 否 | `20` | 每页数量，范围 `1..20` |

## 响应参数

`Data`：

| 参数名 | 类型 | 是否必返 | 描述 |
| :- | :- | :- | :- |
| `Items` | Array[KnowledgeItem] | 是 | 本页内容项 |
| `Total` | Int64 | 是 | 当前条件下的内容总数 |
| `HasMore` | Boolean | 是 | 是否还有下一页 |
| `NextCursor` | String | 否 | `HasMore=true` 时用于请求下一页 |

`KnowledgeItem`：

| 参数名 | 类型 | 是否必返 | 描述 |
| :- | :- | :- | :- |
| `RecallContentID` | String | 是 | 内容 ID，可能为空 |
| `ContentType` | String | 是 | `unknown`、`file`、`answer` 或 `article` |
| `Title` | String | 是 | 文件名 |
| `Abstract` | String | 否 | 摘要 |
| `CreatedAt` | Int64 | 否 | 秒级创建时间戳 |
| `UpdatedAt` | Int64 | 否 | 秒级更新时间戳 |
| `OriginUrl` | String | 否 | 原始来源地址；回答和文章为原文地址，文件等其他类型为源文件下载地址 |

请以 `HasMore` 判断是否继续分页，不要根据本页条数推断是否结束。

响应示例：

```json
{
  "Code": 0,
  "Message": "success",
  "Data": {
    "Items": [
      {
        "RecallContentID": "MTAwMjMwMDAwNzUxODUxMDI0Nnw6fFpISV9EQV9VU0VSX1VQTE9BRA==",
        "ContentType": "file",
        "Title": "产品资料.pdf",
        "Abstract": "文档摘要",
        "CreatedAt": 1785900000,
        "UpdatedAt": 1785902400,
        "OriginUrl": "https://assets2.zhihu.com/example/product.pdf"
      }
    ],
    "Total": 12,
    "HasMore": true,
    "NextCursor": "next-cursor"
  }
}
```

## 错误码说明

| 错误码 | 说明 |
| - | - |
| `0` | 成功 |
| `10001` | 请求参数错误 |
| `20001` | 鉴权失败或无访问权限 |
| `30001` | 频率限制 |
| `40004` | 知识库不存在 |
| `90001` | 请求失败 |

## Curl 示例

```bash
curl -G 'https://developer.zhihu.com/api/v1/knowledge/bases/7526139256098382426/items' \
  --data-urlencode 'Limit=20' \
  -H 'Authorization: Bearer <your_access_secret>' \
  -H "X-Request-Timestamp: $(date +%s)"
```
