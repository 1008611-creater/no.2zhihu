# 线程：dev-drop-session-mesh（删掉「这场生成出来的关系」）

- **工作区**：`E:\codex\_rel-dev`（干净 clone，node_modules 是指向 `E:\codex\heikesong3\node_modules` 的 junction）
- **分支**：`chore/drop-session-mesh` @ 基线 main
- **正在改**：
  - `app/(flow)/mirror/page.tsx` —— 删 `id="mesh"` 区块、`MeshGraph` 渲染、`buildMesh()` 调用
  - `app/(flow)/fill/page.tsx` —— 撤掉「会多出节点和边」的承诺 + 删 `/mirror#mesh` 深链
  - `lib/domain/mesh.ts` —— 删 `buildMesh()` 及其私有 helper（保留 `buildCorpusMesh`）
  - `components/kanshan/states.ts` / `KanshanStage.tsx` —— 第 8 步文案
  - `scripts/check-square-crowd.mjs` —— 守卫⑥ 从「深链必须指向会变的那张图」改成「不许有死链与假承诺」
  - `scripts/mesh-selftest.mjs` —— 改为只验 `buildCorpusMesh`
  - `docs/backlog.md`（A5）/ `INDEX.md` / `character-engine.md` / `submission.md` / `product-plan.md` / `demo-video-script.md`
- **状态**：已提 PR
- **最后更新**：2026-09-17 00:20
- **备注**：owner 原话「这场生成出来的关系，功能一直没太做好，可以先删」。
  **删一块 UI 最危险的是「删了图却留着承诺」** —— 删图之后没有任何一张图会因补一段真人而变化
  （`/me` 的 `buildCorpusMesh` 只看关键词共现，实测补一条真人后节点/边数一个都没动），
  所以 `/fill` 那句承诺只能撤、不能把链接换成 `/me?tab=mesh`。守卫已做反向验证
  （注入 4 处 → 全被点名；还原 → 回绿）。
  **不动**：`/me` 的「我的 Mesh」、`/mesh` 重定向路由、`MineHandoffPanel` 搬运面板。
