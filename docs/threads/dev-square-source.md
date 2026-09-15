# 线程：dev-square-source（广场来源署名）

- **工作区**：`E:\codex\_dev2`（clone；`node_modules` 是指向主工作区的 junction，
  删这个目录会连带删掉主工作区的 `node_modules`）
- **分支**：`fix/square-source-attribution` @ 基线 `529df3f`（PR #53）
- **正在改**：
  - `lib/domain/evidence.ts`（新增：来源可用性判定，纯函数，供 domain 与展示层共用）
  - `lib/domain/library.ts`（`evidenceTitles` → `sources`；按「可展示」口径统计）
  - `lib/server/mirror.ts`（`toSource()` 不再把空作者写成「匿名用户」）
  - `lib/domain/broadcast.ts`（右栏计数与回答页同一口径）
  - `app/(flow)/answer/[id]/page.tsx`（只渲染有出处来源，其余披露条数）
  - `components/mirror/EvidenceOverview.tsx`（先筛后去重）
  - `components/square/FeedStream.tsx`（死文件，同步类型，已标注）
  - `public/square-library.json`（数据：195 条来源，190 条可取回署名，97.4%）
- **状态**：已提 PR #53（等审计上线线程合并）
- **最后更新**：2026-09-15 20:20
- **备注**：修 `/square` 来源署名缺失 —— `slim()` 过去只留标题，导致 22 场 / 66 篇的
  `sources` 全空、广场回答点不到原文（违反铁律 3）。回填走的是「标题全等」再检索，
  没有重跑 66 次直答。
- **留给审计线程的两个未决项**（我不自行裁决）：
  1. 额度口径不一致：`AGENTS.md` §1.5 写直答 100/天，而 `/api/v1/quota` 实测 5000/天。
     我在 `mirror.ts` 里两个数字都记了，预算一律按更小的（100/天）算，UI 文案未动。
  2. `docs/submission.md:87/94` 仍写「预置 16 位…由本人公开回答蒸馏」—— 实际是
     15 位蒸馏 + `jiangxiaozhang` 预置（他没有可用公开语料）。提交物与事实不符，需改。
