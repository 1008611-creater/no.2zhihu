# 线程：square-ui（虚拟广场界面）

- **工作区**：`E:\codex\heikesong3\.tools\sq-arena`
- **分支**：`feat/square-ui` @ 基线 `0a6f33e`（已 merge main 追平；原基线 `14645fc`）
- **正在改**：
  - `lib/domain/light.ts`（新：光源 / 影子 / 纵深 / 体态几何）
  - `lib/domain/crowd.ts`（纵深缩放、体态派生、摆放半径与高度基准拆成两个常量）
  - `lib/domain/square-layout.ts`（homeViewport 取景 1.02 → 0.92）
  - `components/square/CrowdCluster.tsx`
  - `components/square/SquareCanvas.tsx`
  - `app/frontend-v2.css`
  - `scripts/check-square-light.mjs`（新：光影几何自检，7 节）
  - `docs/threads/square-ui.md`（本文件）
- **状态**：已提 PR **#77**（工程侧完备；视觉侧等 owner 给方向）
- **最后更新**：2026-09-16 15:00
- **备注**：
  广场视觉重做 —— 透视场地 + 光影物理（光在最热那一场、全场影子朝外）+ 缺口渲染成「地上的洞」
  + 人群呼吸 / 光柱脉动 / 尘埃。目标是「一眼就牛逼」。

  ⚠️ **与 PR #53（`fix/square-source-attribution`）刻意避开**：它正在改
  `lib/domain/broadcast.ts`、`lib/domain/library.ts`、`scripts/check-square-crowd.mjs`（99+/1-）。
  本线程**一条都不碰**：
  - 新的几何自检写在**独立新文件** `scripts/check-square-light.mjs`，不跟 #53 抢
    `check-square-crowd.mjs`（硬上会静默回退它 99 行改动）
  - 「缺口 → 地上的洞」**只在渲染层改**（`CrowdCluster.tsx`），**不动 `crowd.ts` 里
    `kind: "gap"` 的语义** —— 否则 #53 里 `figures.filter(kind==="gap").length === openGapCount`
    那条断言会失效，等于跨线程弄坏别人的守卫
  - 不碰数据层（broadcast / library / evidence）、右栏条目、任何上游调用

  ⚠️ **必须用项目自己的 `@/lib/motion/useReducedMotion`**，不能用 `motion/react` 的 ——
  后者首帧就同步返回媒体查询真实值，服务端返回 false，导致水合失败
  （`14645fc` 刚修的线上事故：reduce 下广场永久卡在「正在铺开广场…」）。
