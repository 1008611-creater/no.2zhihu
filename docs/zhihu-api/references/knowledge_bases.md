# 知识库列表 API

首次使用请先登录直答知识库完成初始化 https://zhida.zhihu.com/repositories/square

## 接口说明

获取当前用户创建或订阅的知识库。

## 接口信息

| 说明 | 值 |
| - | - |
| HTTP URL | `https://developer.zhihu.com/api/v1/knowledge/bases` |
| HTTP Method | `GET` |
| API ID | `knowledge_bases` |

## 请求参数

### Header

- `Authorization`：`Bearer <your_access_secret>`
- `X-Request-Timestamp`：秒级 Unix 时间戳

### Query

| 名称 | 类型 | 必填 | 默认值 | 说明 |
| :- | :- | :- | :- | :- |
| `Scope` | String | 否 | `all` | `all`、`created` 或 `subscribed` |

## 响应参数

`Data`：

| 参数名 | 类型 | 是否必返 | 描述 |
| :- | :- | :- | :- |
| `Items` | Array[KnowledgeBase] | 是 | 符合条件的全部知识库 |

`KnowledgeBase`：

| 参数名 | 类型 | 是否必返 | 描述 |
| :- | :- | :- | :- |
| `KnowledgeBaseID` | String | 是 | 知识库 ID |
| `Name` | String | 是 | 知识库名称 |
| `Description` | String | 否 | 知识库描述 |
| `Relation` | String | 是 | 当前用户与知识库的关系：`created`、`subscribed` 或 `both` |
| `IsDefault` | Boolean | 是 | 是否为当前用户的默认知识库 |
| `Visibility` | String | 是 | 可见性：`private` 或 `public` |
| `ContentCount` | Int64 | 是 | 内容数量 |
| `UpdatedAt` | Int64 | 是 | 秒级更新时间戳 |

响应示例：

```json
{
  "Code": 0,
  "Message": "success",
  "Data": {
    "Items": [
      {
        "KnowledgeBaseID": "7526139256098382426",
        "Name": "产品资料",
        "Description": "产品相关文档",
        "Relation": "created",
        "IsDefault": false,
        "Visibility": "private",
        "ContentCount": 12,
        "UpdatedAt": 1785902400
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
| `90001` | 请求失败 |

## Curl 示例

```bash
curl -G 'https://developer.zhihu.com/api/v1/knowledge/bases' \
  --data-urlencode 'Scope=all' \
  -H 'Authorization: Bearer <your_access_secret>' \
  -H "X-Request-Timestamp: $(date +%s)"
```
