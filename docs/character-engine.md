# 看山角色引擎规格

> 最后更新：2026-09-14（已与 components/kanshan/ 实现对齐） · 目标：把刘看山做成 `grok-icon-study` 那种**弹簧驱动的活体图标**
> 参考仓库已拉取到 `.refs/grok-icon-study/`，**只借鉴架构，不使用其任何素材或几何数据**

## 一、参考项目架构审计（已精读）

参考实现（`replica/src/`）的可复用设计：

| 文件 | 职责 | 我们借鉴什么 |
|---|---|---|
| `tables.js` | 状态表、眼睛表、弹簧表、姿态常数 | **整套表驱动架构**（核心） |
| `character.js` | 状态机 + 每帧积分 + 形变 | 状态切换时的弹簧重置策略 |
| `eyes.js` | 眼睛形态队列、眨眼调度、注视跟随 | 眨眼关键帧曲线 + 指针 gaze |
| `pose.js` | 头部转角、倾斜、滚转 | 三维姿态投影到二维的手法 |
| `math.js` | 缓动、插值、矩阵 | 数值工具 |
| `fx.js` | 特效层 | 我们不需要（不做粒子特效） |

### 参考项目的表结构（原文关键值）

```js
GROUPS = { lifecycle: [sleeping, waking, idle, listening, thinking, searching, working],
           reactions: [16 种], agentMorphs: [orbit, radar, progress],
           productLifecycle: [13 种] }

EYE_PLAYLIST[state] = [眼睛形态索引数组]     // 每状态播放的眼睛序列
EYE_HOLD_MS[state]   = [min, max]           // 每种眼睛停留时长区间
BLINK_MS[state]      = [min, max] | null    // 眨眼间隔，null = 不眨

SPRINGS = { spin: [5, 0.9], x: [3.5, 1], y: [4, 1], squash: [10, 0.8],
            blink: [26, 1], eyeScale: [9, 0.85], gazeX: [13, 1], gazeY: [13, 1] }
            // 格式：[stiffness, damping]

ONBOARDING = [curious, happy, playful, excited, listening, proud, laughing, shy]
ONBOARDING_MS = 1200
onboardMood(n) = n % 2 === 0 ? "idle" : ONBOARDING[(n - 1) / 2]

FACE_TUNE = { size: 0.86, gap: 1.18, height: 1, eyeWidth: 0.96, eyeHeight: 0.92 }
POSE      = { turn: 17, tilt: -14, roll: 29, scale: 1 }
VIEW      = { minX: -15, minY: -15, width: 259, height: 259 };  VIEW_SCALE = 259/229
INK       = 11 组渐变 { lightFrom, lightTo, darkFrom, darkTo }, INK_ANGLE = 135
```

**重要**：上述数值属于 xAI 的实现。我们可以借鉴**参数的量级和结构**，
但看山的状态、眼睛形态与几何必须**自己重新定义**。下方即为本作品的原创定义。

## 二、看山的形态定义（原创）

刘看山是一只**北极狐**，官方视觉特征是：白色圆头、黑色小眼、尖耳、细长身体。
本项目用几何语言重新表达，不做写实：

| 部件 | 几何构成 |
|---|---|
| 头 | 圆 + 底部微压扁（squash 弹簧驱动） |
| 耳 | 两个三角（`polyPath`），随情绪改变倾角 |
| 眼 | 黑色多边形，形态随状态切换（见下表） |
| 鼻 | 小圆角三角 |
| 身体 | 圆角矩形 / 胶囊，随呼吸缩放 |
| 尾 | 弧形，摆动由独立弹簧驱动 |

**描边语言**：`stroke-linejoin: round`，线宽统一，深色填充 + 亮色描边（深色舞台上可读）。

## 三、状态机（原创，服务于产品流程）

看山是**主持人**，状态与产品步骤一一对应：

状态表定义在 [`components/kanshan/states.ts`](../components/kanshan/states.ts)，共 10 个状态，
每个状态配一组「眼神目标 + 停留时长区间」，由计时器在区间内随机切换 —— 角色因此显得自然，
而不是靠一条固定关键帧动画（这是从 grok-icon-study 学到的核心手法）。

| 状态 | 触发时机 | 姿态 | 眼神 |
|---|---|---|---|
| `idle` | 默认待机 | 轻微呼吸，不摆尾 | 缓慢左右扫视 + 眨眼 |
| `greeting` | 接入用户问题 | 头微低，耳前倾，摆尾 | 视线向下，略放大 |
| `routing` | Human Router 挑选分身 | 头部左右小幅转动 | 快速左右扫视 |
| `searching` | 取真实知乎证据 | 头微侧，摆尾 | 大幅左右搜索 |
| `thinking` | 交叉比对、找缺口 | 头微侧，尾静止 | 半闭、视线偏上 |
| `answering` | 生成多视角回答 | 头部轻微点头 | 平稳注视 |
| `gap` | **发现缺口** | 头微后仰，耳竖起，摆尾 | 放大（惊讶） |
| `inviting` | 邀请真人接管 | 头微前倾，耳下压，摆尾 | 视线向下、略放大 |
| `celebrate` | Mesh 更新完成 | 头抬起，耳张开，摆尾 | 微闭眼（开心） |
| `sleepy` | 长时间无交互 | 头下垂，耳下压 | 半闭眼、缓慢 |

### 状态迁移

```
idle ──用户输入──→ greeting ──提交──→ routing ──→ searching ──→ thinking
thinking ──→ answering ──检测到缺口──→ gap ──真人补充──→ inviting
inviting ──发布/Mesh 更新──→ celebrate ──→ idle
任意状态 ──长时间无交互──→ sleepy ──任意交互──→ idle
```

## 四、弹簧参数表（原创，服务于上述状态）

实现里这些参数直接写在 `components/kanshan/Kanshan.tsx` 的 `useSpring` 调用上，
下表是设计意图的集中记录；调整手感时改组件里的实参即可，本节用于说明「为什么是这些量级」。

格式 `[stiffness, damping]`，由 Motion 的 `useSpring` 驱动。

```ts
export const SPRINGS = {
  breathe:  [3, 1],      // 呼吸：极软，慢
  headX:    [4, 1],      // 头部水平位移
  headY:    [4, 1],
  tilt:     [6, 0.9],    // 头部倾斜
  turn:     [5, 0.9],    // 头部转向（模拟 3D）
  earL:     [12, 0.8],   // 左耳角度
  earR:     [12, 0.8],
  tail:     [8, 0.7],    // 尾巴摆动
  squash:   [10, 0.8],   // 压扁形变
  blink:    [26, 1],     // 眨眼：极快
  eyeScale: [9, 0.85],   // 眼睛缩放
  gazeX:    [13, 1],     // 注视跟随
  gazeY:    [13, 1],
  pop:      [220, 22],   // 状态切换时的弹跳
} as const;
```

## 五、眼睛形态表（原创几何）

实现方式：眼睛是固定几何（黑色椭圆 + 高光点），由**眼神目标表**驱动三个可插值量，
不再为每种情绪单独定义多边形 —— 少一半代码，且状态之间天然连续：

| 可插值量 | 含义 | 实现 |
|---|---|---|
| `x` / `y` | 瞳孔偏移，-1 ~ 1 | `useSpring` → `useTransform` 写 SVG 变换 |
| `lid` | 眼睑闭合度，0=睁 1=闭 | 用同色矩形做遮罩，`scaleY` 收缩 |
| `scale` | 眼睛缩放（惊讶时放大） | `useSpring` → `scale` |

10 个状态各自的目标序列见 `EYE_PLAYLISTS`。

### 眨眼调度

参考实现的曲线值得复用（**这是通用手法，不是专有素材**）：
一次眨眼由 4 个关键帧构成，总时长约 120 ms：

```
eyeScale: 1 → 0.05 → 0.05 → 1.08 → 1
时间点:   0    0.15   0.25   0.35   1  （归一化）
```
其中 `1.08` 的过冲制造「睁开时弹一下」的生动感。约 14% 概率触发连续双眨。

| 状态 | 眼神停留区间 |
|---|---|
| `idle` | 2.2 – 4.2 s |
| `greeting` | 0.9 – 1.5 s |
| `routing` | 0.52 – 0.9 s |
| `searching` | 0.62 – 1.0 s |
| `thinking` | 1.4 – 2.4 s |
| `answering` | 1.5 – 2.6 s |
| `gap` | 1.6 – 2.4 s |
| `inviting` | 1.3 – 2.1 s |
| `celebrate` | 0.7 – 1.3 s |
| `sleepy` | 3.6 – 6.2 s |

区间值定义在 `HOLD_MS`；切换时在区间内取随机值，所以不会出现机械的固定节拍。

## 六、注视跟随

- 桌面端：眼睛随鼠标指针偏移，最大偏移量为眼睛宽度的 18%。
- 移动端：随设备倾斜（需授权）或关闭。
- **输入框聚焦时**：视线锁定输入框方向，不跟随指针（表达「我在听」）。
- `prefers-reduced-motion`：完全关闭跟随。

## 七、与产品状态的接线

```tsx
// components/kanshan/Kanshan.tsx
export type KanshanState =
  | "idle" | "greeting" | "routing" | "searching" | "thinking"
  | "answering" | "gap" | "inviting" | "celebrate" | "sleepy";

<Kanshan state={phase} size={96} followPointer />
```

页面把镜像流程的阶段映射到 `KanshanState`；流程与状态的对应关系集中在
`FLOW_STATES`（`components/kanshan/states.ts`），页面只需给出阶段，不需要自己拼文案：

| 页面阶段 | KanshanState | 看山文案 |
|---|---|---|
| 未输入 | `idle` | — |
| 提交问题 | `greeting` | 接入问题 |
| Human Router 打分 | `routing` | 正在挑选该由哪些分身来答 |
| 检索证据 | `searching` | 在知乎检索公开回答 |
| 交叉比对 | `thinking` | 检查哪些地方证据不足 |
| 生成多视角 | `answering` | 每个分身按自己的文风作答 |
| 缺口区块出现 | `gap` | 这一段只有真人能答 |
| 邀请真人 | `inviting` | 按公开回答匹配到具体的人 |
| Mesh 更新 | `celebrate` | 补充完成，关系图长出新的边 |

## 八、实现要求

1. **纯 SVG + Motion**，不引入 Three.js / Lottie / 位图精灵。
2. 每帧只更新 SVG 属性，**不触发 React 重渲染**——用 `useMotionValue` + `useTransform`，
   必要时直接操作 DOM 属性。
3. 单个看山实例的动画开销 < 1ms/帧（60fps 下）。
4. 组件卸载时必须清理 rAF 与事件监听。
5. 官方素材包（`看山三视图.zip` / `刘看山动态.zip`）到位后，
   用于**校准几何比例**（头部占比、耳距、眼距），不直接贴图。

## 九、实现状态

- [x] 状态表驱动（`states.ts`：10 状态 × 眼神序列 × 停留区间 × 姿态表）
- [x] 弹簧动效（Motion `useSpring` / `useTransform`，无手写积分器）
- [x] 眼神与眨眼调度（`EYE_PLAYLISTS` + `HOLD_MS` 随机切换）
- [x] 指针 gaze 跟随（`followPointer`，写入 MotionValue 不触发重渲染）
- [x] 与页面阶段接线（`FLOW_STATES`）
- [x] `prefers-reduced-motion` 降级（`useReducedMotion` 同时关闭随机切换与跟随）
- [x] 多实例渐变隔离（`useId` 生成各实例独有的渐变 id，避免同页串色）
- [ ] 从官方素材包校准看山比例（**素材尚未下载成功，见 roadmap.md**；当前为原创几何比例）
