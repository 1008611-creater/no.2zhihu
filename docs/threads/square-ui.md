# 线程：square-ui（虚拟广场界面）

- **工作区**：`E:\codex\heikesong3\.tools\sq-arena`
- **分支**：`feat/square-stage2` @ 基线 `4025275`（当前 main）
- **正在改**：
  - `lib/domain/relic.ts`（新：话题 → 发光物件，关键词命中表）
  - `lib/domain/dialogue.ts`（新：小动作 / 看山注视，可复现）
  - `lib/domain/speech.ts`（新：从真实回答里摘原句当气泡）
  - `components/square/TopicRelic.tsx`（新：物件的几何形状）
  - `components/square/SpeechLayer.tsx`（新：气泡层）
  - `lib/domain/light.ts`（**接口变更**：`lightSourceOf(nodes,focusedId)` → `lightOfCluster(x,y,intensity)` + `hottestId`）
  - `components/square/CrowdCluster.tsx`、`SquareCanvas.tsx`、`SquareField.tsx`
  - `app/frontend-v2.css`
  - `scripts/check-square-relic.mjs`、`check-square-speech.mjs`、`check-square-css.mjs`、`check-square-figure.mjs`（均新）
  - `scripts/check-square-light.mjs`、`audit-square-visual.mjs`（改）
  - `scripts/dev/shot.mjs`（新：无头抓图）
  - `docs/threads/square-ui.md`（本文件）
- **状态**：已提 PR **#99**（对应台账 **A1 / A2**；待合并）
- **最后更新**：2026-09-17 11:05

## 这一轮做了什么（对应台账）

**A1「视觉不够顶级」** —— 把「空」从配色问题改成结构问题来解：

- **话题可视化**：每个话题中心立一件**属于该话题的发光物件**（房子 / 钱 / 咖啡杯 / 书 / 时钟 / 环 / 镜片…），
  由标题关键词命中一张物件表 —— 零模型、可解释、可复现。
- **影子终于合理**：原先全广场一盏灯，离灯最远的十几簇影子**平行甩向同一方向**，
  读起来像被风吹倒的草。现在每簇用自己的物件当光源，影子从物件向外辐射
  （实测逐簇影子方向张角中位数 138°，不再是 0°）。
- **人有了名字**：姓名全部取自库里已有的 `skills[].name`，一个字都不是我们编的。

**A2「小人能不能更有意思」**：

- 小动作（静立 / 转头 / 点头 / 凑近 / 挠头 / 挥手），**68% 只是静立** ——
  人人都动就不像人群，像机器人展。
- 广场中心站着刘看山，状态跟着你在做什么走（悬停 / 聚焦 / 该簇有缺口）。
- **对话气泡**：从 66 条真实回答里摘出原句弹出，**绝不编台词** ——
  半佛仙人没说过的话，不能由我们替他写在广场上。

## 顺手修掉的五个实测缺陷

每个都由真实截图 + 可复现数字定位，不是凭手感调的：

1. **气泡「看不见」不是尺寸问题，是对比度**：气泡底对页面底只有 **1.13:1**
   （一块和地面同亮度的板，字号放到 24px 也一样看不见）→ 提到 1.58:1 + 亮边框 + 投影。
2. `.sq-crowd-who` 用了**从未定义**的 `--text-600` / `--text-400`：CSS 变量不存在时
   **不报错**，只让声明失效、颜色退化成继承值 → 22 条姓名条一直用和标题一样亮的色渲染，
   且悬停高亮同样失效（等于没反馈）。
3. `.sq-crowd-label` 是 `flex`，而答主名是它的**直接子元素** → 在 flex 容器里
   `display:block` 的子元素照样横排，名字被挤成窄柱，截图里「半佛仙人 · 贱贱」
   断成「半 / 佛仙人 · 贱 / 贱」。改 `grid`。
4. `sq-fig-fold` 的**头是浮空的**：肩线在 `y=12.9`、头底在 `7.05`，间隙占身高 **29%**
   （另两个姿态 3% / 8%）→ 三分之一的「人」是一个黑圆浮在梯形体上方。
5. 看山排在人群**之前**渲染 → 被中央那簇的物件 / 人形 / 影子盖住，
   脸被橙色「环」的菱形框穿过。他是主持人，移到人群之后。

## 工具侧（这轮真正的教训）

- `scripts/audit-square-visual.mjs` **早就坏了**（调用已删除的 `lightSourceOf`，退出码 1），
  而它**没进 `check:logic`** → 静默腐烂数日。已修好并接进 `check:logic`。
  ⚠️ **不进 `check:logic` 的脚本一定会腐烂。**
- 该审计的「世界坐标 → 屏幕坐标」换算写错了（多加一次包围盒中心）→
  此前报出的「一屏只看到 10/22 簇」**是假的**，实测 **16/22**。
  （同一个错我在气泡定位上踩过一次，这是第二次。）
- 审计 ⑥ 节原为**推算**且结论方向说反（大屏不是更空，是看得更全）→ 改为实测四档屏幕。
- ⑤ 节是手写清单，会腐烂 → 每项加 CSS 探针，找不到就报「已失效」。

## ⚠️ 跨线程注意

- **`lib/domain/light.ts` 是接口变更**，不是纯新增：`lightSourceOf` 已删除。
  任何 import 它的地方都要改用 `lightOfCluster` / `hottestId`。
  已核：全仓代码引用为 0（只在注释里出现），四个消费者都在本 PR 内。
- 新增守卫一律写成**独立新文件**（`check-square-css` / `check-square-figure`），
  不跟别人的 `check-square-crowd.mjs` 抢同一个文件（硬上会静默回退别人的改动）。
- `package.json` 与 main 做过**三方合并**：main 新增的 `check:light` / `check:meta` /
  `check:deploy` 一个没丢，`check:logic` 取并集。
- ⚠️ **必须用项目自己的 `@/lib/motion/useReducedMotion`**，不能用 `motion/react` 的 ——
  后者首帧就同步返回媒体查询真实值，服务端返回 false，导致水合失败。
