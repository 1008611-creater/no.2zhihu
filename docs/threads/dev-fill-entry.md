# 线程：dev-fill-entry（真人补充入口）

- **工作区**：`E:\codex\heikesong3\.tools\b2doc\msrc7`（main 源码包 + 待验改动）
- **分支**：`fix/fill-entry` @ 基线 `3d0f6eda`（main tip）
- **正在改**：
  - `components/mirror/GapCard.tsx`（新增 `fillHref`，无候选人时给出真实出口）
  - `app/(flow)/mirror/page.tsx`（把缺口出口接到 `/fill?answerId=`）
  - `app/(flow)/fill/page.tsx`（只改注释：修正与实现不符的「入口只有两个」）
  - `scripts/check-square-crowd.mjs`（§⑩ 守卫：`/fill` 不得成为孤岛 + Mesh 深链必须送到会变的那张图）
- **状态**：进行中（已提 PR）
- **最后更新**：2026-09-16 16:20
- **备注**：`/fill`（「补上 AI 答不了的那一段」）是闭环第 ⑨ 步，实现完整、提交链路可用，
  但**一个入口都没有** —— `/mirror` 上 11 个站内链接里没有一条指向它；
  缺口卡片在「没有匹配到真人」时只给一句
  「这个缺口需要更多人参与才能补上」，**零可交互元素**。
  用户被告知「需要更多人参与」却无处参与，而那一页就在仓库里、能跑、能提交。
  `fill/page.tsx` 自己的注释还写着「入口只有两个：工作台的缺口卡片 + 回答页的我来接管」——
  注释写的是意图，实现没有兑现。本线程补上工作台这一侧。

## 第二处：承诺「Human Mesh 长出新的边」，却指向一张不会变的图

`/fill` 提交成功页写着「Human Mesh 长出新的边，贡献值 +8」，但「查看 Mesh 变化」按钮
指向 `/me?tab=mesh` —— 实测补一条真人后：
- `/me?tab=mesh` 用 `buildCorpusMesh(history)`，**只看关键词共现**，不读 `contributions` /
  `answers[].status === "human"` / `gap.filledBy` → **节点 10 / 关系 9 一个都没动**，
  页面上也搜不到补充者名字
- 真正长出真人节点的是**本场关系图**（`/mirror` 的 `buildMesh`）→ 实测确实多出一个
  `g[role=button]`，标签就是补充者

已改为 `/mirror#mesh`（并给那块加了 `id="mesh"` 锚点）。
**这是铁律 4 的边界**：承诺了「长出新的边」，就必须把用户送到那张真的长出边的图。

## 与其它线程的关系

- 与在途 PR #77（`square-ui`：`app/frontend-v2.css` / `components/square/*` /
  `lib/domain/{crowd,light,square-layout}.ts` / `scripts/check-square-light.mjs`）**零重叠**。
- 与在途 PR #78（`persona-page-metadata`：`app/(explore)/personas/*` /
  `lib/domain/persona-meta.ts` / `scripts/check-persona-metadata.mjs`）**零重叠**
  —— 唯一同名的 `package.json` 与 `scripts/` 我都没动（我的守卫加在既有脚本内，不改 package.json）。
- `docs/threads/dev-square-source.md` 声明的 4 个文件与本线程**零重叠**（该线程已收工）。

## 怎么验证的

- `tsc --noEmit` rc=0｜`npm run check:logic` 143 项全过（含新增 §⑩ 5 条）｜`next build` EXIT 0
- **真机端到端 17/17**：缺口卡 → 点「我来补上这一段 →」→ 落到 `/fill?answerId=...` →
  填表提交 → 贡献记录 +1 / 缺口标记已填 / 回答变「真人已补充」→ 回工作台不再重复引导
- **守卫经反向验证**：分别回退「/mirror 传参」与「GapCard 渲染」，各被精确拦到对应那一条；
  还原后全绿
