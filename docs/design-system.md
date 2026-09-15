# 视觉与动效规范

> 最后更新：2026-09-14 · 风格定位：**Motion Graphic × 文字几何（Typographic Geometry）**
> 实现载体：`app/globals.css` 的 `:root` token + Motion 动效

## 一、风格定义

三个关键词，任何视觉决策都必须同时满足：

1. **几何化**：一切形状来自圆、方、线、弧。不用插画风、不用拟物、不用阴影堆叠。
2. **文字即图形**：标题、编号、标签本身就是版式元素。大字号、紧字距、中英混排做节奏。
3. **运动有物理感**：所有位移、缩放、形变都由弹簧驱动，不用线性缓动。有惯性、有回弹。

反面清单（**不要做**）：圆角气泡对话框、渐变彩虹按钮、emoji 当图标、
模糊大光斑背景、卡片阴影堆叠、无意义的视差滚动。

## 二、色彩

深色舞台 + 四色状态系统。**四色不是装饰，是 Skill 分身的身份标识**，
同色在不同页面必须指同一个分身。

| Token | 值 | 用途 |
|---|---|---|
| `--ink-950` | `#07080f` | 页面底色 |
| `--ink-900` | `#0b0d17` | 输入框、下沉区域 |
| `--ink-850` | `#10121f` | 卡片 |
| `--ink-800` | `#161927` | 悬浮态 |
| `--ink-700` | `#1f2333` | chip 底 |
| `--line` | `#262b3d` | 主描边 |
| `--line-soft` | `#1c2032` | 分隔线、网格 |

| 状态色 | 主 | 浅 | 语义 |
|---|---|---|---|
| blue | `#4d7cff` | `#93b0ff` | 答主 A 组（贱贱 / 陈章鱼）+ 视角型补充层 |
| violet | `#8b5cf6` | `#c0a4ff` | 答主 B 组（张佳玮）+ 拆解者 |
| green | `#2fbf8f` | `#86e5c4` | 答主 C 组（李松蔚）+ 实操派 |
| orange | `#ff8a4c` | `#ffbb92` | 答主 D 组（半佛仙人 / 大猛）+ 缺口 |

> v1 起状态色按**答主人格**分配（见 `lib/domain/personas/` 里各 `accent`），
> 视角型补充层沿用旧映射。**orange 仍是缺口专用色**。

文字层级：`--text-100` 正文主色 → `--text-300` 次要 → `--text-500` 辅助 → `--text-700` 极弱（仅标签）。

**orange 是缺口的专用色。** 缺口组件必须用 orange 左边框 + 橙色渐变淡出，与分身卡在视觉上区分开。

## 三、字体

| 用途 | 字体 | 说明 |
|---|---|---|
| 中文与正文 | **Manrope** → `PingFang SC` → `Microsoft YaHei` | 几何无衬线，字面干净 |
| 数字、代码、标签 | **DM Mono** | 用于 eyebrow、编号、统计数字、URL |

规则：
- 大标题 `letter-spacing: -0.025em`（紧），eyebrow `0.22em`（极松）+ 全大写。
- 这种「紧—松」对比就是文字几何的核心手法。
- 数字统一用 DM Mono，让统计区看起来像仪表盘而不是正文。

## 四、栅格与间距

- 容器最大宽 `1240px`，左右 padding `24px`（移动端 `16px`）。
- 间距阶梯：`4 / 8 / 12 / 16 / 20 / 24 / 32 / 56`。
- 圆角：`8 / 14 / 22 / 30`，对应 sm / 默认 / lg / xl。
- 网格底纹：`56px` 方格，透明度极低（`opacity: 0.72` 叠加多层渐变后用径向遮罩淡出），
  只在页面上半部可见，制造「坐标纸」的工程感。

## 五、动效规范

### 弹簧参数（唯一来源）

统一使用 `[stiffness, damping]` 对。**禁止使用 `ease-in-out` 等线性缓动做位移。**

| 用途 | 参数 | 手感 |
|---|---|---|
| 卡片入场 | `{ type:'spring', stiffness: 260, damping: 26 }` | 干脆，轻微过冲 |
| 分身出现（错峰） | 同上，`delay: i * 0.06` | 依次落位 |
| 缺口高亮 | `{ stiffness: 180, damping: 18 }` | 更软，有呼吸感 |
| 看山身体 | 见 [character-engine.md](character-engine.md) | 独立弹簧表 |
| 状态色条展开 | `scaleX: 0 → 1`，`{ stiffness: 300, damping: 30 }` | 快速划线 |

### 时间

| 交互 | 时长 |
|---|---|
| 悬停反馈 | 160–180 ms |
| 卡片入场 | 320 ms（弹簧自然时长） |
| 分身错峰间隔 | 60 ms |
| 缺口揭示 | 先停顿 400 ms 再动（**留白是节奏的一部分**） |
| 看山状态切换 | 见角色引擎 |

### 必须遵守

1. `prefers-reduced-motion: reduce` 时，所有位移改为淡入，看山停止循环动画。
2. 动效只用于**表达状态变化**，不做无意义装饰。
3. 首屏动画总时长不超过 1.2 秒。
4. 不用 `transition: all`，显式声明属性。

## 六、组件规范

| 组件 | 规则 |
|---|---|
| `.card` | 深色渐变底 + 1px 描边 + 22px 圆角。**不用 box-shadow 做层次**，用描边和底色 |
| `.accent-bar` | 3px 高，渐变，位于卡片顶部，标识分身身份色 |
| `.chip` | 全圆角，11.5px，用于标签；有对应的 `.chip-{color}` 变体 |
| `.gap` | 左边 3px orange，右侧渐变淡出。**缺口专用，不可复用于其他提示** |
| `.notice` | 虚线描边，用于降级/错误提示。`notice-warn` / `notice-info` 两种语气 |
| `.btn-primary` | 蓝紫渐变，无描边。**全页面最多一处主按钮** |
| `.stat-n` | `--font-mono`（JetBrains Mono），26px，用于统计数字 |
| `.kanshan` | 看山舞台：状态色光晕 + 缓慢旋转装饰环 + 官方 GIF/PNG。`data-accent` 决定配色 |
| `.persona-tile` | 答主名册卡片，整卡可点，hover 上移 3px，不做阴影堆叠 |
| `.rail / .rail-step` | 流程轨道：8 步收成一条可读竖列，当前步高亮、已完成转绿 |
| `.nav-drawer` | 窄屏（≤860px）导航抽屉，弹簧滑入，Esc / 点击遮罩关闭 |
| `.page-enter / .rise-1..5` | 页面入场与首屏错峰入场，纯 CSS 关键帧，不依赖 JS |

## 七、页面节奏（首页）

```
[顶栏]  品牌 + 导航 + 登录
[首屏]  eyebrow(HUMAN MESH · 0级入口) → 大标题 → 说明 → 输入框 + 召集按钮
        ↑ 看山在此处，尺寸最大，随输入状态变化
[舞台]  看山主持 + 分身网格（错峰入场，各自带状态色条）
[缺口]  ★ 橙色缺口区，视觉上与前一块明显断开
[网格]  Human Mesh 关系图（圆环 + 节点）
[页脚]  作品名 + 来源声明
```

**关键**：每一块之间用大间距（56px+）和细分隔线断开，让页面像「分镜」而不是长文。

## 八、产出状态

- [x] 项目 icon —— `app/icon.svg`（矢量几何标记，随 `app/manifest.ts` 注册；角色形象本身用官方素材）
- [x] 项目封面图 —— `docs/assets/cover.svg`（1600×900，大标题 + 坐标纸网格；看山形象以官方素材为准）
- [x] 缺口动效与分镜说明 —— `docs/demo-video-script.md`

## 九、精致度收敛记录（2026-09-15）

一轮以「收敛」为目标的巡检与修复，共 12 处。原则：**不新增视觉语言，只把已有规范落到实处**。

| # | 问题 | 处置 |
|---|---|---|
| 1 | `HeroTitle` 在 `prefers-reduced-motion` 下把副标题永久留在 `opacity: 0`（`initial={false}` 配 `animate="visible"` 互相打架） | 降级路径改为直接返回静态 `<h1>`，不依赖动画终态 |
| 2 | `.eyebrow` / `.persona-mono` 引用 `"DM Mono"`，而该字体**从未被加载**，mono 字体栈实际一直靠系统兜底 | 改用 `var(--font-mono)`，与 `layout.tsx` 的 `localFont` 对齐 |
| 3 | 6 个官方 GIF 合计 **5.56 MB**，其中 951 KB 的 `idle.gif` 被当作首页 LCP 元素预加载 | 转 WebP（`scripts/convert-kanshan-webp.py`）→ **1.36 MB（24%）**；`<picture>` + WebP 优先、GIF 兜底（保留 GIF 是素材授权要求） |
| 4 | `metadata.other` 里写的 preload 被 Next 渲染成 `<meta name="link:preload:...">`，浏览器**不认**，属静默失效 | 改用 `ReactDOM.preload()`，渲染出真正的 `<link rel="preload" as="image" type="image/webp">` |
| 5 | `app/globals.css` 与 `app/frontend-v2.css` 各有一份 `prefers-reduced-motion` 块，规则互相覆盖 | 统一到 `globals.css` 一处，另一处只保留 v2 专有项 |
| 6 | reduced-motion 下 `.skeleton` 的扫光被禁用后留下冻结的渐变条纹 | 显式改为纯色底 |
| 7 | 首页空态只有一行 `.notice`，浪费首屏最有价值的位置，且**没有教会用户「缺口」这个核心差异** | 换成 3 张机制说明卡（`01 HUMAN ROUTER` / `02 各自作答` / `03 缺口`），只描述产品机制，不含任何知乎数据 |
| 8 | `.section-head` 在标题与多行说明并排时基线错位 | `:has(.lede, .dim)` 时改 `align-items: flex-start` |
| 9 | 长页面（首页 / mirror / mesh）无阅读进度提示 | 新增 `.scroll-progress`（2px 渐变条）+ `ScrollProgress` 组件，reduced-motion 下不渲染 |
| 10 | `MeshGraph` 固定 720px viewBox，窄屏节点标签重叠、不可用 | `≤720px` 时改为 560px 最小宽的横向滚动容器 + 右缘渐隐 |
| 11 | 证据时间轴缺少序号，长列表难以定位 | 每条加 `#01` 形式序号 |
| 12 | `RouteTransition` 写 `gsap.core.Tween` 类型注解导致 `next build` 类型检查失败（`gsap.core` 是全局 ambient 命名空间，未从 `"gsap"` 模块导出） | 改用 `ReturnType<typeof gsap.to>` |
