# 运行手册

> 最后更新：2026-09-14

## 一、环境要求

| 项 | 版本 |
|---|---|
| Node.js | ≥ 18.18（建议 20 LTS） |
| npm | ≥ 9 |
| 操作系统 | Windows / macOS / Linux 均可 |

## 二、本地启动

```bash
npm install
cp .env.example .env.local     # Windows: copy .env.example .env.local
# 在 .env.local 中填入 ZHIHU_ACCESS_SECRET
npm run dev
```

打开 <http://localhost:3000>。

> **上游 TLS 说明**：审计发现 Windows 的 curl / PowerShell 访问 `developer.zhihu.com`
> 会在 TLS 握手阶段失败（`SEC_E_NO_CREDENTIALS`）。这是 Schannel 的问题，不是接口不可用。
> Node 自带 TLS 栈正常，因此**所有调用上游的 route 必须使用 Node runtime**：
> ```ts
> export const runtime = 'nodejs';
> ```

## 三、需要你（用户）执行的命令

本机环境不允许自动执行子进程，以下命令需要手动跑一次：

```bash
# 1) 安装依赖
npm install

# 2) 构建验证
npm run build

# 3) 本地预览
npm run dev

# 4) 初始化仓库并推送（公开）
# 公开仓库已创建：https://github.com/1008611-creater/no.2zhihu
# 推送前必须先确认凭证文件被忽略（下面这条必须有输出）：
git check-ignore -v .env.local

git init
git add -A
git commit -m "feat: 二号知乎 Human Mesh —— 多分身作答 + 缺口识别 + 看山角色引擎"
git branch -M main
git remote add origin https://github.com/1008611-creater/no.2zhihu.git
git push -u origin main
```

安装官方知乎 Skill（可选，用于本地 CLI 调用）：

```powershell
# 用你本地已解包的官方 Skill 包
powershell -ExecutionPolicy Bypass -File ".official/zhihu-skill-0.7.2/zhihu/scripts/setup.ps1"
# 记录返回的 binary_path，然后写入 Access Secret
"<binary_path>" auth set --secret-stdin
"<binary_path>" auth status --verify
```

## 四、部署到 Vercel

1. 用 GitHub 账号登录 <https://vercel.com>，Import 该仓库。
2. Framework Preset 会自动识别为 Next.js。
3. **Environment Variables** 添加：
   - `ZHIHU_ACCESS_SECRET` = 你的 Access Secret（Production + Preview）
4. Runtime 保持 **Node.js**（不要选 Edge）。
5. Deploy，拿到 `https://<项目名>.vercel.app`。
6. 打开 `/api/health` 确认返回 `ok: true`。

## 五、常见问题

| 现象 | 原因 | 处理 |
|---|---|---|
| 页面显示「演示模式」 | 未配置 `ZHIHU_ACCESS_SECRET` | 检查 `.env.local`，重启 dev server |
| 接口 401 / 20001 | Access Secret 失效或过期 | 到 <https://developer.zhihu.com/profile> 重新生成 |
| 额度耗尽 30002 | 当日额度用完 | 等待次日 0 点重置；本地可清缓存重试 |
| TLS 握手失败 | 用了 curl / Edge Runtime | 改用 Node runtime |
| 搜索返回空 | 查询词太窄 | 缩短查询词，或换一个分身视角 |
| 搜索条数不对（总是 10 条） | 参数名写成 `Limit`，被上游静默忽略 | 搜索类接口的条数参数是 `Count` |
| 黑客松内容接口 401 | 站内接口需浏览器登录票据 | 属于预期行为，页面已如实标注，无需处理 |
| 构建报类型错误 | 上游响应类型不匹配 | 在 `lib/zhihu/types.ts` 补字段，不要用 `any` 绕过 |

## 六、诊断接口

| 路径 | 用途 |
|---|---|
| `/api/health` | 进程存活、凭证是否配置、缓存条目数 |

**注意**：`/api/health` 只返回布尔值，绝不回显任何凭证内容。

## 七、安全操作

- `.env.local` 已在 `.gitignore` 中，**永远不要提交**。
- 若凭证曾进入 git 历史，立即到开放平台删除并重新生成。
- 演示视频录制前，确认屏幕上不出现任何 Secret（包括浏览器地址栏和 devtools）。
