# PPT 生成 API

## 接口说明

该接口用于根据知乎回答或文章链接异步生成 PPT。调用方创建任务后可通过查询接口轮询任务状态，任务成功后返回 PPTX 文件下载链接。

## 调用流程

1. 提交知乎回答或文章链接，创建 PPT 生成任务。
2. 获取 `task_id`。
3. 使用 `task_id` 轮询任务状态。
4. 当 `task_status=succeeded` 时，从 `result.url` 下载 PPTX 文件。

## 鉴权

Header：

- `Authorization: Bearer <your_access_secret>`
- `X-Request-Timestamp: <unix_seconds>`

说明：

- `X-Request-Timestamp` 为 Unix 秒级时间戳。
- 创建任务接口支持可选 Header：`Idempotency-Key`。同一个 `Idempotency-Key` 配合同一个请求参数重复调用时，会返回同一个 `task_id`。

## 1. 创建 PPT 生成任务

### 接口信息

| 说明 | 值 |
| :- | :- |
| HTTP URL | `https://developer.zhihu.com/api/v1/ppt-generation/tasks` |
| HTTP Method | `POST` |
| 请求类型 | `application/json` |
| 响应类型 | `application/json` |

### 请求参数

Body：

| 名称 | 类型 | 必填 | 说明 |
| :- | :- | :- | :- |
| `resource_url` | String | 是 | 知乎回答或文章链接 |
| `num_pages` | Int32 | 是 | 期望生成页数，范围 6 到 21 |

`resource_url` 当前支持：

- `https://www.zhihu.com/question/{question_id}/answer/{answer_id}`
- `https://www.zhihu.com/answer/{answer_id}`
- `https://zhuanlan.zhihu.com/p/{article_id}`

### 请求示例

```json
{
  "resource_url": "https://www.zhihu.com/question/1892249263213356127/answer/2021688002292752412",
  "num_pages": 12
}
```

### 响应参数

Data：

| 名称 | 类型 | 是否必返 | 说明 |
| :- | :- | :- | :- |
| `task_id` | String | 是 | PPT 生成任务 ID |
| `task_status` | String | 是 | 任务状态，初始通常为 `pending` |

### 响应示例

```json
{
  "Code": 0,
  "Message": "success",
  "Data": {
    "task_id": "ppt_39b0e572b738a5ce8c5be600f9cf7b91",
    "task_status": "pending"
  }
}
```

如果命中幂等重放，响应 Header 会包含：

```text
Idempotent-Replayed: true
```

### Curl 示例

```bash
curl -X POST 'https://developer.zhihu.com/api/v1/ppt-generation/tasks' \
  -H 'Authorization: Bearer <your_access_secret>' \
  -H "X-Request-Timestamp: $(date +%s)" \
  -H 'Content-Type: application/json' \
  -H 'Idempotency-Key: ppt-request-001' \
  -d '{
    "resource_url": "https://www.zhihu.com/question/1892249263213356127/answer/2021688002292752412",
    "num_pages": 12
  }'
```

## 2. 查询 PPT 生成任务

### 接口信息

| 说明 | 值 |
| :- | :- |
| HTTP URL | `https://developer.zhihu.com/api/v1/ppt-generation/tasks/{task_id}` |
| HTTP Method | `GET` |
| 响应类型 | `application/json` |

### Path 参数

| 名称 | 类型 | 必填 | 说明 |
| :- | :- | :- | :- |
| `task_id` | String | 是 | 创建任务接口返回的任务 ID |

### 响应参数

Data：

| 名称 | 类型 | 是否必返 | 说明 |
| :- | :- | :- | :- |
| `task_id` | String | 是 | PPT 生成任务 ID |
| `task_status` | String | 是 | 任务状态 |
| `progress` | Number | 是 | 任务进度，范围 0 到 1 |
| `result` | Object or Null | 是 | 任务成功后返回结果信息，未完成或失败时为 `null` |
| `error` | Object or Null | 是 | 任务失败时返回错误信息，未失败时为 `null` |

`task_status` 取值：

| 值 | 说明 |
| :- | :- |
| `pending` | 任务已创建，等待处理 |
| `running` | 任务处理中 |
| `succeeded` | 任务已成功 |
| `failed` | 任务失败 |

Result：

| 名称 | 类型 | 是否必返 | 说明 |
| :- | :- | :- | :- |
| `url` | String | 是 | PPTX 文件下载链接 |
| `expires_at_ms` | Int64 | 是 | 下载链接过期时间，毫秒级时间戳 |

Error：

| 名称 | 类型 | 是否必返 | 说明 |
| :- | :- | :- | :- |
| `code` | String | 是 | 错误码 |
| `message` | String | 是 | 错误信息 |

### 处理中响应示例

```json
{
  "Code": 0,
  "Message": "success",
  "Data": {
    "task_id": "ppt_39b0e572b738a5ce8c5be600f9cf7b91",
    "task_status": "running",
    "progress": 0.45,
    "result": null,
    "error": null
  }
}
```

### 成功响应示例

```json
{
  "Code": 0,
  "Message": "success",
  "Data": {
    "task_id": "ppt_39b0e572b738a5ce8c5be600f9cf7b91",
    "task_status": "succeeded",
    "progress": 1,
    "result": {
      "url": "https://zhihu-openapi.bj.bcebos.com/...?authorization=...",
      "expires_at_ms": 1782800000000
    },
    "error": null
  }
}
```

### 失败响应示例

```json
{
  "Code": 0,
  "Message": "success",
  "Data": {
    "task_id": "ppt_39b0e572b738a5ce8c5be600f9cf7b91",
    "task_status": "failed",
    "progress": 0,
    "result": null,
    "error": {
      "code": "generation_failed",
      "message": "PPT generation failed"
    }
  }
}
```

### Curl 示例

```bash
curl 'https://developer.zhihu.com/api/v1/ppt-generation/tasks/ppt_39b0e572b738a5ce8c5be600f9cf7b91' \
  -H 'Authorization: Bearer <your_access_secret>' \
  -H "X-Request-Timestamp: $(date +%s)"
```

## 错误响应

```json
{
  "Code": 10001,
  "Message": "resource_url is not supported",
  "Data": null
}
```

常见错误：

| Code | 说明 |
| :- | :- |
| `10001` | 请求参数错误 |
| `20001` | 鉴权失败或无权限访问 |
| `30001` | 请求过于频繁 |
| `30002` | 额度不足 |
| `40001` | 幂等键与请求参数冲突 |
| `40003` | 活跃任务数超限，请等待已有任务完成后再提交 |
| `90001` | 服务内部错误 |

## 注意事项

1. 当前仅支持知乎回答和知乎专栏文章链接。
2. `num_pages` 必须在 6 到 21 之间。
3. 查询接口返回的下载链接有效期较短；如果链接过期，重新查询任务可获得新的下载链接。
4. 不要把同一个 `Idempotency-Key` 用于不同请求参数。
