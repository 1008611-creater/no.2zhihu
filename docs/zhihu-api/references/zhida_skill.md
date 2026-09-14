# 直答 Skill

## 能力说明

该 Skill 提供面向 AI 助手与 Agent 的直答能力，适合处理用户提问、知识问答、内容解释与总结等场景。

## 下载方式

- `https://developer.zhihu.com/download/zhida_skills.zip`

## 请求参数

| 名称 | 类型 | 必填 | 说明 |
| :- | :- | :- | :- |
| `query` | String | 是 | 用户问题，不能为空 |
| `model` | String | 否 | 模型名称，默认 `zhida-fast-1p5`；还可选择 `zhida-thinking-1p5` 或 `zhida-agent` |
| `stream` | Bool | 否 | 是否使用流式响应，默认 `false` |
| `output` | String | 否 | 输出格式。非流式请求使用 `json`；流式请求可使用 `sse` 或 `text` |

```json
{
  "query": "什么是 RAG？",
  "model": "zhida-thinking-1p5",
  "stream": false,
  "output": "json"
}
```

## 非流式响应参数

| 字段 | 类型 | 说明 |
| :- | :- | :- |
| `id` | String | 本次响应 ID |
| `object` | String | 响应对象类型 |
| `created` | Int64 | 响应创建时间 |
| `model` | String | 实际使用的模型 |
| `choices` | Array | 回答列表 |
| `choices[].index` | Int | 回答序号 |
| `choices[].message` | Object | 回答内容 |
| `choices[].message.role` | String | 消息角色 |
| `choices[].message.reasoning_content` | String | 推理内容，是否返回取决于所选模型 |
| `choices[].message.content` | String | 回答正文 |
| `choices[].finish_reason` | String | 生成结束原因 |

```json
{
  "id": "chatcmpl-example",
  "object": "chat.completion",
  "created": 1753632000,
  "model": "zhida-thinking-1p5",
  "choices": [
    {
      "index": 0,
      "message": {
        "role": "assistant",
        "reasoning_content": "",
        "content": "RAG 是一种结合信息检索与文本生成的方法。"
      },
      "finish_reason": "stop"
    }
  ]
}
```

## 流式响应参数

当 `stream=true` 且 `output=sse` 时，响应由多条 SSE 事件组成。每条事件的 `data` 为一个 JSON 对象，结束事件为 `data: [DONE]`。

| 字段 | 类型 | 说明 |
| :- | :- | :- |
| `id` | String | 本次响应 ID |
| `object` | String | 响应对象类型 |
| `created` | Int64 | 响应创建时间 |
| `model` | String | 实际使用的模型 |
| `choices` | Array | 增量回答列表 |
| `choices[].index` | Int | 回答序号 |
| `choices[].delta.role` | String | 消息角色 |
| `choices[].delta.reasoning_content` | String | 增量推理内容 |
| `choices[].delta.content` | String | 增量回答正文 |
| `choices[].finish_reason` | String | 生成结束原因 |

当 `stream=true` 且 `output=text` 时，输出回答正文。

调用失败时会返回错误信息并以非零状态结束。请根据错误提示检查请求参数、模型名称、认证配置或调用频率。
