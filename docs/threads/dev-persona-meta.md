# 线程：dev-persona-meta（答主页 metadata）

- **工作区**：`E:\codex\heikesong3\.tools\dev-persona-meta`（main 源码包 + `node_modules` junction）
- **分支**：`fix/persona-page-metadata` @ 基线 `0a6f33e9`
- **正在改**：
  - `lib/domain/persona-meta.ts`（新增：档案页元信息，纯函数、不 import next）
  - `app/(explore)/personas/[handle]/layout.tsx`（命中名册时也返回 metadata）
  - `app/(explore)/personas/page.tsx`（名册页补 metadata）
  - `scripts/check-persona-metadata.mjs`（新增守卫，含合成用例与反例）
  - `package.json`（新增 `check:meta` 并进 `check:logic`）
- **状态**：已提 PR #78
- **最后更新**：2026-09-16 15:35
- **备注**：16 位答主档案页此前**全部只有根布局的默认标题**（分享任何一位都是同一句话）。
  根因：`page.tsx` 是 `"use client"`，客户端组件不能导出 `generateMetadata`；
  而 `[handle]/layout.tsx` 写成「命中名册就 `return {}`」，于是不干预 → 继承根默认。
  现在两种情况都走同一个纯函数，口径只有一处。**#72 的决策保持不变**
  （未知 handle 不改成 404，只加 `noindex`）。
