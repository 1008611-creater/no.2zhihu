# 仓库协作手册

> 最后更新：2026-09-14
> 作用：把「怎么在这个仓库里一起干活」讲清楚。日常操作看 [../CONTRIBUTING.md](../CONTRIBUTING.md)，本文讲**仓库配置与角色分工**。

## 一、仓库地址

| 用途 | 地址 |
|---|---|
| 代码仓库（公开） | https://github.com/1008611-creater/no.2zhihu |
| 克隆 | `git clone https://github.com/1008611-creater/no.2zhihu.git` |
| 线上 Demo | 待部署（见 [runbook.md](runbook.md)） |

## 二、为什么用「公开仓库 + 分支 + PR」而不是直接推 main

1. **公开仓库是加分项。** 官方提交清单第 3 条把代码仓库列为加分项，评审会看代码质量与提交记录。
2. **PR 是可审计的变更记录。** 比赛评委、队友、以及后续接手的人都能看到「谁、为什么、怎么验证的」。
3. **main 永远可部署。** 截止前最怕的是有人推坏 main 导致线上 Demo 挂掉。分支 + PR 让 main 始终是安全的。
4. **多人同时改不打架。** 分支隔离后，冲突在合并时集中解决，而不是互相覆盖。

## 二·五、先把代码推上去（做协作的前提）

仓库现在是空的 —— 没有第一个提交，就没有分支、PR、协作可言。
推送方式见 [roadmap.md](roadmap.md) 第七节，两条路：

- **路线 A（推荐）**：建一个只对 `no.2zhihu` 有 Contents 写权限的临时令牌，跑一次 `node scripts/push-via-api.mjs`，推完立刻撤销令牌。
- **路线 B**：用 `git` 命令或 `scripts/push-to-github.ps1` 推送。

推送成功后，仓库才有 `main` 分支，后面第三节的权限配置与第四节的分支保护才能生效。
## 三、角色与权限

| 角色 | 权限 | 谁 |
|---|---|---|
| Owner | 管理仓库、合并 PR、配置 Secrets | 队长 `1008611-creater` |
| Collaborator (Write) | 推分支、开 PR、评审 | 核心开发 |
| Contributor | Fork 后提 PR | 外部同学、评审老师 |

**邀请协作者**：仓库 → Settings → Collaborators → Add people → 输入 GitHub 用户名 → 选 **Write**。

> ⚠️ 不要给 **Admin**。Admin 能改仓库设置、删仓库、看 Secrets，超出协作所需。

## 四、main 分支保护（建议开启）

仓库 → Settings → Branches → Add branch protection rule：

| 选项 | 设置 | 为什么 |
|---|---|---|
| Branch name pattern | `main` | — |
| Require a pull request before merging | ✅ | 禁止直推 |
| Require approvals | ✅ 1 人 | 至少一人看过 |
| Dismiss stale approvals | ✅ | 新提交后需重新 review |
| Require status checks to pass | 有 CI 后再开 | 见第六节 |
| Do not allow bypassing | ✅ | Owner 也走 PR |

截止前如果只有一个人在线，可以在 PR 里自我说明后合并 —— **规则是为了防事故，不是为了卡进度**。

## 五、凭证怎么传给队友

**不要**把 `ZHIHU_ACCESS_SECRET` 写进仓库、issue、PR、群聊或截图。三种正确方式：

1. **本地文件**（推荐）：队长私聊发一次，各自写进自己的 `.env.local`。该文件已被 `.gitignore` 忽略。
2. **Vercel 环境变量**：部署用，只有 Owner 配置，队友不需要。
3. **GitHub Actions Secrets**：接 CI 时用，见第六节。

没有凭证的人也能正常开发：页面进入只读演示模式，不消耗额度，只是看不到真实回答。

## 六、CI（可选，时间够再上）

新建 `.github/workflows/ci.yml`：

```yaml
name: CI
on:
  pull_request:
    branches: [main]
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: npm
      - run: npm ci
      - run: npm run build
```

**注意**：`npm ci` 需要 `package-lock.json`。若仓库里没有锁文件，改用 `npm install`。
CI **不要**注入 `ZHIHU_ACCESS_SECRET` —— 构建阶段不需要真实凭证，注入反而增加泄漏面。

## 七、Issue 与 PR 的用法

- 每个非琐碎改动先开 **Issue**（用仓库自带模板），说清要做什么、验收标准是什么。
- PR 描述里写 `Closes #12`，合并后自动关 Issue。
- 时间紧的时候，**至少**在 PR 描述里写清「改了什么 / 为什么 / 怎么验证的」。

## 八、截止前的协作纪律

距提交截止（**2026-09-15 10:00**）只剩一天，按下面的优先级走：

1. **不要重构。** 只做能让 Demo 跑起来、能让计划书更完整的事。
2. **不要同时改同一个文件。** 动手前在群里说一句改哪个目录。
3. **每次合并前确认 main 能构建。** 构建挂了立刻回滚或修复，不要放着。
4. **提交材料是两个人的活**：一个人盯 Demo 可访问，一个人盯计划书与提交表单。

## 九、提交材料的最终检查

- [ ] 线上 Demo 公网可访问，评委能直接打开并完成一次完整体验
- [ ] 计划书回答完官方 6 个必答问题（见 [submission.md](submission.md)）
- [ ] 代码仓库公开可访问（本仓库）
- [ ] README 顶部写清 Demo 地址与一句话介绍
- [ ] 演示视频（若做了）链接可公开访问
- [ ] 提交表单已提交，**不要卡在最后 10 分钟**
