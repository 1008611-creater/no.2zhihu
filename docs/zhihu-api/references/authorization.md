# Bearer 鉴权说明

## 说明

知乎开放平台当前推荐通过 `Authorization: Bearer <your_access_secret>` 的方式调用数据接口。

对于 `zhihu_search`、`global_search`、`hot_list` 等接口，调用时统一使用 Bearer 鉴权即可。

## 获取 Access Secret

请在知乎开放平台[个人中心](https://developer.zhihu.com/profile)查看并获取 Access Secret

说明：

- 调用方需要将 Access Secret 作为 Bearer Token 放入请求头。
- 服务端会校验 `Authorization` 与 `X-Request-Timestamp`。
- `X-Request-Timestamp` 需要传秒级 Unix 时间戳。

## 请求头示例

| 名称 | 示例值 | 说明 |
| - | - | - |
| Authorization | `Bearer <your_access_secret>` | Bearer 鉴权头 |
| X-Request-Timestamp | `1742822400` | 秒级 Unix 时间戳 |
| Content-Type | `application/json` | JSON 接口固定值 |

## Curl 示例

```shell
curl -G 'https://developer.zhihu.com/api/v1/content/zhihu_search' \
  --data-urlencode 'Query=怎么理解rave文化' \
  -H 'Authorization: Bearer <your_access_secret>' \
  -H "X-Request-Timestamp: $(date +%s)" \
  -H 'Content-Type: application/json'
```
