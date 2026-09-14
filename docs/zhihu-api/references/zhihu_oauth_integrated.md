# 知乎 OAuth 应用集成

本文面向需要集成知乎第三方登录的 Web 应用，介绍如何通过知乎 OAuth 2.0 服务完成账号授权与登录接入。

注：知乎 OAuth 能力是为了集成知乎作为三方登录功能与获取授权用户下的个人信息而使用，如果您只是为了使用知乎数据开放平台上的通用 API 以及查看自己的相关数据，则无需接入，可以直接使用开放平台个人中心创建的 Access Secret 进行调用。

## 一、前置准备

接入前，需要申请应用凭证 `app_id` 和 `app_key`：

- 申请邮箱：`openplatform@zhihu.com`
- 邮件主题：`<公司/组织/产品名称>申请接入知乎 OAuth 服务`
- **申请邮件材料必填内容包含：**
  - 应用名称 
  - 应用简介
  - 应用图标，分辨率 >= 256x256，附件形式发送。
  - 授权回调地址 URL，OAuth 授权完成后的回调地址`redirect_uri`
  - 申请人姓名
  - 申请人手机号
  - 申请人知乎个人中心地址，如：https://www.zhihu.com/people/xxx
  - 申请获取用户权限（多选）：A.邮箱 B.手机 C.公开内容（包含个人创作内容、关注用户列表、公开收藏夹）

注意，您申请获取的用户权限，将会在用户授权时展示给用户进行二次确认，请谨慎选择。


## 二、授权流程

知乎 OAuth API 采用标准的 OAuth 2.0 Authorization Code Flow。

### 1. 引导用户授权

用户点击登录按钮后，Web 应用将用户跳转至知乎授权页面：

```text
https://openapi.zhihu.com/authorize?redirect_uri={redirect_uri}&app_id={app_id}&response_type=code
```

### 2. 用户确认授权

用户在知乎完成登录并确认授权后，平台会将请求重定向至申请时配置的 `redirect_uri`，并携带授权码：

```text
{redirect_uri}?authorization_code={authorization_code}
```

### 3. 换取 Access Token

应用后端使用第 2 步获取的 `authorization_code`，调用“获取 access_token”接口换取 `access_token`。

### 4. 获取用户信息

使用 `access_token` 调用“获取用户信息”接口，获取当前授权用户的基本信息。

> `authorization_code` 的交换和 `access_token` 的使用应在应用后端完成，避免泄露 `app_key` 和用户令牌。

## 三、获取 Access Token

### 接口说明

使用用户授权后获得的 `authorization_code` 换取 `access_token`。完整授权流程参见[二、授权流程](#二-授权流程)。

### 接口信息

| 说明 | 值 |
|---|---|
| HTTP URL | `https://openapi.zhihu.com/access_token` |
| HTTP Method | `POST` |

### 请求参数

| 参数 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `app_id` | string | 是 | 第三方 APP_ID，需向知乎申请 |
| `app_key` | string | 是 | 第三方 APP_KEY，需向知乎申请 |
| `grant_type` | string | 是 | 固定值：`authorization_code` |
| `redirect_uri` | string | 是 | 申请 APP_ID 时填写的重定向地址 |
| `code` | string | 是 | 用户授权后生成的 `authorization_code` |

### 响应数据

#### 成功响应示例

```json
{
  "access_token": "xxx",
  "token_type": "Bearer",
  "expires_in": 3600
}
```

#### 响应字段说明

| 字段 | 类型 | 说明 |
|---|---|---|
| `access_token` | string | 访问令牌 |
| `token_type` | string | 令牌类型，如 `Bearer` |
| `expires_in` | long | 过期时间，单位为秒 |

### cURL 示例

```bash
curl -s -X POST "https://openapi.zhihu.com/access_token" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "app_id=${APP_ID}" \
  -d "app_key=${APP_KEY}" \
  -d "grant_type=authorization_code" \
  -d "redirect_uri=${REDIRECT_URI}" \
  -d "code=${CODE}"
```
