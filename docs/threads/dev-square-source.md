# 线程：dev-square-source（来源署名 / 来源口径 → 对外材料事实对齐）

- **工作区**：`E:\codex\_dev2`（clone；`node_modules` 是指向主工作区的 junction，
  删这个目录会连带删掉主工作区的 `node_modules`）
- **分支**：无常驻分支（**本轮已收工**，见下）
- **正在改**：无 —— `#80`、`#83` 已提交，等审计线程合并
- **状态**：**本轮收工**（2026-09-16 下午）。此前标过「已收工」，之后又接了两件
  **对外材料的事实对齐**，所以重开一轮并在此说明 —— 不让声明与实际脱节。
- **最后更新**：2026-09-16 16:40
- **备注**：本轮的两件都不改业务代码，改的是**对外材料**：`docs/acceptance.md` 与
  `docs/submission.md`。前者补「时效快照」（标注 5 处已过期项、正文不改写），
  后者补明额度自限性质（数字一个不动）。依据与核对方式见各自 PR 的描述。

## 本轮（第三轮）

| PR | 内容 | 状态 |
|---|---|---|
| #80 | `docs/acceptance.md` 补「时效快照」—— 5 处状态断言已过期（「6 位答主」应为 16、D7 阻塞已解除、D6 描述的标签已移除、视频无仓库产物、截止日已过）。**只加头部块，正文一行不改** | OPEN / CLEAN |
| #83 | `docs/submission.md` §3「热榜 100/天、直答 100/天的**低额度能力**」→ 补平台真实发放量 + **自限**性质。与 `demo-video-script.md`「实测 5000」矛盾的，是说法不是数字，所以**数字一个没动** | OPEN / CLEAN |

## 已完成（前两轮）

| PR | 内容 | 结果 |
|---|---|---|
| #53 | `/square` 来源署名缺失（生产者→数据→消费者→展示四层 + 护栏） | 合并 `c474450`，线上 190/195 可核对 |
| #61 | 提交物事实对齐（16 位 → 15 蒸馏 + 1 预置） | 合并 `4f4cdfd` |
| #62 / #76 | 线程声明状态收尾 | 合并 |
| #71 | 署名不得伪造 —— 补 `#53` 漏掉的**三处同类**（`persona.ts` 的 `?? "匿名用户"`、`handoff.ts` 与 `MineHandoffPanel.tsx` 的搬运稿来源只判 url 不看作者名） | 合并 `280f86f`，加 §⑦ 守卫 |
| ~~#75~~ | ~~零来源不得回落到人格语料~~ | **关闭** —— 与 #74 重复（同一 issue 被两个开发线程同时认领），且 #74 看到了更严重的症状（`confidence` 也被污染且是渲染出来的） |

## 关于额度口径：本线程的立场（避免被读成重开已裁决的议题）

`docs/backlog.md` 的 **C1** 与 `docs/threads/audit.md` 都已裁决：`AGENTS.md` §1.5 的
「100/天」是**自我约束的支出上限**，**不是缺陷**；若嫌歧义，正确改法是**加半句说明**。

`#83` 加的就是那半句，并且：
- **没有动 `AGENTS.md`**（C1 的对象）
- **没有改任何数字**（节流阀原样）
- 只改了 `submission.md` 里那句把 100 当成「**低额度能力**」的定性（主语从「我们自限」变成了「能力本身」）

我坚持的只有一条**事实**：同一件事在 `submission.md`（必交）写 100、在
`demo-video-script.md`（录屏照着念）写 5000。这个矛盾总得消掉一处。
**若审计线程认为连这半句也不该加，直接关掉 #83 即可，我不坚持。**

## 本轮踩到并记下的两个坑

1. **报缺陷前先把「两个口径」都对一遍。** 我用正则数 `FLOW_STATES` 得到 8，差点报
   「`submission.md` 说看山 10 个状态是错的」—— 查实 `KanshanState` 类型**恰好 10 个取值**
   （多出的 `idle`/`sleepy` 不进产品流程）。正则数的是「流程步骤数」，文档说的是「状态总数」。
   **数出来不符的时候，先怀疑自己数的是不是同一个东西。**
2. **断言写错会浪费一轮，但断言不写会放过真错。** `#80` 的脚本首版断言
   `new_text.endswith(text[len(OLD_HEAD):])` 假设头部在**偏移 0**，而文件开头是
   `# P0 验收清单\n\n` → 报了假警。处理方式是**先查清「断言错还是真改坏」**
   （dump 原文比对），而不是直接放宽断言；改成「换回后逐字节还原」后一次通过。

## 环境变化实测（2026-09-16 晚）：**本机沙箱 git 已可用，两个工具能跑了**

这条影响所有线程的做法，所以单独记一段。**以前引用过的「本机跑不了 preflight」这个前提，
今天实测已经不成立。**

### 历史故障四项，逐个复测 → 全部不再复现

| 历史上会坏的操作 | 2026-09-16 晚实测 |
|---|---|
| `git checkout -b` 报成功但 ref 不落盘 | ✅ 分支真的出现在 `.git/refs/heads/`（连测 3 次，`rev-parse` 均正确） |
| `git reset --hard` 报成功但落在旧提交 | ✅ 落在正确的 sha（`git log -1` 与预期一致） |
| HEAD 变 unborn → `git status` 把整个仓库显示成新增 | ✅ `git status --porcelain` 输出 0 行（正常） |
| `preflight.mjs` / `verify-merge.mjs` 依赖 `git diff` 跑不了 | ✅ **两个都端到端跑通**，见下 |

### 两个工具的实测输出（用真 sha，不是空跑）

```bash
$ node scripts/preflight.mjs --base 132223e5 --head d4cd63fd
[1/3] 查重  ✗ 与 #84 重叠 1 个文件（≥50%）
[2/3] 接线  ✓ 新增导出 9 个，全部「定义 1 次 + 有调用」
              crowdOf 8 / depthOf 7 / groundOpacityAt 2 / groundScaleAt 5 /
              lightReach 7 / lightSourceOf 11 / phaseOf 1 / shadowOf 10 / shapeOf 8
[3/3] 产物  - 未传 --text
退出码 1（有硬性失败项）

$ node scripts/verify-merge.mjs feat-square-ui --main __main_base
[3/4] main 上 PR 尚未包含的提交 …共动 4 个文件
[4/4] 禁用词扫描（.next 产物）✓ 5 个词各 0 命中
结论：可以合并，但 base 落后 main 4 个提交
退出码 0
```

**`preflight` 的第 [2/3] 项「接线」正是 owner 在 #77 上要求补的那个检查** —— 而它现在能在本机跑。

### 用法（给其他线程）

```bash
# 修 refs / 让工作区等于某个提交（四件套，缺一不可）
git fetch origin <sha>
git update-ref refs/heads/main <sha>      # ① 先修分支 ref（漏了这步 status 一直是脏的）
git read-tree --reset -u <sha>            # ② 再重置索引 + 工作区
git checkout-index -a -f                  # ③ 补写文件
git log --oneline -1 && git status --porcelain   # ④ 必须复核（status 应为空）

# 提 PR 前
node scripts/preflight.mjs --base <main-sha> --head <my-sha> --text "<要验的文案>"
node scripts/verify-merge.mjs <branch> --main <main-ref>     # 专治「静默回退别人的修复」

# 本地与 CI 跑同一条链（9 条）
npm run check:logic
```

⚠️ **两个我踩到的读数陷阱**（与本条环境变化配套）：

1. **`update-ref` 写错 sha 会静默检出旧提交**，而 `git log -1` 会如实显示那个旧提交 ——
   看起来「正常」，实际你读的是旧文件。**改完 ref 必须 `git rev-parse HEAD` 复核**。
   （我这轮就因为漏了这步，差点用旧提交的 `package.json` 得出错误结论。）
2. **`echo rc=$?` 接在管道后面读到的是 `tail` 的退出码，不是被跑脚本的。**
   要拿真实退出码就别接管道，或用 `PIPESTATUS[0]`。

> 注：`docs/threads/audit.md` 里那条「`preflight.mjs` / `verify-merge.mjs` 在这里跑不了」
> 是审计线程自己的文件，**我不代改** —— 请审计线程按自己的判断更新（上面是实测依据）。

## 未决项（移交，不自行裁决）

- `docs/acceptance.md` 头部「截止 2026-09-15 10:00」已过去，现处**评审期 09-15→09-17**。
  若团队已提交作品，建议留一份提交回执 —— 否则后来者读 `repo-collaboration.md` 的
  `- [ ] 提交表单已提交` 无法判断实际状态。**这条我只提，不擅自改别人的清单。**
- 演示视频（官方「选交加分」项）仓库内无产物；是否有外部成片不在此判断范围内。
