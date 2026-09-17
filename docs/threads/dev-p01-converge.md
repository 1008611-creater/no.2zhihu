# 线程：dev-p01-converge（收敛清单 P0-1「从提问到首轮分身回答」的两处不符）

- **工作区**：`E:\codex\heikesong3\.tools\dev-p01-converge`（main 源码包 + `node_modules` junction）
- **分支**：`feat/converge-p01-home`
- **正在改**：
  - `app/(flow)/page.tsx`（去掉不存在的链接解析承诺；未选人时不得开始作答）
  - `scripts/check-home-entry.mjs`（新增守卫，9 条断言）
  - `package.json`（新增 `check:home` 并接进 `check:logic`）
- **状态**：已提 PR
- **最后更新**：2026-09-17 10:35

## 认领的是哪一块

`docs/backlog.md` 的 **A3**（owner 的「最后一轮网站收敛清单」，由 `#90` 核验后落台账）。
核验结论 37 条里，**P0-3 已被 `dev-converge-p03` 线程认领**（PR #96/#97），
**P0-1 的两处不符当时无人认领** —— 本线程接这两条。

出处：https://hb.cauai.fun/show/heikesong-converge-audit/report.html

| # | 清单要求（原文摘要） | 核验时的实测 |
|---|---|---|
| 1.2 | 输入框如提示「可粘贴知乎问题链接」，**只有实际具备链接解析并能展示对应标题时才保留该提示**；否则改为「输入一个你真正想问的问题」，不做新解析功能 | placeholder 写着「…或粘贴知乎问题链接…」，下面还有「支持知乎链接」，但提问路径**没有解析能力** |
| 1.6 | **未选人时不能开始作答** | 作答按钮只挡 `running`，未选人**可点**，点下去静默降级成「让看山推荐并作答」 |

## 我已独立核实的现状（与清单一致）

```bash
$ grep -n "placeholder=\|支持知乎链接\|disabled={running}" "app/(flow)/page.tsx"
285:            placeholder="输入一个你真正想问的问题，或粘贴知乎问题链接…"
291:              支持知乎链接 · 结果缓存 30 分钟 · 重复演示不重复消耗额度
346:                disabled={running}
348:                {running ? "看山正在召集…" : selected.length > 0 ? "让这些答主作答 →" : "让看山推荐并作答 →"}

# 链接解析只存在于搬运 / 知乎接口两处，都不在提问路径：
$ grep -rn "questionUrl\|zhihu.com/question" app/api lib | head
app/api/handoff/route.ts:32:  const questionId = questionUrl?.match(/question\/(\d+)/)?.[1];
app/api/zhihu/question-answers/route.ts:18:  const answers = await questionAnswers(questionUrl, limit);
```

## 为什么按「改提示」而不是「做解析」走

清单给的是二选一：**真做解析并能展示标题**，或**把提示改掉、本轮不做新解析**。
选后者，理由：① 清单明确写「不做新解析功能」；② 首页提问路径的路由（`personaCandidates(question)`）
吃的是问题文本，接一个「链接→标题」的解析要新增接口与缓存，属新能力，不在本轮范围。

## 边界

- **不碰** `components/mirror/**`、`app/(flow)/mirror/page.tsx`（`dev-converge-p03` / `dev-fill-entry` / `dev-drop-session-mesh` 在做）
- **不碰** `docs/backlog.md`、`docs/threads/audit.md`
- **不合并、不部署**
- 改的是「界面说的话」与「实际能力」的一致性，**不新增任何网络能力**
