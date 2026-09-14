# AI 会话的执行边界（为什么有些命令「跑不了」，怎么系统性解决）

> 最后更新：2026-09-14
> 作用：把「AI 说跑不了命令」这件事讲清楚 —— 边界在哪、为什么、以及三条系统性的解法。
> 结论先行：**这不是你电脑的问题，也不是网络问题；而且其中一部分可以彻底解决。**

---

## 一、实测出来的确切边界

在当前这个 AI 会话里，我唯一的执行入口是一个 JavaScript 运行环境。它**无法创建任何子进程**：

| 尝试 | 结果 |
|---|---|
| 调用 `cmd.exe` | 拒绝（EPERM） |
| 调用 `node` | 拒绝（EPERM） |
| 调用 `git`（含绝对路径 `C:\Program Files\Git\cmd\git.exe`） | 拒绝（EPERM） |
| 通过 shell 方式调用 | 拒绝（EPERM） |
| 异步方式调用 | 拒绝（EPERM） |

这是**运行环境级的限制**，不是配置写错、不是路径不对、也不是权限没给够 ——
换任何目标程序、任何调用方式，结果都一样。所以「让 AI 换个姿势跑 git」这条路是不通的。

同一环境下**可用**的能力：

| 能力 | 状态 |
|---|---|
| 读写工作区文件 | ✅ 可用 |
| 访问网络（`fetch`，含 HTTPS 与 POST） | ✅ 可用，已实测能到达 GitHub API |
| 操作浏览器（含你已登录 GitHub 的 Edge） | ✅ 可用 |
| 写入工作区之外的目录 | ❌ 拒绝（EPERM） |

---

## 二、一个重要的更正

我上一轮说「`gh` 的凭证已被清除」——**这个结论下得太快了，不准确。**

事实是：`gh` 在 Windows 上默认把令牌存进**系统凭据管理器**，
`hosts.yml` 里只记录用户名，**本来就不会有 token 字段**。
所以「hosts.yml 里没有 token」推不出「已登出」。

现在 `hosts.yml` 里明确留有登录记录：

```yaml
github.com:
    git_protocol: https
    users:
        1008611-creater:
    user: 1008611-creater
```

另外 `gitconfig` 里已经把凭据助手指向了 `gh`，且 `gh.exe` 确实存在于 `C:\Program Files\GitHub CLI\gh.exe`。

> **结论：你很可能仍然是登录状态。** 我无法从文件层面证实或证伪 —— 凭据管理器里的内容是加密的。
> 一条命令就能确认（见第五节）。如果确实还登录着，推送这件事你**一步都不用多走**。

---

## 三、系统性解法（三层，按推荐顺序）

### 第 1 层：让 AI 直接完成推送 —— 不需要 git 命令

关键认识：**推送不一定要用 `git` 命令。** GitHub 的 Git Data API 可以用纯 HTTPS 完成全部动作：
建 blob → 建 tree → 建 commit → 移动分支指针。我已经实测这个会话的 `fetch` 能发起 POST 并到达 GitHub。

所以只要有一个令牌，**我可以自己把整个仓库推上去**，全程不碰子进程。**这条路线已实测跑通。**

令牌怎么给我而不暴露：写进工作区里一个已被忽略的文件，`.gitignore` 里已经准备好了 `.git-remote-token` 这一条：

```powershell
# 在项目根目录执行（把 <你的PAT> 换掉）
Set-Content -Path .git-remote-token -Value "<你的PAT>" -NoNewline
```

然后告诉我一声，我会：

1. 读取该文件（只读，不回显内容）；
2. 用 HTTPS 逐文件建快照；
3. 让 `main` 指向新提交；
4. 核实仓库页面上确实出现了文件；
5. 提醒你撤销令牌、并删除这个本地文件。

令牌权限最小化：Fine-grained token → 只选 `no.2zhihu` 这一个仓库 → 只开 **Contents: Read and write**。

### 第 2 层：让「本机跑不了构建」变成「云端自动构建」

同样的思路：**构建也不一定要在本机跑。** 仓库里已加入 `.github/workflows/ci.yml`，
每次推送到 `main` 或开 PR，GitHub 的服务器都会自动执行：

```
npm install  →  npx tsc --noEmit  →  npm run build
```

这一步顺带解决三个问题：

1. **构建验证**：本机跑不了的 `npm run build`，在云端有结果，且我看得到日志；
2. **队友的安全网**：任何人开 PR 都会先被自动检查，坏代码进不了 `main`；
3. **评委印象**：仓库首页出现绿色的 CI 徽章，是「工程规范」最直观的证据。

CI 里**不注入真实凭证** —— 构建阶段不需要它，注入只会扩大泄漏面。

### 第 3 层：从根上修（面向以后的所有会话）

前面两层是「绕过去」，这一层是「改掉」。

需要说明的是：你的 `config.toml` 里其实**已经**写了 `sandbox_mode = "danger-full-access"`，
但子进程依然被拒绝 —— 说明限制来自 **Codex 桌面应用自身的权限层**，而不是这份配置。

要真正让 AI 能直接跑命令，需要：

| 做法 | 效果 |
|---|---|
| 在 Codex 桌面应用里开启「允许执行命令 / 终端」类能力 | 会话中出现终端工具，AI 可直接跑 git / npm |
| 或改用 Codex CLI / IDE 集成 | 天然带终端工具，`git`、`npm` 正常可用 |

判断标准很简单：**如果这个会话里我没有终端工具，那就是被配置关掉了，不是我拒绝用。**

---

## 四、这三层分别解决什么

| 你遇到的问题 | 第 1 层 | 第 2 层 | 第 3 层 |
|---|---|---|---|
| 代码推不上 GitHub | ✅ 彻底解决 | — | ✅ 一并解决 |
| 本机跑不了构建验证 | — | ✅ 彻底解决 | ✅ 一并解决 |
| 以后每个项目都要手工推送 | — | — | ✅ 彻底解决 |
| 队友改坏了 `main` | — | ✅ 自动拦住 | ✅ 一并解决 |

---

## 五、已解决：推送完成，构建也已通过（2026-09-14）

**这一节记录最终结果 —— 前面三层解法里，第 1 层和第 2 层都已落地并验证。**

| 事项 | 结果 |
|---|---|
| 代码推送 | ✅ 131 文件已上 GitHub，`main` = `71cf2ae` |
| 推送方式 | GitHub Git Data API（`scripts/push-commit-via-api.mjs`），**未使用 git 命令** |
| 远端与本地一致性 | tree 哈希 `99c7e13` 完全相同，逐字节一致 |
| 构建验证 | ✅ 云端 CI 全绿：装依赖 → 类型检查 → 构建 |
| CI 触发范围 | 每次 push 到 `main` 与每个 PR，队友改代码也有安全网 |

### 关键操作：把 gh 的令牌交给脚本

`gh` 的令牌存在 Windows 系统凭据管理器（加密，任何程序都无法跨账户读取），
所以需要**你执行一次**这条命令把它导出到工作区里一个已被忽略的文件：

```powershell
gh auth token | Set-Content E:\codex\heikesong3\.git-remote-token -Encoding ascii
```

执行后屏幕**不会有任何输出**，这是正常的 —— 令牌被管道写进文件了，没有打印到屏幕上。
验证是否成功：文件应该存在且大小约 41 字节（40 字符令牌 + 换行）。

之后 AI 就能用这个令牌直接推送，全程不需要你操作命令行。

> ⚠️ **用完请删除该文件**：`Remove-Item E:\codex\heikesong3\.git-remote-token`。
> 它已在 `.gitignore` 中，不会误入仓库；但留在磁盘上没有必要。
> 想彻底失效就到 <https://github.com/settings/applications> 撤销 gh 的授权。
## 六、一个已经踩过的坑：PowerShell 脚本必须带 BOM

第一次执行推送脚本时报了一串「字符串缺少终止符」「缺少右 }」，看起来像脚本写坏了，其实不是。

原因：Windows PowerShell 5.1 读取 `.ps1` 时，**若文件没有 BOM，就按系统 ANSI 代码页解码**
（简体中文系统下是 GBK）。而我们的脚本是 UTF-8 无 BOM，中文注释和字符串被按 GBK 撕碎，
字符串的引号因此错位，于是后面所有大括号都开始报错 —— 这是**假语法错误**，逻辑本身没问题。

已做的修复与防回归：

| 措施 | 说明 |
|---|---|
| 脚本改为「UTF-8 with BOM」保存 | `scripts/push-to-github.ps1`、`scripts/export-assets.ps1` 均已加 BOM |
| `.editorconfig` 新增 `[*.ps1] charset = utf-8-bom` | 编辑器会据此保持 BOM，防止队友改动时又掉回无 BOM |

> 同类问题适用于所有含中文的 `.ps1`。若以后新增 PowerShell 脚本，**务必保存为「UTF-8 with BOM」**；
> 用 VS Code 时看右下角编码，选 `UTF-8 with BOM` 再保存。

---
## 七、让 PowerShell 默认走 7.x（已修）

### 结论

你机器上**已经装了 PowerShell 7.6.6**，Windows Terminal 的默认项也已经是它。
之所以还总是落到 5.1，是因为入口用错了：

> **在 Windows 上，`powershell` 这个命令名永远指向系统自带的 5.1；7.x 的命令名是 `pwsh`。**
> 这是微软的硬性命名约定，装多少个版本都不会变。

### 一键修复

```powershell
pwsh -ExecutionPolicy Bypass -File scripts/fix-powershell-default.ps1 -DryRun   # 先预览
pwsh -ExecutionPolicy Bypass -File scripts/fix-powershell-default.ps1          # 再执行
```

脚本做三件事（写入前自动备份，可重复执行）：

| # | 动作 | 说明 |
|---|---|---|
| 1 | 清掉 5.1 启动配置里的悬空引用 | 原配置指向 `D:\Users\lsb\Documents\PowerShell\profile.common.ps1`，该文件已不存在，每次启动都静默失败 |
| 2 | 在 5.1 启动配置里加转发 | 交互式敲 `powershell` 时自动进入 7.x；**不影响** `powershell -File x.ps1` 这类外部调用 |
| 3 | 把 VS Code 默认终端设为 pwsh | 已有 `settings.json` 会被合并，其它配置不动；含注释无法安全合并时会打印待粘贴内容 |

### 刻意不做的事

**不在 5.1 启动配置里自动重启到 7.x。** 原因有两个：

1. 7.x 的启动配置会反向加载 5.1 的启动配置（dot-source），自动重启会形成**无限循环**；
2. `powershell -File x.ps1` 会被静默改道，改变脚本语义 —— 这类调用应当显式失败，而不是悄悄换成别的解释器。

### 防回归

| 措施 | 位置 |
|---|---|
| 本地检查 | `npm run check:ps1` |
| 云端检查 | CI 第一步执行 `node scripts/check-ps1-bom.mjs`，不合规直接失败 |
| 编辑器约定 | `.editorconfig` 的 `[*.ps1] charset = utf-8-bom` |

### 常用命令对照

| 想做什么 | 用哪个 |
|---|---|
| 打开 PowerShell 7 | `pwsh` |
| 跑脚本 | `pwsh -File scripts/xxx.ps1` |
| 推送代码 | `npm run push:github` 或 `pwsh -File scripts/push-to-github.ps1` |
| 修默认版本 | `npm run fix:powershell` |

---
## 八、安全底线（三层都不例外）

- 令牌**只**授予 `no.2zhihu` 一个仓库、**只**开 Contents 写权限，有效期设最短。
- 令牌不写进代码、不写进文档、不写进聊天记录；`.git-remote-token` 已被忽略，用完即删。
- 推送完成后到 <https://github.com/settings/tokens?type=beta> 撤销令牌。
- `.env.local` 里的 `ZHIHU_ACCESS_SECRET` 与推送令牌是两回事，都要留在仓库之外。
