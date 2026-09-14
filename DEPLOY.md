# 发布清单（你只需执行 1 步：部署到 Vercel）

> 最后更新：2026-09-14 ｜ 代码已推送、云端 CI 已通过
> **现在只剩一件事：部署到 Vercel 拿公网 Demo 链接**（下方第 3 步）。

---

## ✅ 已完成：构建验证与代码推送（2026-09-14）

这两步**不用你再做了**，已经通过 GitHub 云端完成。

| 步骤 | 结果 | 怎么核对 |
|---|---|---|
| 构建验证 | ✅ 云端 CI 全绿（装依赖 → 类型检查 → 构建） | [运行记录](https://github.com/1008611-creater/no.2zhihu/actions/runs/34835482253) |
| 代码推送 | ✅ 131 文件已推送，`main` = `71cf2ae` | <https://github.com/1008611-creater/no.2zhihu> |

为什么不用本机跑：本 AI 会话的沙箱禁止启动子进程（`git` / `npm` 都返回 EPERM），
所以构建交给云端 CI、推送交给 GitHub HTTP API。原理见 [docs/agent-environment.md](docs/agent-environment.md)。

CI 会在**每次 push 和每个 PR** 时自动重跑，之后队友改代码也有安全网。

> 顺带说明：仓库里有 `.github/workflows/ci.yml`，它不注入真实凭证（`ZHIHU_ACCESS_SECRET` 给空值），
> 构建阶段走降级路径即可通过，不会把密钥带到 CI 日志里。

---
## 第 3 步：部署到 Vercel（约 3 分钟）

1. 用 GitHub 账号登录 <https://vercel.com>。
2. **Add New → Project → Import Git Repository**，选 `no.2zhihu`。
3. Framework Preset 自动识别为 **Next.js**，不要改。
4. 展开 **Environment Variables**，添加：

| Name | Value | Environments |
|---|---|---|
| `ZHIHU_ACCESS_SECRET` | 你的 Access Secret | Production + Preview + Development |

5. 点 **Deploy**，等 1–2 分钟。
6. 打开 `https://<项目名>.vercel.app/api/health`，确认：

```json
{ "ok": true, "credentials": true, "cache": { "size": 0, "inflight": 0 } }
```

`credentials: false` 说明环境变量没配上，回第 4 步检查，改完要 **Redeploy** 才生效。

---

## 第 3.5 步：导出封面图与 icon（约 1 分钟）

赛事表单里的封面图 / icon 通常要求 PNG，而仓库里存的是矢量源文件（SVG）。用下面这条命令
把它们渲染成 PNG —— 调用本机已装的 Edge / Chrome 无头截图，**零安装、零联网**：

```powershell
cd E:\codex\heikesong3
powershell -ExecutionPolicy Bypass -File scripts/export-assets.ps1
```

产物在 `docs/assets/export/`：

| 文件 | 尺寸 | 用途 |
|---|---|---|
| `cover-1920x1080.png` | 1920×1080（16:9） | 封面图主用 |
| `cover-1280x720.png` | 1280×720（16:9） | 封面图备选（页面限制体积时） |
| `cover-1600x900.png` | 1600×900（16:9） | 封面图备选 |
| `icon-1024.png` / `icon-512.png` / `icon-256.png` | 正方形 | icon 按页面要求选一个 |

最终尺寸以赛事页面实际标注为准。PNG 不含任何凭证，可放心上传。

---

## 第 4 步：提交作品（截止 2026-09-15 10:00）

到 <https://www.zhihu.com/hackathon?activity_code=zhihu_hackathon_2026_p2> 填写：

| 提交项 | 必需 | 填什么 |
|---|---|---|
| ① 可运行体验链接 | **必交** | `https://<项目名>.vercel.app` |
| ② 产品说明计划书 | **必交** | [docs/product-plan.md](docs/product-plan.md) 导出成 PDF / 飞书文档上传 |
| ③ 代码仓库链接 | 加分 | `https://github.com/1008611-creater/no.2zhihu` |
| ④ 项目演示视频 | 加分 | 按 [docs/demo-script.md](docs/demo-script.md) 录制后填公开链接 |
| 封面图 | 加分 | 先跑 `scripts/export-assets.ps1` 导出 PNG，上传 `docs/assets/export/cover-1920x1080.png` |
| 项目 icon | 加分 | 同上，上传 `docs/assets/export/icon-512.png` |

> **人气奖提示**：官方允许先占位上架、持续迭代。建议部署一成功就立刻提交一次占位，之后再更新。

---

## 安全：轮换 Access Secret

你说过会自己换 key，换完后：

1. 改本地 `E:\codex\heikesong3\.env.local` 里的 `ZHIHU_ACCESS_SECRET`。
2. 改 Vercel 项目的同名环境变量，然后 **Redeploy**（环境变量改动需要重新部署才生效）。
3. 旧 key 到 <https://developer.zhihu.com/profile> 删除。

> 提醒：`.env.local` 已被 gitignore，不会进仓库；但如果你曾把 key 贴到别处（聊天、截图、issue），
> 轮换之后才算真正安全。本仓库全量扫描过，除 `.env.local` 外**没有任何文件命中该 key**。

---

## 我这边已经完成的事（可自行核对）

| 项目 | 结果 | 怎么核对 |
|---|---|---|
| 真实知乎接口打通 | 搜索 / 热榜 / 问题回答 / 直答 / 问题推荐 / 额度 全部 200 | `/api/health`、`docs/api-audit.md` |
| 完整闭环实测 | 4 分身 → 4 篇直答（370–420 字）→ 缺口 → 真人 → Mesh → 搬运稿 | 见 `docs/acceptance.md` |
| 缺口识别 | 稳定产出 1–3 条，含条件缺口 / 偏题缺口等 8 类规则 | `lib/domain/gap.ts` |
| 类型检查 | 47 文件 / 0 诊断 | `npm run build`（第 1 步） |
| 发布边界 | 无写入接口，深链 + 复制，`canPublishViaApi: false` | `docs/publish-path.md` |
