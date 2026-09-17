/**
 * 虚拟广场 · 光影几何（纯函数，零随机、可复现）。
 *
 * ## 为什么要有这一层
 *
 * 广场要看起来像一个**空间**，而不是一张撒满小人的图。空间感来自三件事，
 * 它们都是几何，不是美术：
 *
 *   ① **纵深**：远处的场子比近处小、也比近处暗（大气透视）
 *   ② **光**：**每个话题自己发光** —— 它中间立着一件属于该话题的物件
 *      （见 `relic.ts`），人群围着它站。这是 2026-09-16 的关键修正：
 *      原先设计是「全广场一盏灯」，于是离灯远的那十几簇，
 *      所有人的影子互相平行地甩向同一个方向 —— 实测截图里读起来像
 *      「被风吹倒的草」，不像投影。改成每簇自发光之后，
 *      **每一簇的光影自己就自洽了**，不需要任何解释。
 *   ③ **影**：每个人朝背离**本簇光源**的方向在地上甩出一条影子
 *
 * 这三件事一旦成立，「人站在地上」这件事就不需要解释 —— 眼睛自己会信。
 * 而它们全是**由坐标算出来的**，所以同一份数据永远得到同一个画面，
 * 评委刷新看到的广场不会变。
 *
 * ## 诚实性
 *
 * 影子的长度与方向只由「人在哪、光在哪、他多高」决定；纵深只由 y 坐标决定。
 * **没有任何一个视觉量是从数据里编出来的** —— 热度只用来决定「光落在谁头上」，
 * 那是布局层已经算好的 `size`，不是新造的数字。
 */

import { stableHash, type TopicNode } from "./square-layout";

export interface Point {
  x: number;
  y: number;
}

/** 一个光源。现在是**每簇一个**（就在那件发光物件的位置）。 */
export interface LightSource {
  /** "cluster" = 该簇自己的物件；其余值是历史用法，保留兼容 */
  id: string;
  x: number;
  y: number;
  /** 光晕强度 0..1（由热度决定）。只影响渲染亮度，不影响影子几何。 */
  intensity?: number;
}

export interface Shadow {
  /** 起点 = 脚底（世界坐标） */
  x: number;
  y: number;
  /** 相对 +Y 轴的旋转角（度）—— 影子沿这个方向从脚底甩出去 */
  angle: number;
  /** 影长（世界像素） */
  length: number;
  /** 影宽（世界像素） */
  width: number;
}

/* ------------------------------ 纵深 ------------------------------ */

/**
 * 近处 / 远处的缩放比。
 *
 * 0.6 是**看了截图调的**：小于 0.5 时远处那几簇小到看不出是人，
 * 大于 0.75 时纵深几乎感觉不到（和均匀大小差不多）。
 * 改它必须重新看一遍广场，别凭手感改。
 */
const NEAR_SCALE = 1;
const FAR_SCALE = 0.66;

/** 远处 / 近处的明度。远处淡入背景（大气透视），近处清晰。 */
const NEAR_OPACITY = 1;
const FAR_OPACITY = 0.46;

/**
 * 归一化纵深：0 = 最远（屏幕上方），1 = 最近。
 *
 * 用平方根而不是线性：线性映射会让「中间那一片」全都挤在同一个尺度上，
 * 看起来像三层剪纸；开方之后纵深变化更连续，像一块真的向远处退去的地面。
 */
export function depthOf(y: number, minY: number, maxY: number): number {
  const span = maxY - minY;
  if (!(span > 0)) return 1;
  const t = Math.min(Math.max((y - minY) / span, 0), 1);
  return Math.sqrt(t);
}

export function groundScaleAt(depth: number): number {
  return FAR_SCALE + (NEAR_SCALE - FAR_SCALE) * depth;
}

export function groundOpacityAt(depth: number): number {
  return FAR_OPACITY + (NEAR_OPACITY - FAR_OPACITY) * depth;
}

/* ------------------------------ 光源 ------------------------------ */

/**
 * 一个话题的光源 —— **就在它自己的中心**。
 *
 * ## 为什么不是「全广场一盏灯」（2026-09-16 修正）
 *
 * 上一版用 `lightSourceOf(nodes, focusedId)` 选出一盏共享的灯，落在最热那一场。
 * 几何上是成立的，观感上不成立：离灯最远的那十几簇，几十条影子互相平行地
 * 甩向同一个方向，读起来像一片被风吹倒的草。
 *
 * 真实世界里，一堆人围着某样东西看的时候，**光就来自那样东西**。
 * 所以现在每簇用自己中心当光源，影子从物件向外辐射 ——
 * 每一簇的光影自己闭合，不需要任何解释。
 *
 * @param x/y       话题中心（簇心，也是那件发光物件的位置）
 * @param intensity 光晕强度 0..1（由热度决定，见 `relic.ts`）——
 *                  只影响渲染层亮度，不影响影子方向（方向仍是纯几何）
 */
export function lightOfCluster(x: number, y: number, intensity: number): LightSource {
  return { id: "cluster", x, y, intensity };
}

/**
 * 全广场最热的那个话题 id。
 *
 * 不再用于光源，但有一个正当用途 —— **看山（主持人）的注视目标**：
 * 他该多看几眼最热那一场。这是一个跨簇的全局判断，与「每簇自发光」不冲突。
 */
export function hottestId(nodes: Array<Pick<TopicNode, "id" | "size">>): string | null {
  if (nodes.length === 0) return null;
  let best = nodes[0];
  for (const n of nodes) if (n.size > best.size) best = n;
  return best.id;
}

/**
 * 影长的归一化尺度 —— 从「光源到最远簇的距离」改成**簇自己的半径**。
 *
 * 为什么必须改：上一版用全广场的范围做归一化。现在每簇自发光，
 * 若仍用广场范围，簇内那几十像素的距离会被归一化成接近 0，
 * 结果**全场影子长度几乎一样** ——「近处影子长、远处影子短」
 * 这个唯一能表达纵深的东西就没了。
 *
 * 现在用簇半径：人站得离物件越远（在簇的外圈），影子越长。
 * 这也更符合真实的「点光源 + 地面」——物距决定影长。
 */
export function lightReach(radius: number): number {
  return Math.max(radius, 1);
}

/* ------------------------------ 影子 ------------------------------ */

/**
 * 影长系数：`人高 × (BASE + GROWTH × 归一化距离)`。
 *
 * 为什么绑在人高上而不是绝对像素：远处的人本来就小，给他一条固定长度的影子
 * 会像一根插在地上的棍子。绑在人高上，影子才永远是「这个人自己的影子」。
 */
const SHADOW_BASE = 0.5;
/**
 * 1.15 → 0.85。
 *
 * 人形从 33px 提到 49px 之后，影长按 `height × k` 同比例放大 ——
 * 截图里远处那几簇的影子甩得比人还长，读起来像「一根根棍子」而不是投影。
 * 影长必须**相对人高**收敛，不能跟着人一起放大。
 */
const SHADOW_GROWTH = 0.85;
/** 影长相对人高的上下限 —— 防止极近/极远时影子短到看不见或长到穿场。 */
const SHADOW_MIN_K = 0.42;
const SHADOW_MAX_K = 1.85;
/** 影宽 / 人高。人形肩宽约 0.46h，影子比人窄一点，像被压扁投在地上。 */
const SHADOW_WIDTH_K = 0.34;

/**
 * 算一条影子。
 *
 * @param foot    脚底世界坐标
 * @param height  人形高度（世界像素）
 * @param light   光源
 * @param reach   光源到最远簇的距离（归一化用）
 */
export function shadowOf(foot: Point, height: number, light: LightSource, reach: number): Shadow {
  const dx = foot.x - light.x;
  const dy = foot.y - light.y;
  const dist = Math.hypot(dx, dy);

  // 站在光源正下方 —— 没有方向可言。给一个向下的短影，而不是随机方向：
  // 随机会让同一份数据每次刷新长得不一样，而广场必须可复现。
  const angle = dist > 0.01 ? (Math.atan2(dx, dy) * 180) / Math.PI : 0;

  const norm = reach > 0 ? Math.min(dist / reach, 1) : 0;
  const k = Math.min(Math.max(SHADOW_BASE + SHADOW_GROWTH * norm, SHADOW_MIN_K), SHADOW_MAX_K);

  return {
    x: foot.x,
    y: foot.y,
    angle,
    length: height * k,
    width: Math.max(height * SHADOW_WIDTH_K, 2),
  };
}

/* ------------------------------ 相位 ------------------------------ */

/**
 * 由稳定 key 导出 0..1 的相位。
 *
 * 用途：给每个人的「呼吸」错相。**这不是随机数** —— 同一个人永远拿到同一个相位，
 * 所以广场是静止可复现的；但相邻的人相位不同，整片人群就不会像在做广播体操。
 */
export function phaseOf(key: string): number {
  return (stableHash(key) % 1000) / 1000;
}

/* ------------------------------ 人形姿态 ------------------------------ */

/**
 * 人形姿态变体。
 *
 * 为什么必须要有：97 个一模一样的剪影读起来是「一个图标被复制了 97 次」，
 * 这正是上一版被说「平庸」的直接原因。四种姿态 + 身高/肩宽/倾斜的个体差异
 * 之后，同样的 97 个人读起来才像「一广场的人」。
 *
 * 四种都是**几何微调**，不是插画：正立 / 侧身 / 微倾 / 抱臂。
 */
export type FigurePose = "stand" | "turn" | "fold";

export interface FigureShape {
  pose: FigurePose;
  /** 身高倍率 0.88–1.12 */
  heightScale: number;
  /** 肩宽倍率 0.9–1.1 */
  widthScale: number;
  /** 整体倾斜（度），−7..7 */
  lean: number;
  /** 呼吸相位 0..1 */
  phase: number;
}

/**
 * 三种姿态 —— 不是四种。
 *
 * 「倾斜」没有单独做姿态：它已经是 `lean` 这个独立的旋转维度了，
 * 再做成第四种姿态等于同一个变化画两遍。三种姿态 × 倾斜 × 身高 × 肩宽
 * 的组合已经有 3×15×… 种，足够让 97 个人没有一个重样。
 */
const POSES: FigurePose[] = ["stand", "turn", "fold"];

/**
 * 由人形的稳定 key 派生它的体态。
 *
 * 全部落在窄区间里：身高 ±12%、肩宽 ±10%、倾斜 ±7°。
 * 幅度再大就会从「一广场的人」变成「一广场的怪人」——
 * 这里的目的是去掉盖章感，不是做角色设计。
 */
export function shapeOf(key: string): FigureShape {
  const h = stableHash(key);
  const pick = (salt: number, lo: number, hi: number) => {
    const x = (h ^ Math.imul(salt + 1, 0x9e3779b9)) >>> 0;
    const u = ((x >>> 8) & 0xffff) / 0x10000;
    return lo + (hi - lo) * u;
  };
  return {
    pose: POSES[h % POSES.length],
    heightScale: pick(1, 0.88, 1.12),
    widthScale: pick(2, 0.9, 1.1),
    lean: pick(3, -7, 7),
    phase: phaseOf(key),
  };
}
