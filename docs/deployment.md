# 部署说明

> 最后更新：2026-09-14 ｜ 目标：拿到评委可直接打开的公网 Demo
> 平台：Vercel（Next.js 官方支持，免费额度足够）

---

## 一、部署前检查

| 检查项 | 命令 / 位置 | 通过标准 |
|---|---|---|
| Node 版本 | `node -v` | ≥ 18.18（建议 20 LTS） |
| 依赖可装 | `npm install` | 无 error |
| 本地构建 | `npm run build` | `Compiled successfully` |
| 凭证未入库 | `git check-ignore -v .env.local` | 有输出（被忽略） |

---

## 二、环境变量

在 Vercel 项目设置的 **Environment Variables** 里添加：

| 名称 | 必填 | 值 | 说明 |
|---|---|---|---|
| `ZHIHU_ACCESS_SECRET` | **是** | 知乎开放平台 Access Secret | 只配在服务端。Production + Preview 都勾上 |
| `ZHIHU_USE_ZHIDA` | 否 | `0` 表示关闭直答 | 默认开启；只在需要强制降级演示时设 `0` |
| `NEXT_PUBLIC_SITE_URL` | 否 | `https://<你的域名>` | 用于 sitemap 生成绝对地址 |

**获取 Access Secret**：https://developer.zhihu.com/profile → 密钥管理。

> 安全：Secret 只在服务端环境变量里。`lib/zhihu/` 标注 `server-only`，
> 编译期就阻止它进入客户端 bundle。`/api/health` 只返回布尔值，不回显内容。

---

## 三、部署步骤

### 路线 A：Vercel 网页导入（推荐）

1. 用 GitHub 账号登录 https://vercel.com
2. **Add New → Project → Import Git Repository**，选 `no.2zhihu`
3. Framework Preset 自动识别为 **Next.js**，不要改
4. 展开 **Environment Variables**，按上表添加
5. Runtime 保持 **Node.js**（不要选 Edge —— 见下方故障排查）
6. 点 **Deploy**，等 1–2 分钟

### 路线 B：命令行

```bash
npm i -g vercel
vercel login
vercel --prod
# 交互里配置 ZHIHU_ACCESS_SECRET
```

### 部署后验证

打开 `https://<你的域名>/api/health`，应返回：

```json
{ "ok": true, "credentials": true, "cache": { "size": 0, "inflight": 0 }, "at": "..." }
```

- `credentials: false` → 环境变量没配上，回去检查并 **Redeploy**（环境变量改动需重新部署才生效）。
- 打不开 → 看 Vercel 的 Build Logs。

---

## 四、Vercel 配置说明

`vercel.json` 已包含：

```json
{
  "framework": "nextjs",
  "buildCommand": "next build",
  "installCommand": "npm install",
  "headers": [
    { "source": "/api/(.*)", "headers": [{ "key": "Cache-Control", "value": "no-store, max-age=0" }] }
  ]
}
```

- `/api/*` 强制不缓存，避免把别人的额度结果缓存成公共响应。
- 上游调用统一 `cache: "no-store"`，缓存由 `lib/zhihu/cache.ts` 在进程内控制。

### 函数超时

`app/api/mirror/route.ts` 声明 `export const maxDuration = 60`。
完整流水线实测约 16–36 秒（4 个分身 × 检索 + 直答），在 60 秒内。
Vercel Hobby 计划函数上限 60 秒，正好够用；如果超时，把 `evidencePerSkill` 降到 2。

---

## 五、故障排查

| 现象 | 原因 | 处理 |
|---|---|---|
| 页面显示「演示模式」 | 未配置 `ZHIHU_ACCESS_SECRET` | 检查环境变量，**重新部署** |
| 接口 401 / 20001 | Secret 失效或过期 | 到开放平台重新生成 |
| TLS 握手失败 `SEC_E_NO_CREDENTIALS` | 用了 Edge runtime，或本地 curl/PowerShell | 所有调上游的 route 必须 `export const runtime = "nodejs"` |
| 额度耗尽 30002 | 当日额度用完 | 次日 0 点重置；本地清缓存重试 |
| 搜索总是返回 10 条 | 参数名写成 `Limit` | 搜索类接口的条数参数是 `Count` |
| 部分分身无证据 | 上游并发限流 | 已串行闸门 + 退避重试；降级结果只缓存 60 秒，稍后重试即可 |
| 构建报类型错误 | 上游响应类型不匹配 | 在 `lib/zhihu/types.ts` 补字段，不要用 `any` 绕过 |
| 首屏很慢 | 冷启动 + 首次真实调用 | 演示前预热一次，结果缓存 30 分钟 |

---

## 六、安全：轮换 Access Secret

如果 Secret 曾出现在聊天、截图或任何公开位置，按下面顺序轮换：

1. 到 https://developer.zhihu.com/profile 生成新 Secret。
2. 改本地 `E:\codex\heikesong3\.env.local` 的 `ZHIHU_ACCESS_SECRET`。
3. 改 Vercel 项目的同名环境变量，然后 **Redeploy**。
4. 到开放平台删除旧 Secret。

> `.env.local` 已在 `.gitignore` 中，不会进仓库。
> 但轮换才是真正的安全 —— 曾经暴露过的值永远算泄漏。

---

## 七、提交清单映射

| 提交项 | 必需 | 内容 |
|---|---|---|
| ① 可运行体验链接 | **必交** | `https://<你的域名>` |
| ② 产品说明计划书 | **必交** | [product-plan.md](product-plan.md) 导出上传 |
| ③ 代码仓库链接 | 加分 | https://github.com/1008611-creater/no.2zhihu |
| ④ 项目演示视频 | 加分 | 按 [demo-script.md](demo-script.md) 录制后填公开链接 |
| 封面图 | 加分 | `docs/assets/cover.svg` |

**人气奖提示**：允许先占位上架再持续迭代，建议部署完成后立刻提交一次，之后再更新。
