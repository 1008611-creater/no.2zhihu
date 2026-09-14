# 热榜 MCP

## 接口说明

该服务通过 MCP over SSE 提供知乎热榜能力，适合接入支持 MCP 的 Agent、助手或工作流系统。

当前服务仅提供工具能力，不提供资源（resources）与提示词（prompts）能力。

## 接口信息

| 说明 | 值 |
| :- | :- |
| SSE URL | `https://developer.zhihu.com/api/mcp/hot_list/v1/sse` |
| Message URL | `https://developer.zhihu.com/api/mcp/hot_list/v1/message` |
| 传输方式 | `MCP over SSE` |
| 工具名 | `hot_list` |

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

### `hot_list`

#### 入参

| 名称 | 类型 | 必填 | 说明 |
| :- | :- | :- | :- |
| `limit` | Number | 否 | 返回条数，取值范围 1-30，默认 `30` |

#### 返回

工具调用结果为 `text` 类型内容，正文为面向大模型消费的结构化文本。

返回主体示例：

```text
<hot_list limit="30" total="3">
  <item rank="1">
    <title>如何看待当前 AI Agent 的发展趋势？</title>
    <url>https://www.zhihu.com/question/123456789</url>
    <thumbnail_url>https://pic1.zhimg.com/v2-d4b0f8158e064dbcc71eb6ce970230a9.jpg</thumbnail_url>
    <summary>这是该问题的内容摘要</summary>
  </item>
  <item rank="2">
    <title>有哪些值得关注的技术热点？</title>
    <url>https://zhuanlan.zhihu.com/p/987654321</url>
    <thumbnail_url>https://pic1.zhimg.com/v2-abcdef1234567890abcdef1234567890.jpg</thumbnail_url>
    <summary>这是该文章的内容摘要</summary>
  </item>
  <item rank="3">
    <title>为什么这条话题会进入热榜？</title>
    <url>https://www.zhihu.com/question/111111111</url>
    <thumbnail_url></thumbnail_url>
    <summary></summary>
  </item>
</hot_list>
```

说明：

- `thumbnail_url` 和 `summary` 始终返回，无数据时为空（如 rank="3" 示例）。
- 返回值外层是 MCP `text` 类型，文本内容为 XML。
- 建议将整段 XML 原样交给模型消费，不建议自行裁剪字段。

## 接入流程

### 1. 建立 SSE 连接

```bash
curl -N 'https://developer.zhihu.com/api/mcp/hot_list/v1/sse' \
  -H 'Authorization: Bearer <your_access_secret>' \
  -H 'Accept: text/event-stream'
```

服务端会先返回一条 `endpoint` 事件，例如：

```text
event: endpoint
data: /api/mcp/hot_list/v1/message?sessionId=xxx
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

### 4. 调用热榜工具

```bash
curl -X POST "$MESSAGE_URL" \
  -H 'Authorization: Bearer <your_access_secret>' \
  -H 'Content-Type: application/json' \
  -d '{
    "jsonrpc": "2.0",
    "id": 3,
    "method": "tools/call",
    "params": {
      "name": "hot_list",
      "arguments": {
        "limit": 10
      }
    }
  }'
```

SSE 通道中会收到对应响应，例如：

```text
event: message
data: {"jsonrpc":"2.0","id":3,"result":{"content":[{"type":"text","text":"<hot_list limit=\"10\" total=\"10\">..."}]}}
```

## 注意事项

1. 该服务采用标准 MCP 工具调用模式，推荐直接使用现成 MCP Client 接入。
2. `tools/call` 的结果通过已建立的 SSE 通道返回，而不是直接同步返回在 POST 响应体中。
3. 热榜结果偏实时性，列表顺序和内容会随时间变化。
