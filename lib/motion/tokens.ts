/**
 * 动效设计令牌 —— 全站动效的唯一真相来源。
 *
 * 为什么必须集中：动效的「精致感」不来自单个动画好不好看，而来自
 * 不同地方的动画是否遵循同一套物理法则。之前项目里有 16 种硬编码时长、
 * 1 种缓动曲线、3 套互不相干的 spring 参数，观众说不出哪里不对，
 * 但会觉得「像是拼起来的」。
 *
 * 这个文件与 app/globals.css 的 `--dur-*` / `--ease-*` 区块**必须成对维护**：
 * CSS 负责样式层（transition / animation），本文件负责 JS 层（motion / gsap）。
 * 两边的数值语义一一对应，改一边就要改另一边。
 * 对应关系见下方每组的注释标注。
 *
 * 角色（看山）的状态机与造型参数不在这里，见 components/kanshan/states.ts。
 */

// ── 时长阶梯（对应 globals.css 的 --dur-*）──────────────────────────
// 单位统一用秒：motion 的 duration 以秒计，与 CSS 的毫秒分开表述更不易混。
export const DUR = {
  /** 90ms — 按压、hover 变色，几乎无感，只为消除跳变 */
  instant: 0.09,
  /** 160ms — 按钮、chip、输入框焦点等即时反馈 */
  fast: 0.16,
  /** 240ms — 卡片展开、浮层出现，主力过渡时长 */
  base: 0.24,
  /** 400ms — 面板滑入、抽屉等需要被看见的动作 */
  slow: 0.4,
  /** 680ms — 入场编排、页面转场 */
  slower: 0.68,
  /** 600ms — 数字滚动、文本逐字浮现：需要留够「读完」的时间 */
  read: 0.6,
  /** 1200ms — 仅用于 IP 形象呼吸与循环，不用于交互反馈 */
  cinematic: 1.2,
} as const;

// ── 缓动曲线（对应 globals.css 的 --ease-*）─────────────────────────
// 以 4 个数的元组形式给出，可直接喂给 motion 的 ease 字段。
// 不用浏览器内置 ease：它过于绵软，在中短时长里显得没力。
export const EASE = {
  /** 标准：起步快、收尾缓，像有质量的物体。绝大多数状态变化用它 */
  standard: [0.32, 0.72, 0, 1] as [number, number, number, number],
  /** 出场：从静止加速，最后轻轻落定。元素进入视野时用 */
  out: [0.16, 1, 0.3, 1] as [number, number, number, number],
  /** 入场：起步缓、加速离场，比出场更干脆。元素离开时用 */
  in: [0.7, 0, 0.84, 0] as [number, number, number, number],
  /** 强调：带轻微过冲，用于「这个变化值得注意」。克制使用 */
  emphasis: [0.34, 1.4, 0.64, 1] as [number, number, number, number],
} as const;

// ── 位移量（对应 globals.css 的 --shift-*）──────────────────────────
// 位移比时长更容易做过头。小元素小位移，大元素大位移。
export const SHIFT = {
  /** 6px — 文字、图标级微动 */
  sm: 6,
  /** 14px — 卡片级入场 */
  md: 14,
  /** 28px — 区块级入场 */
  lg: 28,
} as const;

// ── 弹簧参数 ────────────────────────────────────────────────────────
// 弹簧比缓动更「有生命」，但参数不统一就会各处手感不同。
// 按「元素质量」分层：越轻的元素 stiffness 越高（回弹越快）。
// 阻尼比全部控制在 0.9–1.0 之间——低于 0.9 会明显来回震荡，显得廉价。
export const SPRING = {
  /** 轻量：导航高亮、指示条、进度条等小元素，回弹干脆 */
  light: { type: 'spring', stiffness: 320, damping: 32 } as const,
  /** 常规：卡片入场的主力弹簧，稳重不拖沓 */
  card: { type: 'spring', stiffness: 260, damping: 28 } as const,
  /** 缓慢：缺口卡片等需要「被强调」的元素，动作更舒展，带一点重量感 */
  gap: { type: 'spring', stiffness: 180, damping: 22 } as const,
  /** 磁吸：跟手拖动、光标吸附，需要极低阻尼才跟得住 */
  magnet: { type: 'spring', stiffness: 150, damping: 18 } as const,
} as const;

// ── 编排节奏 ────────────────────────────────────────────────────────
/** 列表项之间的入场间隔，营造「依次落下」的节奏 */
export const STAGGER = 0.06;
/** 主内容与「缺口」之间的停顿：让观众先看完答案，再被缺口击中 */
export const GAP_PAUSE = 0.4;

// ── 兼容别名 ────────────────────────────────────────────────────────
// 保留旧名以免逐个改动调用点；新代码请直接用 SPRING.card 等语义名。
/** @deprecated 用 SPRING.card 代替 */
export const CARD_SPRING = SPRING.card;
/** @deprecated 用 SPRING.gap 代替 */
export const GAP_SPRING = SPRING.gap;
/** @deprecated 用 SPRING.light 代替 */
export const BAR_SPRING = SPRING.light;
/** @deprecated 用 SPRING.magnet 代替 */
export const MAGNET_SPRING = SPRING.magnet;

// ── 常用过渡预设 ────────────────────────────────────────────────────
/** 淡入上浮：最通用的入场。位移用 SHIFT.sm 起，大区块请自行覆盖 */
export const FADE_UP = {
  initial: { opacity: 0, y: SHIFT.sm },
  animate: { opacity: 1, y: 0 },
  transition: { duration: DUR.base, ease: EASE.out },
} as const;

/** 纯淡入：用于不该位移的元素（如覆盖层） */
export const FADE = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  transition: { duration: DUR.fast, ease: EASE.standard },
} as const;
