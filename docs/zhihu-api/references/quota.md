# 额度查询 API

## 接口说明

您可以通过 API 查询当前 Access Secret 所属账号在自然日内的各项能力的每日限免额度，该查询不会消耗业务额度。

具体您也可以点击「个人中心」 - 「用量统计」，查看对应的额度。

## 请求

```http
GET /api/v1/quota
```

### 请求头

| 参数 | 必填 | 说明 |
| --- | --- | --- |
| `Authorization` | 是 | `Bearer <your_access_secret>` |
| `X-Request-Timestamp` | 是 | Unix 秒级时间戳，与服务端时间相差不能超过 10 分钟 |

### Query 参数

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `APIIDs` | String | 否 | 多个 API ID 用逗号分隔，`APIIDs` 参数只能出现一次；未提供时返回全部可展示额度 |

### 可查询额度项

| API ID | 名称 | 覆盖范围 |
| --- | --- | --- |
| `global_search` | 全网搜 | 全网搜索 |
| `zhihu_search` | 知乎搜索 | 知乎内容搜索 |
| `hot_list` | 热榜 | 知乎热榜 |
| `question_answers` | 知乎问题回答 | 获取问题下的回答摘要 |
| `user_data` | 知乎用户数据 | 用户创作列表、关注、收藏及收藏夹数据 |
| `creator` | 创作能力 | 个性化问题推荐、根据主题推荐问题、本人全文、评论、账号统计、单篇统计 |
| `zhida_openai` | 直答 | 直答服务 |
| `knowledge` | 知识库 | 知识库文件上传、知识库列表、知识库内容列表及知识库检索 |
| `tools` | 小工具 | PDF 解析及 PPT 生成 |

不传 `APIIDs` 时，返回以上全部额度项。

实际额度以查询结果为准；账号关联多个租户时，查询结果会汇总相关租户额度。

指定额度项示例：

```http
GET /api/v1/quota?APIIDs=knowledge,zhihu_search
```

## 响应

```json
{
  "Code": 0,
  "Message": "success",
  "Data": [
    {
      "APIID": "knowledge",
      "APIName": "知识库",
      "TotalQuota": 500,
      "TotalUsed": 12,
      "RemainingQuota": 488
    }
  ]
}
```

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `APIID` | String | 额度项 ID |
| `APIName` | String | 额度项名称 |
| `TotalQuota` | Int64 | 当前自然日总额度 |
| `TotalUsed` | Int64 | 当前自然日已使用额度 |
| `RemainingQuota` | Int64 | 当前自然日剩余额度，最低为 0 |

## 调用示例

```bash
curl -G 'https://developer.zhihu.com/api/v1/quota' \
  --data-urlencode 'APIIDs=knowledge,zhihu_search' \
  -H 'Authorization: Bearer <your_access_secret>' \
  -H "X-Request-Timestamp: $(date +%s)"
```

## 错误码

| Code | 说明 |
| --- | --- |
| `10001` | `APIIDs` 参数格式错误或包含未知 API ID |
| `20001` | Access Secret 鉴权失败 |
| `30001` | 请求频率超过限制，请稍后重试 |
| `90001` | 额度数据读取失败 |
