# 线程：dev-converge-p03（收敛清单 P0-3「真人补充与搬运」）

- **工作区**：`E:\codex\_dev2`（clone；`node_modules` 是指向主工作区的 junction）
- **分支**：`feat/converge-p03-handoff`（待建）
- **正在改**：
  - `components/mirror/HandoffPanel.tsx`（删「我已在知乎发布」、新增「复制邀请文案」、换短口径）
  - `components/mesh/MineHandoffPanel.tsx`（删除同族发布按钮）
  - `components/mirror/GapCard.tsx` + `app/(flow)/mirror/page.tsx`（「邀请补充」改指向搬运区域）
  - `lib/store/mirror-store.tsx` / `lib/domain/types.ts`（`confirmed` 状态失去生产者 → 一并清理）
  - `lib/domain/handoff.ts`（邀请文案生成，纯函数）
- **状态**：**已提 PR #96**（CI 全绿）—— 5 项全部落实，等审计线程合并
- **最后更新**：2026-09-17 00:50

## 交付摘要

| 清单条 | 落实情况 |
|---|---|
| 3.1 | 删掉两处「我已在知乎发布」按钮 + `confirmHandoffFor` 的 UI 调用 + `published` 死字段；`confirmed` 状态随之没有生产者 |
| 3.2 | 新增纯函数 `toInviteText()`；主按钮改为「复制邀请文案」，**不设 disabled**（清单原文：「不该以 status===human 为前置条件」） |
| 3.3 | `INVITE_COPIED_FEEDBACK` + 局部态（**不改 mirror 状态**） |
| 3.4 | `HANDOFF_BOUNDARY_SHORT` 逐字用清单原文；长版留在 `HANDOFF_NOTE` 与 `docs/api-audit.md` |
| 3.5 | 搬运区域加 `id="handoff"`；入口改 `href="#handoff"`；新增 `inviteAnswerId` 支持按回答定位 |

**验证**：`tsc` rc=0 ｜ `check:logic` 9 条全绿 ｜ `next build` rc=0
｜ 新守卫 **§⑫**（编号避开 #87 的 §⑪）10 条断言、**6/6 负向验证**全拦
｜ CDP 真机（注入真实 `square-library.json` 经 `hydrateLibraryEntry` 造数据，零额度）**6/6 + 3.3 点击反馈**

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
