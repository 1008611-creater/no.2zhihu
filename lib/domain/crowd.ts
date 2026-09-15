/**
 * 虚拟广场 · 人群几何（纯函数，零随机、可复现）。
 *
 * 为什么人群要单独抽一层，而不是直接写在组件里：
 * 「一场讨论 = 一簇人」这件事有两套完全不同的约束 —— 一套是**语义**
 * （谁站在这里、站几个、缺口算不算人），一套是**几何**（怎么摆才不重叠、
 * 谁在前谁在后）。语义属于领域，几何也是纯计算；把它们放进组件会让
 * 这两件事都变得不可测。这里只输出数字，画什么由组件决定。
 *
 * ## 谁站在广场上（诚实性红线）
 *
 * 概念图里画的是黑压压的人群，还有「263 人在讨论」这种数字。**那些是示意。**
 * 产品说明写得很清楚：概念图中的具体数字属于示意，产品呈现时以实际数据为准；
 * 只有少量讨论时就以少量清晰人群呈现，不复制同一个问题填满画面。
 *
 * 而 `public/square-library.json` 的真实数据是：**每场讨论 3 位分身作答、
 * 1–3 个未被真人补上的缺口**。所以这里的人形只有两个来源，都有据可查：
 *
 *   · `persona` —— **实心人形 = 真实参与作答的分身**（每人一个）
 *   · `gap`     —— **空心人形 = 还缺的那个真人**（每个未补缺口一个）
 *
 * 缺口为什么算「人」：`Gap.needProfile` 的字面意思就是「满足某个前提、
 * 并且真实做过这件事的人」—— 缺口本来就是「缺席的一个人」，不是抽象概念。
 * 而设计系统里 **orange 是缺口专用色**，所以空心橙色人形与它天然对齐。
 *
 * 这两条之外，**没有第三种人形**。不按热度放大规模、不复制、不填充。
 *
 * ## 为什么人形不带街区色（2026-09-15 改，线上实测后回改）
 *
 * 第一版把「在场分身」染成所属街区的状态色，看着更热闹。上线后一数：
 * **21 个实心分身与 31 个空心缺口是同一个橙色** —— 因为六个街区里
 * `life`（生活）这一区的强调色本来就是 orange，而它是最大的一区。
 *
 * 于是「谁在场、谁缺席」这个产品的核心论点，在默认缩放下只剩
 * 「实心 / 空心」这一个线索，而小尺寸下那点线宽差根本看不出来。
 * 更要命的是设计系统明文写着「**orange 是缺口的专用色**」，把它给分身用
 * 属于挪用。
 *
 * 所以现在：在场分身一律中性剪影，**全广场唯一使用 orange 的人形是缺口**。
 * 街区的颜色仍然保留 —— 在浮标标题的小圆点和聚焦环上（那是「标签」，
 * 与人形不是一个视觉层级，不会和缺口抢语义）。
 */

import { hashUnit, stableHash, type TopicNode } from "./square-layout";

/** 人形的两种身份。见文件头注释：除此之外没有第三种。 */
export type FigureKind = "persona" | "gap";

export interface CrowdFigure {
  /** 稳定 key，由簇 id + 序号派生，供 React 用 */
  key: string;
  kind: FigureKind;
  /** 相对簇心的世界坐标（人形**脚底中点**） */
  dx: number;
  dy: number;
  /** 人形高度（世界像素，已含近大远小的纵深缩放） */
  height: number;
  /** 绘制顺序：数值越大越靠前，由调用方排序后先画小的 */
  depth: number;
}

export interface CrowdCluster {
  id: string;
  /** 簇心世界坐标（与布局层给的话题位置一致） */
  x: number;
  y: number;
  /** 人群外接半径（世界像素） */
  radius: number;
  /** 已按 depth 升序排好的人形 —— 直接顺序绘制即可得到正确的遮挡关系 */
  figures: CrowdFigure[];
  /** 真实分身数（= 实心人形数） */
  personaCount: number;
  /** 未补缺口数（= 空心人形数） */
  gapCount: number;
}

/**
 * 黄金角（≈137.5°）。
 *
 * 用它做螺旋排布是「向日葵种子」那套闭式解：第 i 个点的半径取 sqrt(i/N)，
 * 角度每次转黄金角，结果是**任意 N 都均匀不聚堆**，而且不需要跑任何
 * 松弛迭代 —— 对一个要在首屏同步算完 22 簇 × 约 5 人的函数来说，
 * 闭式解比迭代稳得多，也保证「同样的输入永远得到同一个广场」。
 */
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

/** 纵向压扁：广场是横向铺开的，人群也压成椭圆才像站在地面上而不是贴在墙上。 */
const CROWD_SQUEEZE = 0.82;

/**
 * 人群半径 / 布局层预留的半边长。
 *
 * 布局层的 `relaxOverlaps` 保证的是**方形**不重叠：两个大小 196 的簇中心
 * 至少相距 215px。如果人群半径取满 `size / 2 = 98`，两个圆之间只剩 19px 缝 ——
 * 广场上几乎没有可以按住拖动的空白了，而「在空白处拖动平移」是核心交互。
 *
 * 取 0.72 之后半径 70，簇间空档约 75px，既留出拖动空间，也让每个讨论
 * 像「广场上的一摊人」而不是铺满画面的地砖。这个值是**在 1440×900 下
 * 用截图逐轮调出来的**，改它必须重新看一遍广场，别凭手感改。
 */
const CROWD_RADIUS_RATIO = 0.72;

/**
 * 人群占簇半径的比例。
 *
 * 为什么不是 1.0：人形有高度，脚底摆在半径处、头顶还要往上长 ——
 * 取满半径会让最外圈的人把头顶伸到相邻簇里去。0.72 是实测能既紧凑
 * 又不越界的值（第一版取 0.84，截图里一簇人散成一圈点，看不出是「一伙人」）。
 */
const CROWD_USABLE = 0.72;

/**
 * 人形高度系数。
 *
 * 推导：N 个人形在半径 R_u 的圆里不重叠，最小中心距约为 `1.45 * R_u / √N`
 * （黄金角螺旋的经验值）；人形宽 ≈ 0.6 × 高，所以高取 `1.45 * R_u / √N`
 * 时正好「排得下、还留一点缝」。
 *
 * 第一版用的是 `R_u / √N * 0.95`（约等于这里的 0.65 倍），结果是
 * 一簇人散成零星的几个点 —— 数字没错，只是把「不重叠」当成了目标，
 * 而真正要的是「看起来像聚在一起的一伙人」。
 */
const FIG_HEIGHT_K = 1.45;

/** 人形高度的上下限（世界像素）。太小看不出是人，太大会把邻居挤出视野。 */
const FIG_MIN = 16;
const FIG_MAX = 40;

/**
 * 给一个话题节点算出它的人群。
 *
 * 输入只需要布局层已经算好的 `x / y / size` 和两个**真实计数**
 * （`personaCount` / `openGapCount`），不接触任何数据源 —— 这是它能被
 * 自检脚本直接调用的前提。
 */
export function crowdOf(node: TopicNode): CrowdCluster {
  const radius = Math.max((node.size / 2) * CROWD_RADIUS_RATIO, 1);
  const personaCount = Math.max(node.personaCount, 0);
  const gapCount = Math.max(node.openGapCount, 0);
  const total = personaCount + gapCount;

  if (total === 0) {
    // 一场还没有任何作答、也没有缺口的讨论 —— 画一圈空场地，不画人。
    // 这比「画几个人撑场面」诚实：广场上此刻确实没人站在这儿。
    return {
      id: node.id,
      x: node.x,
      y: node.y,
      radius,
      figures: [],
      personaCount: 0,
      gapCount: 0,
    };
  }

  const seed = stableHash(node.id);
  // 整体旋转角由 id 决定：否则 22 簇的螺旋朝向完全一致，摆在一起像阵列不像聚落。
  const spin = hashUnit(seed, 7) * Math.PI * 2;
  // 留出外圈余量：人形有高度，贴着外接圆摆会被裁掉。
  const usable = radius * CROWD_USABLE;

  const base = Math.min(
    FIG_MAX,
    Math.max(FIG_MIN, (usable * FIG_HEIGHT_K) / Math.sqrt(total)),
  );

  const figures: CrowdFigure[] = [];

  // 顺序即层次：**分身先占内圈，缺口排在外圈**。
  // 这既是几何上的自然结果（螺旋半径随序号增大），也是语义上的：
  // 缺口是「还没进来的人」，让他们站在人群外侧才对。
  for (let i = 0; i < total; i++) {
    const kind: FigureKind = i < personaCount ? "persona" : "gap";
    const t = (i + 0.5) / total;
    const r = usable * Math.sqrt(t);
    const a = spin + i * GOLDEN_ANGLE;

    // 抖动幅度随人均占位面积收缩：人少时抖一点显得自然，
    // 人多时再抖就会把刚算好的不重叠破坏掉。
    const jitter = ((hashUnit(seed, i + 11) - 0.5) * usable * 0.34) / Math.sqrt(total);

    const dx = Math.cos(a) * r + jitter;
    const dy = Math.sin(a) * r * CROWD_SQUEEZE + jitter * 0.5;

    // 近大远小：画面上越靠下（dy 越大）的人离观察者越近。
    // 只放大 16% —— 再夸张就变成透视摄影，不是「文字几何」该有的克制。
    const depth = 1 + (dy / usable) * 0.16;

    figures.push({
      key: node.id + "#" + i,
      kind,
      dx,
      dy,
      height: base * depth,
      depth: dy,
    });
  }

  // 先画远的，后画近的 —— 否则近处的人会被远处的人盖住，人群就没有纵深。
  figures.sort((a, b) => a.depth - b.depth);

  return {
    id: node.id,
    x: node.x,
    y: node.y,
    radius,
    figures,
    personaCount,
    gapCount,
  };
}

/** 批量：给整个广场算人群。顺序与输入一致，保证渲染顺序稳定。 */
export function crowdLayout(nodes: TopicNode[]): CrowdCluster[] {
  return nodes.map(crowdOf);
}

/**
 * 人群规模的一句话说明 —— 用在详情面板与无障碍标签里。
 *
 * 为什么单独一个函数：这个数字**必须**和画出来的人形数量一致。
 * 文案与图形各算各的，迟早会出现「写着 5 个人、画了 3 个」这种骗人的情况。
 */
export function crowdSummary(c: CrowdCluster): string {
  const parts: string[] = [];
  if (c.personaCount > 0) parts.push(c.personaCount + " 位分身在场");
  if (c.gapCount > 0) parts.push(c.gapCount + " 个缺口等真人");
  return parts.length > 0 ? parts.join(" · ") : "还没有人参与这场讨论";
}
