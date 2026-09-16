# 线程：dev-square-source（来源署名口径）

- **工作区**：`E:\codex\_dev2`（clone；`node_modules` 是指向主工作区的 junction，
  删这个目录会连带删掉主工作区的 `node_modules`）
- **分支**：`fix/attribution-leaks` @ 基线 `f5bb428`（main tip）
- **正在改**：
  - `lib/server/persona.ts`（`toSource()` 不再把空作者写成「匿名用户」）
  - `lib/domain/handoff.ts`（`collectSources()` 只收署名齐全的来源）
  - `components/mesh/MineHandoffPanel.tsx`（复用 `collectSources()`，删掉自写的那份过滤）
  - `scripts/check-mirror-shape.mjs`（§⑦ 守卫：署名不得伪造 + 搬运稿来源必须齐全）
- **状态**：进行中（等 PR 合并）
- **最后更新**：2026-09-16 11:20
- **备注**：#53 修了 `lib/server/mirror.ts` 的假署名与展示层口径，但**同一件事在仓库里有
  多处平行实现，当时只改了一处**。本轮补上剩下三处：
  ① `persona.ts` 有同一句 `?? "匿名用户"`（在线蒸馏走这条路径）；
  ② `handoff.ts` 的搬运来源清单只判 `!e.url`，不看作者名；
  ③ `MineHandoffPanel` 自写了一份同样的过滤。
  ②③ 的产物是**用户直接粘贴到知乎发布的正文**，空署名贴出去就是无出处引用（铁律 3）。
  已加 §⑦ 守卫，并通过负向验证（故意回退三处写法，三次都被拦住）。

## 已完成

| PR | 内容 | 结果 |
|---|---|---|
| #53 | `/square` 来源署名缺失（生产者→数据→消费者→展示四层 + 护栏） | 合并 `c474450`，线上 190/195 可核对 |
| #61 | 提交物事实对齐（16 位 → 15 蒸馏 + 1 预置） | 合并 `4f4cdfd` |
| #62 | 线程声明状态收尾 | 合并 |

## 留给审计线程的未决项（我不自行裁决）

1. **直答额度口径不一致**：`AGENTS.md` §1.5 写「直答 100/天」，而 `GET /api/v1/quota`
   实测 zhida_openai 是 **5000/天**（差 50 倍）。`voice-selftest` 的额度测算按 100/天算，
   `mirror.ts` 里我把两个数字都记了、预算按更小的算，UI 文案未动 ——
   改 L0 铁律的数字不是我的权限。
2. **`docs/product-plan.md` 的语料表述**：已在 PR #69 处理（该 PR 在途）。
