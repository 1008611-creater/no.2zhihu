# 线程：审计上线（audit）

- **工作区**：`E:\codex\heikesong3\.tools\rel-20260915`（审计 clone，只读 main）；
  验证用 `.tools/b2new`（main 源码包 + 待验改动）
- **分支**：无常驻分支；只在需要时建临时分支（如 `fix/audit-status-workflow`）
- **正在改**：**只改审计工具与协作护栏** —— `scripts/audit-*.mjs`、
  `scripts/check-thread-declaration.mjs`、`.github/workflows/thread-declaration.yml`。
  **不改任何业务代码**（`app/` `components/` `lib/`）
  （**2026-09-15 晚有一次已结束的例外，见下**）
- **状态**：常驻
- **最后更新**：2026-09-16 15:05
- **职责**：审计内容 → 合并 → 线上复验。**唯一的合并与上线决策者**；
  开发线程只提 PR，不合并、不部署。
- **不做什么**：不替开发线程改业务代码；不机械解语义冲突（会在 PR 上写清成因与建议解法）
- **怎么跟我沟通**：**在 PR 上写清楚**即可 —— 我看所有 PR，是天然的全局信息枢纽。
  若某条结论要传给别人（例如「A 线程的做法 B 线程也该知道」），我会在对应 PR 上转述。

## 2026-09-15 晚 · 一次例外（已结束，已回归常态）

老大直接发来 4 条实机反馈（含截图）并要求本线程修完，于是本线程临时承担了开发角色：

| PR | 内容 | 状态 |
|---|---|---|
| #54 | 右栏被切掉 / 滚不动；「查看详情」「互相回应」两处报错；名册浮层被后面的卡片盖住 | 已合并 · 线上复验 43/43 |
| #56 | 复验 #54 时发现：`prefers-reduced-motion: reduce` 下 `/square` 有概率**永久卡死**（React #418 → #329，effect 从未运行） | 已合并 · 线上复验 |
| #58 | #54 没碰到的残留坑：`/api/mirror/debate` 的 zod 上限 `entries.max(8)` / `body.max(4000)` 是照「模型回答」拍的，但收的是**用户已拿到的回答正文** → 邀请 >8 位、长回答 >4000 字必 400，且报错是英文直接弹给用户。放宽到 **24 / 8000**，四条约束全换中文文案，`DebatePanel` 客户端同步裁剪 + `AbortController(120s)` | 已合并 · 线上复验（12 条 / 6000 字 → 200；25 条 / 1 条 → 中文 400） |

两条都补了可执行自检（`check-mirror-shape.mjs` / `check-hydration-safety.mjs`，已进 `check:logic`）。
例外到此为止 —— 之后仍按上面的边界走。

## ⚠️ 给下一个用本机的人：这里的 git 不可信

沙箱里 git **写不进 `.git/refs` 与索引**：`git checkout -b` 报「Switched to a new branch」
但分支 ref 不落盘，`HEAD` 随即变成 unborn，然后 `git status` 会把**整个仓库显示成新增文件**
（本次因此误判过一次：以为 295 个文件被 staged）。`git reset --mixed HEAD` 也清不掉索引。

所以在本机：

- 取 base / 对照版本：用 `git show <sha>:<path>`（**对象库是好的**），
  或直接下载 `https://codeload.github.com/<owner>/<repo>/tar.gz/<sha>` 源码包逐字节对比
- 提交：走 GitHub Git Data API（blobs → tree(base_tree) → commit → ref），
  `scripts/push-via-api.mjs` 是现成脚本
- `preflight.mjs` / `verify-merge.mjs` 依赖 `git diff`，在这里**跑不了** ——
  要做等价检查（查重 / 接线 / 产物）并在 PR 描述里说明跳过的原因

## 收到但暂不采纳的移交项（来自 #62，2026-09-15）

dev-square-source 线程收工时移交本线程两条，裁决如下 —— **都先不动**，理由写在这里，
免得下一个人又当成 bug 修一遍：

1. **直答额度口径「不一致」**（`AGENTS.md` §1.5 写 100/天，`/api/v1/quota` 实测 5000/天）。
   **不是缺陷**：§1.5 那句是**自我约束的支出上限**（「不滥用额度」），不是对平台配额的陈述；
   自限比平台给的更严，方向是对的。`lib/server/mirror.ts` 按更小的数算预算也是对的。
   若嫌歧义，正确的改法是**加半句说明**（「平台发放 5000/天，本仓库自限 100/天」），
   而不是把 100 改成 5000 —— 后者是把节流阀拆了。
2. **`docs/product-plan.md:95` 仍写「预置 6 位」**：内部计划文档，记录的是演进过程，
   不是对外的提交物（对外的 `docs/submission.md` 已在 #61 改对）。按历史记录保留。

## 已知但未修（部署打断在途会话）

每次构建都会替换 `.next/static` → 页面上还开着旧 HTML 的用户会在下次点击时拿到
`/_next/static/chunks/...` 的 500（本次 23:33 部署的日志里能看到十几条）。
**不是回归**，是既有取舍（见 MEMORY「部署打断在途会话」）。真要修得改部署流程
（先构建到临时目录再原子切换），属 CI/部署改动，不在本线程边界内 —— 留给专门线程。
## 2026-09-16 · 复验 #64 与由此追出的一个 P2 发现

### #64 复验：通过（已在线上坐实）

#64 把镜像页顶栏的「N 条真实知乎来源」从 `skills.reduce(sources.length)` 改成
`answers.reduce(splitSources(evidence).displayable.length)` —— 方向正确，与我这条铁律
（`splitSources()` 是「只数可核对来源」的唯一入口）一致。

线上真机核对（三场受影响场次，12/12 断言通过）：

| 场次 | 旧（技能侧） | 新（顶栏） | 逐篇求和 |
|---|---|---|---|
| 该不该借钱给亲戚？（`mirror-948290`） | 9 | **8** | [3,2,3] = 8 |
| 年轻人第一份工作…（`mirror-396513`） | 9 | **8** | [3,2,3] = 8 |
| 父母老了要不要接来同住？（`mirror-826745`） | 6 | **3** | [2,1,0] = 3 |

顶栏 == 逐篇求和 == 我独立算的基准，三场全对；旧值恒 ≥ 新值。

### 由此追出的 P2 发现 → 已开 issue **#70**（交开发线程）

**不是 #64 引入的**，是它让这个既有问题显形：
某篇回答**零检索来源**时，那个分身的 `skill.sources` 会**回落到人格蒸馏语料**
（`skills.ts:32` 填 `p.corpus.sources`，`library.ts:191` 只在有回答来源时才覆盖）。
而 `mesh.ts:117/:273` 把 `skill.sources` 当作「本次回答证据」用。

影响面 **1/22 场**（`mirror-826745` 的 `persona:splitter`：回答侧 0 条 / 技能侧 5 条）。

**我排除掉的（避免误报，逐项实测）**：
- 假连线：**不存在**。全量数据复刻 `mesh.ts:128` 判据 → 技能侧与回答侧算出的关键词对都是 **0 对**。
- 假真人节点：**不成立**。`MAX_HUMANS = 2`（`mesh.ts:243`）已被「工藤正男」(17 票) 与
  「寻觅生活意趣」(3 票) 占满，贱贱在 Mesh 上是**合法的分身节点**。

所以定级 **P2：口径不一致 + 注释未兑现**，当前无可观察的错误输出；风险在下一个读者
（或 `MAX_HUMANS` 调大、检索降级变多时）才会踩到。建议解法与守卫写法都写在 issue 里。

### 本轮新增的审计工具（`.tools/`，已 gitignore）

`audit64-counts.mjs`（新旧公式差异 + 重复计数风险）、`audit64-impact.mjs`（污染影响面量化）、
`audit64-leak.mjs`（逐场回落检测）、`cdp64/64c/64d/64f/64g/64h.mjs`（真机口径核对与假连线判定）、
`pr-audit.mjs`（一屏看全某个 PR 的 patch 与检查）、`grep-sources.mjs` / `find-consumers.mjs`
（全仓找「数来源」与「读 skill.sources」的所有位置）。
## 2026-09-16 中午 · 补审 #64 / #69 / #71（均在我离开后自行合并）

队列当时为空，但这三笔都是 main 在我离开后前进的，逐一补审：

| PR | 内容 | 复验 | 结论 |
|---|---|---|---|
| #64 | 镜像页顶栏来源计数改走 `splitSources` | 线上 12/12 | 通过。三场受影响场次：顶栏 == 逐篇求和（8/8/3），旧值恒 ≥ 新值 |
| #69 | 计划书/提交物/公共人物承诺 三处「说的和做的不一致」 | 线上 8/8 | 通过。`/personas` 印出「已核验 0/24 项能力」，与源码事实（6×4=24、`isCallable` 恒 false）一致 |
| #71 | 署名不得伪造，补 #53 漏掉的三处同类 | 产物级 | 通过。`.next/server/app/api/mirror/invite/route.js` 内「匿名用户」= 0，`AuthorName??""` = 1 |

#69 与 #71 由我合并/确认（#69 是 `build` 跑完后我合的；#71 自动合并后我做的产物复验）。

### 我自己的两次误报（记下来，免得下次再犯）

1. ~~顶栏 8 vs 回答页 3 = 口径不一致~~ —— **我的断言错了**。顶栏是**全场汇总**、回答页是**单篇**，
   两者本来就不该相等。正确判据是「顶栏 == 逐篇 `displayable.length` 之和」。
2. ~~`/personas` 的「已核验 0/24」没上线~~ —— **正则被 `<!-- -->` 切断了**。
   Next.js SSR 会在文本片段之间插注释节点，匹配中文必须先去注释与标签。

### issue #70 仍开着（本线程产出，1/22 场，P2）

`skill.sources` 在「该技能本次回答零来源」时保留 `persona.corpus.sources`，
`mesh.ts:117/:273` 把它当「本次证据」用。**已排除**假连线（`fakePairs=[]`）与假真人节点
（`MAX_HUMANS=2` 已被票数前两位占满）两个猜想 —— 所以是 P2，不是线上 bug。
建议解法（在 issue 里）：`hydrateLibraryEntry` 在回答零来源时**显式清空** `sources`，
兑现「`skill.sources` = 本次检索证据」这条既有约定；并补一条守卫。

### 线上终态

`NRestarts=0`、8 路由 7×200 + 401、近 60 分钟 journal 无 ERROR、近 30 分钟本站点无 5xx。
部署 HEAD `280f86f`（#71）。在途 PR 0，打开 issue 1（#70）。

## 2026-09-16 下午（更晚）· #66 / #67 / #71 / #72，以及一条对 #69 验证段的反查

### 本轮合并并在线上验过的

| PR | 内容 | 线上证据 |
|---|---|---|
| #66 | `pr-flow-check.yml` 的改动范围基准：`git diff base.sha head` → `git merge-base` | CI 日志里新算法实跑生效（`mb=$(git merge-base …)`） |
| #67 | 新增 `scripts/audit-source-parity.mjs`：来源计数三处同数，退出码非 0 即视为上线失败 | 190 / 190 / 190 ✓ |
| #71 | 署名不得伪造（补 #53 的三处同类），另加 `check-mirror-shape.mjs` §⑦（13 条断言） | 线上 `匿名用户` 仅存在于注释；§⑦ 在 CI 里真跑并列出全部断言 |
| #72 | 不存在的人格页补 `noindex`（新增路由段 layout 的 `generateMetadata`） | 6 个 URL 实测：3 个真 handle 无 noindex，3 个旧/乱拼 handle 有 |

**#72 值得记一笔**：它是我在 #69 上反查出「noindex 从未存在」之后，开发线程当天补的真修。
合并前我单独验了它的最大风险 —— `generateMetadata` 用 `personaByHandle()` 判断，
**若把真实 handle 误判成「不在名册里」，就会给真页加 noindex（回归）**。
脚本枚举全部 16 位：直接查命中 **16/16**，`encodeURIComponent` 形态也 16/16 → 不误伤。
（同类判据以后可以复用：**给「异常输入」加守卫时，必须同时证明「正常输入不被误伤」**。）

### 反查 #69 的「验证」段：有一句不成立（已在 PR 上更正）

`#69` 的验证段写着「`/personas/ban-fo-xian-ren` 出 `robots: noindex`」。实测**当时并不成立**：

- 全仓 `app/` 下没有 `generateMetadata`、没有 `export const metadata`（只有 `app/layout.tsx` 的全局那份）、
  没有 `noindex`、没有 `middleware.ts`；
- `[handle]/page.tsx` 是 `"use client"`（客户端组件不能导出 `generateMetadata`），
  未知 handle 只 `return <h1>名册里没有这个人</h1>`，HTTP 200；
- 线上两个页面 `<head>` 都没有 robots meta，`<title>` 都是根默认值。

**这不是 #69 正文的问题** —— 它的 H1 与「已核验 0/24 项能力」我都实测生效了。
出问题的是**验证段里的一句观察**：它没发生过。已在该 PR 留更正，并推动 #72 真修 + 线上复验。

### 本轮两次「描述里的东西没发生过」（含我自己一次）

1. **我（#66）**：写「会在 PR 上留下一条说错话的提醒」→ 扫全部 68 个 PR 的评论，
   历史上只有 3 条提醒、**全部正确**，误报一次没发生过。已公开更正为「潜在风险」。
2. **#69**：写「旧 handle 出 noindex」→ 仓库里根本没有产生它的机制。已更正。

**共同点：描述里的「改之前长什么样」和「会导致什么后果」，与「改之后对不对」一样需要取证。**
→ 判据：说「之前是 X」必须 `git show <base>:<path>` 看过 X；说「会导致 Y」必须在历史/日志里找到过 Y。
两条都已写进 Skill `multithread-pr-audit-deploy`。

### 顺手记下的一个 diff 假象 —— 并更正我先前的解释（2026-09-16 15:05）

`#69` 的 PR 视图显示 `+211/-198`，其中 `docs/product-plan.md` 一项就占 `+191/-190`。
我当时的解释是「CRLF→LF 行尾转换」——**这个解释是错的，已更正**。

实测三个端点的行尾与行数：

| 端点 | 行尾 | 行数 | 说明 |
|---|---|---|---|
| `c9dd4938`（PR **创建时**的 base） | **LF** | 178 | 陈旧端点 |
| `db29b673`（真正的 merge base） | **CRLF** | 191 | 权威 |
| `e4c4475c`（head） | **CRLF** | 192 | |

→ **方向说反了**：不是「CRLF→LF」，而是陈旧的 base 是 LF、head 与 merge-base 都是 CRLF。
更关键的是：**这不是 PR 转换了行尾**，而是
**`pulls/<N>/files` 是按 PR 创建时的 `base.sha` 去比 head 的** ——
期间 main 把同一个文件从 LF/178 行改成了 CRLF/191 行，于是每一行都算「改动」。

**该 PR 的真实改动**：squash 提交 `7fe2fac2` 的 stats 是 **`+23/-10`**，
其中 `docs/product-plan.md` 只有 **`+3/-2`** —— 与我先前说的「14 行插入」也不符。

**正确做法**：判**已合并** PR 的真实改动，读它的合并提交：

```bash
gh api repos/<o>/<r>/pulls/<N> --jq '.merge_commit_sha'
gh api repos/<o>/<r>/commits/<merge_sha> --jq '.files[] | "\(.filename) +\(.additions) -\(.deletions)"'
```

判**未合并**的 PR，用 `compare/<merge-base>...<head>`（`git merge-base`，不是 `base.sha`）。
这与 `pr-flow-check.yml` 的缺陷（#66）**同源**：都把 PR 创建时的 base 当成了比较基准。

**教训：先把「两个端点分别是谁」钉死，再解释 diff 的大小。**
同一天我在这一点上错了两次（先说是行尾转换、方向还反了；又说是 14 行插入），
两次都不是现象判断错，而是**端点选错**。
### 线上终态（本轮结束时）

部署 HEAD `e9a8e25e`（#72）、在途 PR 0、`NRestarts=0`、8 路由 7×200 + 401、来源计数三处同数 190。

