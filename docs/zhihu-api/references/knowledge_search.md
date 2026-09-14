# 知识库检索 API

首次使用请先登录直答知识库完成初始化 https://zhida.zhihu.com/repositories/square

## 接口说明

使用 RAG 从指定知识库或召回范围中检索相关文档片段。

## 接口信息

| 说明 | 值 |
| - | - |
| HTTP URL | `https://developer.zhihu.com/api/v1/knowledge/search` |
| HTTP Method | `POST` |
| Content-Type | `application/json` |
| API ID | `knowledge_search` |

## 请求参数

### Header

- `Authorization`：`Bearer <your_access_secret>`
- `X-Request-Timestamp`：秒级 Unix 时间戳
- `Content-Type`：`application/json`

### JSON Body

| 名称 | 类型 | 必填 | 默认值 | 说明 |
| :- | :- | :- | :- | :- |
| `Query` | String | 是 | - | 检索问题，去除首尾空白后不能为空 |
| `KnowledgeBaseIDs` | Array[String] | 条件必填 | `[]` | 指定知识库 ID 列表 |
| `RecallScopes` | Array[String] | 条件必填 | `[]` | `personal`、`subscription`、`public` |
| `Limit` | Int32 | 否 | `10` | 返回文档数量，范围 `1..10` |

`KnowledgeBaseIDs` 和 `RecallScopes` 至少有一个非空，也可以同时传入；同时传入时搜索范围取二者并集。

请求示例：

```json
{
  "Query": "产品的退款规则是什么？",
  "KnowledgeBaseIDs": ["7526139256098382426"],
  "RecallScopes": ["personal", "subscription"],
  "Limit": 10
}
```

## 响应参数

`Data`：

| 参数名 | 类型 | 是否必返 | 描述 |
| :- | :- | :- | :- |
| `Items` | Array[SearchItem] | 是 | 按相关性返回的文档结果 |

`SearchItem`：

| 参数名 | 类型 | 是否必返 | 描述 |
| :- | :- | :- | :- |
| `Content` | Array[String] | 是 | 同一文档命中的有序正文片段列表 |
| `KnowledgeBaseID` | String | 是 | 所属知识库 ID |
| `DocName` | String | 是 | 文档名称 |
| `RecallContentID` | String | 否 | 内容 ID |
| `OriginUrl` | String | 否 | 原始来源地址；回答和文章为原文地址，文件等其他类型为源文件下载地址 |

`Limit` 按文档结果数计算，不按 `Content` 中的片段数计算。

响应示例：

```json
{
  "Code": 0,
  "Message": "success",
  "Data": {
    "Items": [
      {
        "Content": [
          "退款申请需要在购买后七天内提交。",
          "退款到账通常需要三个工作日。"
        ],
        "KnowledgeBaseID": "7526139256098382426",
        "DocName": "退款规则",
        "RecallContentID": "MTAwMjMwMDAwNzUxODUxMDI0Nnw6fFpISV9EQV9VU0VSX1VQTE9BRA==",
        "OriginUrl": "https://assets2.zhihu.com/example/refund.md"
      }
    ]
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
| `50002` | 检索失败，请稍后重试 |
| `90001` | 请求失败 |

## Curl 示例

```bash
curl 'https://developer.zhihu.com/api/v1/knowledge/search' \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer <your_access_secret>' \
  -H "X-Request-Timestamp: $(date +%s)" \
  --data '{
    "Query": "产品的退款规则是什么？",
    "KnowledgeBaseIDs": ["7526139256098382426"],
    "RecallScopes": ["personal"],
    "Limit": 10
  }'
```
