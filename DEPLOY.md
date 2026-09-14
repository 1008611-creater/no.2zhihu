# 发布清单（你只需执行 3 步）

> 最后更新：2026-09-14 ｜ 代码与文档已就绪，剩下三步必须由你本机执行
> 原因：本会话沙箱禁止启动子进程，`git` / `npm` 全部返回 EPERM，无法代跑。

---

## 第 1 步：本机构建验证（约 2 分钟）

在项目根目录打开 PowerShell：

```powershell
cd E:\codex\heikesong3
npm install
npm run build
```

预期：出现 `Route (app)` 列表并显示 `Compiled successfully`。
若报错，把完整报错贴回来，我按报错修。

> 我已经做的：TypeScript 全量 47 文件 **0 诊断**，所有本地 import 可解析，
> 客户端/服务端边界无泄漏，8 个 API route 全部声明 `runtime = "nodejs"`。
> 唯一无法代跑的就是 `next build` 本身（它需要 fork 子进程）。

---

## 第 2 步：推送到公开 GitHub 仓库（约 2 分钟）

**仓库已经建好了**（`no.2zhihu`，Public，目前是空的），所以这一步不用再建，直接推送。

在项目根目录打开 PowerShell 执行**一条命令**：

```powershell
powershell -ExecutionPolicy Bypass -File scripts/push-to-github.ps1
```

脚本会自动：安全检查（确认 `.env.local` 被忽略）→ `git init` → 暂存 → 提交 → 推送到 `main`。

**如果要推到你刚建的另一个仓库**（你之前打开过 `github.com/new`），加一个参数即可：

```powershell
powershell -ExecutionPolicy Bypass -File scripts/push-to-github.ps1 -RepoUrl https://github.com/1008611-creater/<仓库名>.git
```

### 推送前自检（可选但推荐）

```powershell
git check-ignore -v .env.local
```

必须**有输出**（表示被忽略）。没有输出就停下 —— `.env.local` 里有真实 Access Secret，进仓库就泄漏了。
脚本已经内置这道闸门，不通过会直接中止。

**不会被推送的内容**：`.env.local`、`.official/`、`.refs/`、`.skills/`、`.tools/`、`.probe/`、`node_modules/`、`.next/`。
实际推送约 **126 个文件**。

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
