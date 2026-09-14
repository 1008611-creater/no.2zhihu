# 知乎搜索 MCP

## 接口说明

该服务通过 MCP over SSE 提供知乎站内搜索能力，适合接入支持 MCP 的 Agent、助手或工作流系统。

当前服务仅提供工具能力，不提供资源（resources）与提示词（prompts）能力。

## 接口信息

| 说明 | 值 |
| :- | :- |
| SSE URL | `https://developer.zhihu.com/api/mcp/zhihu_search/v1/sse` |
| Message URL | `https://developer.zhihu.com/api/mcp/zhihu_search/v1/message` |
| 传输方式 | `MCP over SSE` |
| 工具名 | `zhihu_search` |

说明：

- 客户端先连接 `sse` 端点。
- 服务端会通过 `endpoint` 事件返回实际可用的 `message` 地址，地址中会带 `sessionId`。
- 后续 `initialize`、`tools/list`、`tools/call` 请求均发送到该 `message` 地址。

## 鉴权

请求头：

- `Authorization: Bearer <your_access_secret>`

说明：

- 建议在 `sse` 连接和后续 `message` 请求中均携带同一份鉴权信息。

## 工具定义

### `zhihu_search`

#### 入参

| 名称 | 类型 | 必填 | 说明 |
| :- | :- | :- | :- |
| `query` | String | 是 | 搜索关键词，长度 2-100 个字符 |
| `count` | Number | 否 | 返回条数，取值范围 1-10，默认 `10` |

#### 返回

工具调用结果为 `text` 类型内容，正文为面向大模型消费的结构化文本。

返回主体示例：

```text
<zhihu_search query="RAG">
<search_item title="RAG 评测方法综述" content_type="Article" url="https://..." author_name="张三" author_avatar="https://..." author_badge_text="" edit_time="2025-03-01 10:00:00 +0000 UTC" authority_level="2" ranking_score="0.9800">
本文介绍了主流 RAG 评测框架，包括 RAGAS、TruLens ...
</search_item>
</zhihu_search>
```

说明：

- 返回值外层是 MCP `text` 类型，文本内容为 XML。
- 建议将整段 XML 原样交给模型消费，不建议自行裁剪字段。

## 接入流程

### 1. 建立 SSE 连接

```bash
curl -N 'https://developer.zhihu.com/api/mcp/zhihu_search/v1/sse' \
  -H 'Authorization: Bearer <your_access_secret>' \
  -H 'Accept: text/event-stream'
```

服务端会先返回一条 `endpoint` 事件，例如：

```text
event: endpoint
data: /api/mcp/zhihu_search/v1/message?sessionId=xxx
```

### 2. 初始化 MCP 会话

将上一步拿到的 `message` 地址记为 `MESSAGE_URL`。

```bash
curl -X POST "$MESSAGE_URL" \
  -H 'Authorization: Bearer <your_access_secret>' \
  -H 'Content-Type: application/json' \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "initialize",
    "params": {
      "protocolVersion": "2024-11-05",
      "clientInfo": {
        "name": "demo-client",
        "version": "1.0.0"
      },
      "capabilities": {}
    }
  }'
```

说明：

- `message` 端点通常会先返回 HTTP `202 Accepted`。
- 实际 JSON-RPC 响应会通过已建立的 SSE 通道异步返回。

### 3. 获取工具列表

```bash
curl -X POST "$MESSAGE_URL" \
  -H 'Authorization: Bearer <your_access_secret>' \
  -H 'Content-Type: application/json' \
  -d '{
    "jsonrpc": "2.0",
    "id": 2,
    "method": "tools/list"
  }'
```

### 4. 调用搜索工具

```bash
curl -X POST "$MESSAGE_URL" \
  -H 'Authorization: Bearer <your_access_secret>' \
  -H 'Content-Type: application/json' \
  -d '{
    "jsonrpc": "2.0",
    "id": 3,
    "method": "tools/call",
    "params": {
      "name": "zhihu_search",
      "arguments": {
        "query": "RAG",
        "count": 5
      }
    }
  }'
```

SSE 通道中会收到对应响应，例如：

```text
event: message
data: {"jsonrpc":"2.0","id":3,"result":{"content":[{"type":"text","text":"<zhihu_search query=\"RAG\">..."}]}}
```

## 注意事项

1. 该服务采用标准 MCP 工具调用模式，推荐直接使用现成 MCP Client 接入。
2. `tools/call` 的结果通过已建立的 SSE 通道返回，而不是直接同步返回在 POST 响应体中。
3. `query` 建议尽量具体，以获得更稳定的搜索结果。
