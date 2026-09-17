# 线程：dev-converge-p03（收敛清单 P0-3「真人补充与搬运」）

- **工作区**：`E:\codex\_dev2`（clone；`node_modules` 是指向主工作区的 junction）
- **分支**：`feat/converge-p03-handoff`
- **正在改**：
  - `components/mirror/HandoffPanel.tsx`（删「我已在知乎发布」、新增「复制邀请文案」、换短口径）
  - `components/mesh/MineHandoffPanel.tsx`（删除同族发布按钮）
  - `app/(flow)/mirror/page.tsx`（「邀请补充」改指向搬运区域）
  - `lib/domain/handoff.ts`（邀请文案生成，纯函数）
  - `scripts/check-square-crowd.mjs`（新增守卫 §⑫）
- **状态**：**已提 PR #96** → 审计线程复核退回 → **审计线程已接手修正并合入本分支，待合并**
- **最后更新**：2026-09-17 10:40

## 交付摘要

| 清单条 | 落实情况 |
|---|---|
| 3.1 | 删掉两处「我已在知乎发布」按钮 + `confirmHandoffFor` 的 UI 调用 + `published` 死字段；`confirmed` 状态**失去生产者**（**未清理**：`confirmHandoffFor` 的定义/导出、`types.ts` 的 `"confirmed"`、`MyMeshPanel.tsx:74` 的读取都还在 —— 见下方审计修正） |
| 3.2 | 新增纯函数 `toInviteText()`；主按钮改为「复制邀请文案」，**不设 disabled**（清单原文：「不该以 status===human 为前置条件」） |
| 3.3 | `INVITE_COPIED_FEEDBACK` + 局部态（**不改 mirror 状态**） |
| 3.4 | `HANDOFF_BOUNDARY_SHORT` 逐字用清单原文；长版留在 `HANDOFF_NOTE` 与 `docs/api-audit.md` |
| 3.5 | 搬运区域加 `id="handoff"`；入口改 `href="#handoff"` —— **「按回答定位」未实现**（原实现是个没人传的死参数，已删），见下方审计修正 |

## ⚠️ 审计修正（2026-09-17，审计线程接手）

审计线程复核 PR #96 时发现三处，已在同一分支上修正：

1. **`inviteAnswerId` 是死参数（3.5 实际未落实）** —— 它定义了、组件内部也读它，
   但**全仓没有任何调用点传值**（唯一调用点是 `<HandoffPanel />`）→ 恒为 `undefined`
   → `copyInvite` 永远走 fallback「固定第一位答主」，**正是清单 3.5 要求排除的行为**。
   已删除该参数，不再声称「按回答定位」。
   > 为什么不是「接上就完事」：缺口候选是**检索到的真人作者**（`cand-<hash>`），
   > 分身回答是**AI 稿**（`ans-<skillId>`），**不是同一类对象、id 也不同源**。
   > 要真正按人定位，得先定「邀请的是真人还是分身」这个产品口径。
   > 口径未定之前，留一个「看着已接线」的死参数比没有更糟。**口径问题已记入 `docs/backlog.md` A3。**
2. **两处 markdown `**` 漏进用户可见文案** —— 全仓没有 markdown 渲染器，星号会原样显示/复制：
   `app/(flow)/mirror/page.tsx`（页面上）与 `lib/domain/handoff.ts` 的邀请文案
   （**这段是剪贴板正文，用户会发给答主**）。两处都已去掉；并在守卫 §⑫ 加了一条
   **行为层断言**（直接调 `toInviteText()` 断言输出里没有 markdown 标记）防回归。
3. **「`confirmed` 一并清理」这句不实** —— 原「正在改」列表写了
   `lib/store/mirror-store.tsx` / `lib/domain/types.ts`，但 PR 并未改这两个文件。
   已改为如实描述（「失去生产者，未清理」）。本线程**不打算**清理它们：
   `confirmHandoffFor` 保留可兼容旧数据里的 `confirmed`，删它属独立重构、与本清单无关。

**教训（值得其他线程注意）**：守卫 §⑫ 原来的断言是 `/copyInvite/.test(panelSrc)` ——
打在「**提到过** `copyInvite`」，而不是「**真的在用它**」→ 天生拦不住「传进去的是 `undefined`」。
**源码断言只看组件内部，看不见调用点有没有传参。** 现已升级为三层断言 + 一条行为层断言。

## ⚠️ 本 PR 换过两次基线（值得其他线程注意）

`scripts/check-square-crowd.mjs` 与 `app/(flow)/mirror/page.tsx` **被 #87 与 #95 先后改过**。
第一次提交基于旧 main，会**静默回退掉 #87 的 96 行** —— 已重做两遍，并在提交前后各加断言核过
「§⑪ 仍在」。**教训：提交前 `assert main == BASE`，提交后回读新树断言别人的改动还在。**


## 认领的是哪一块

`docs/backlog.md` 的 **A3**（owner 的「最后一轮网站收敛清单」，由 `#90` 核验后落台账）。
核验结论：**37 条 —— 29 已通过 / 3 需修改 / 5 尚未实现**，其中 **P0-3 整块「尚未实现」**
（「本轮最大缺口」），且 `#90` 明确**不改业务代码**，把这块留给开发线程。

**P0-3 的五项缺口**（逐条来自 owner 清单，出处：https://hb.cauai.fun/show/heikesong-converge-audit/report.html ）：

| # | 清单要求（原文摘要） |
|---|---|
| 3.1 | **移除「我已在知乎发布」按钮**，不保留无法验证的发布状态 |
| 3.2 | 「先让真人补充内容」改为**复制供用户自行发送的邀请文案**（含问题、被邀请答主名称、该答主的 AI 草稿、「这是 AI 草稿，请由本人修改或补充」） |
| 3.3 | 成功反馈为「**邀请内容已复制，请自行发送给答主**」，页面状态仍为「等待真人补充」 |
| 3.4 | 长接口解释缩成：「**本站不能替你在知乎发布。复制并编辑内容后，请由本人自行发布。**」 |
| 3.5 | 「邀请补充」入口应进入**同一份当前回答**的搬运区域（不能固定第一位答主） |

（3.6 仅措辞差异「已复制到剪贴板」→「正文已复制」；3.7–3.10 已通过，本线程会保持不回归。）

## 我已独立核实的现状（与清单一致）

```bash
$ grep -n "我已在知乎发布" components/mirror/HandoffPanel.tsx components/mesh/MineHandoffPanel.tsx
components/mirror/HandoffPanel.tsx:124:   {confirmed ? "已确认" : "我已在知乎发布"}
components/mesh/MineHandoffPanel.tsx:207: {confirmed ? "已标记为已发布" : "我已在知乎发布"}

$ for t in "邀请内容已复制，请自行发送给答主" "这是 AI 草稿，请由本人修改或补充" "本站不能替你在知乎发布"; do
    grep -rc "$t" --include=*.tsx --include=*.ts components/ app/ lib/; done
0 / 0 / 0          # 三处新文案全仓 0 命中

$ grep -n "54 个接口文档" components/mirror/HandoffPanel.tsx
104:  <strong>关于「直接发布」：</strong>我们审计了知乎开放平台全部 54 个接口文档，
```

## 边界

- **不碰** `app/errors*`（`#87` 在做）、`docs/backlog.md`（`#90` 在做）、`docs/threads/audit.md`（审计线程）
- **不合并、不部署**
- 改动沿用既有约定：文案与状态一律走 `lib/domain/` 的纯函数，便于自检直接调用
- **不新增知乎发布接口**（3.10 已通过，会保持不回归）
