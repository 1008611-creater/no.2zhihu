/**
 * 虚拟广场的空间布局（纯函数，零随机、可复现）。
 *
 * 为什么必须确定性：评委要截屏、录视频、复现演示。如果每次刷新话题的位置
 * 都在变，就没法说「你打开这个链接看到的就是这个广场」。所以坐标一律由
 * **问题 id 的稳定哈希**算出，不用 Math.random，不用时间种子。
 *
 * 布局设计（对应老大给的规格）：
 *   · 中央是「最活跃」的那一场，卡片最大；
 *   · 其他话题按**主题分区**松散聚集（科技/职场/生活/情感…），
 *     每个分区有自己的方向角，话题在扇区内散开 —— 于是相关话题自然成街区；
 *   · 同区话题之间用低透明度曲线连接，形成「局部街区」而不是规整流程图；
 *   · 位置带轻微抖动（由 id 哈希决定），避免排成整齐的网格。
 *
 * 为什么不用 d3-force：力导向布局每次跑出来的结果依赖 tick 数与初始位置，
 * 很难保证跨版本稳定。这里用「扇区 + 哈希抖动」是闭式解，改代码也不会漂。
 */

export type ThemeKey = "tech" | "career" | "life" | "money" | "mind" | "society";

export interface ThemeSpec {
  key: ThemeKey;
  label: string;
  /** 分区中心的方向角（弧度） */
  angle: number;
  /** 分区中心离原点的距离 */
  radius: number;
  accent: "blue" | "violet" | "green" | "orange";
}

/**
 * 主题分区表。
 *
 * 角度刻意均匀铺开（6 个分区 → 每 60°），半径略有差异让广场不是正圆，
 * 看起来更像自然聚落而不是被摆好的表格。
 *
 * 半径为什么从 380–420 收到 300–350：实测「全景」视角曾缩到 27% ——
 * 卡片在屏幕上只剩几个点，那个「全景」等于没用。收紧半径后全景约 65%，
 * 既看得到街区分布，又还能认出标题。
 * 理论下限：22 张卡平均 170px 边长，40% 填充率下需要半径约 700 的圆盘，
 * 即直径 ~1500px —— 所以布局尺度就该在这个量级，而不是 4000+。
 */
export const THEMES: ThemeSpec[] = [
  { key: "tech", label: "科技", angle: Math.PI * 1.75, radius: 330, accent: "blue" },
  { key: "career", label: "职场", angle: Math.PI * 1.25, radius: 350, accent: "violet" },
  { key: "money", label: "钱", angle: Math.PI * 0.25, radius: 340, accent: "green" },
  { key: "life", label: "生活", angle: Math.PI * 0.75, radius: 320, accent: "orange" },
  { key: "mind", label: "情绪", angle: Math.PI * 0.5, radius: 300, accent: "violet" },
  { key: "society", label: "社会", angle: Math.PI * 1.0, radius: 310, accent: "blue" },
];

export const THEME_BY_KEY = new Map(THEMES.map((t) => [t.key, t]));

/** 主题分类关键词表。命中即归入该区，零模型、可解释。 */
const THEME_HINTS: Array<{ key: ThemeKey; re: RegExp }> = [
  // 顺序即优先级：越靠前越优先。先判具体领域，再判泛化的生活/社会。
  { key: "tech", re: /(独立开发|程序员|代码|算法|AI|人工智能|大模型|芯片|半导体|互联网|产品经理|技术|软件|开源|架构|服务器|数据)/ },
  { key: "career", re: /(转行|跳槽|裁员|优化|离职|辞职|加班|副业|同事|领导|上司|职场|面试|offer|薪资|工资|涨薪|晋升|考公|公务员|事业单位|考研|读博|上岸|学历|应届|实习|创业|合伙)/ },
  { key: "money", re: /(买房|房价|房贷|存款|理财|基金|股票|投资|借钱|借钱给|彩礼|买车|消费|省钱|月薪|年薪|收入|钱|债务|贷款|首付|资产)/ },
  { key: "mind", re: /(焦虑|抑郁|情绪|心理|自卑|孤独|内耗|压力|意义|自我|羞耻|失眠|心态|痛苦|崩溃|迷茫|emo|EMO)/ },
  { key: "life", re: /(孩子|父母|家人|婚姻|离婚|相亲|恋爱|分手|朋友|亲戚|健康|近视|保健品|养生|减肥|睡眠|搬家|学区|学校|教育|育儿|老了|养老|同住|咖啡店|创业开店)/ },
  { key: "society", re: /(城市|县城|一线|政策|社会|制度|公平|阶层|机会|时代|经济|就业|人口|房价|教育|医疗|老龄化)/ },
];

/** 主题分类：命中即返回，全部不命中归入「社会」—— 广场总得放得下。 */
export function themeOf(title: string): ThemeSpec {
  for (const h of THEME_HINTS) {
    if (h.re.test(title)) return THEME_BY_KEY.get(h.key) ?? THEMES[5];
  }
  return THEME_BY_KEY.get("society") ?? THEMES[5];
}

/** 稳定哈希（FNV-1a），只用于布局抖动与 id，不做安全用途。 */
export function stableHash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** 由哈希导出 [0,1) 的确定性伪随机数。 */
function rand01(seed: number, salt: number): number {
  const x = Math.imul(seed ^ Math.imul(salt + 1, 0x9e3779b9), 0x85ebca6b) >>> 0;
  return ((x >>> 8) & 0xffffff) / 0x1000000;
}

export interface TopicInput {
  id: string;
  title: string;
  /** 参与作答的分身数 */
  answerCount: number;
  /** 是否有互相回应 —— 有回应说明讨论更热 */
  hasReplies: boolean;
  /** 是否是我自己的讨论 */
  mine: boolean;
  /**
   * 是否还有**没被真人补上**的缺口。
   *
   * 为什么这是「等真人回答」的判据，而不是「作答数 ≤ 1」：
   * 这个产品的核心论点是「分身先答一遍，缺口交给真人」。一场讨论答了
   * 3 条但缺口仍在，它等的恰恰就是真人 —— 用作答数判会让它被判成
   * 「已经答完了」，与产品语义正好相反。
   * 实测：库里的 22 场全部有未补缺口（gap 无 filledBy），也就是说
   * 「等真人回答」在这个快照下等于全部 —— 那是**数据的真相**，不是 bug。
   */
  hasOpenGaps: boolean;
}

/**
 * 广场筛选（规格给的四个）。
 *
 * 为什么筛选定义在 domain 而不是组件里：它是**业务语义**
 * （「等真人回答」= 还没人答或只有一条），不是展示细节。
 * 定义在这里，画布与横向街区两种形态才能共用同一套判据 ——
 * 否则移动端和桌面端的「等真人回答」迟早会算出不同的集合。
 */
export type SquareScope = "all" | "live" | "waiting" | "mine";

export const SCOPE_LABELS: Array<{ key: SquareScope; label: string }> = [
  { key: "all", label: "全部" },
  { key: "live", label: "正在发生" },
  { key: "waiting", label: "等真人回答" },
  { key: "mine", label: "我的讨论" },
];

/** 某个话题是否落在当前筛选范围内。 */
export function matchesScope(t: TopicInput, scope: SquareScope): boolean {
  switch (scope) {
    case "live":
      // 「正在发生」= 分身之间已经互相接话，讨论还在推进。
      // 这个状态只在用户刚生成完、会话还活着的时候出现；
      // 静态库快照里全是已归档的讨论，所以这里通常是空的 —— 那是真实的。
      return t.hasReplies;
    case "waiting":
      // 「等真人回答」= 分身答完了，但缺口还没被真人补上。
      return t.hasOpenGaps;
    case "mine":
      return t.mine;
    default:
      return true;
  }
}

/**
 * 按筛选过滤话题。
 *
 * 为什么**不做**「筛完为空就回退到全部」：那会让筛选条显示「等真人回答」
 * 却在展示全部讨论 —— 界面在骗人。筛空是真实且有信息量的结果
 * （「现在没有人在等真人回答」），由调用方如实呈现空态，而不是悄悄兜底。
 */
export function filterByScope(topics: TopicInput[], scope: SquareScope): TopicInput[] {
  if (scope === "all") return topics;
  return topics.filter((t) => matchesScope(t, scope));
}

export interface TopicNode {
  id: string;
  title: string;
  x: number;
  y: number;
  /** 卡片边长（正方形容器），由热度决定 */
  size: number;
  /** 热度 0–1，用于视觉强度 */
  heat: number;
  theme: ThemeSpec;
  /** 2–3 个答主头像的 handle，用于卡片上展开 */
  avatarHandles: string[];
  avatarNames: string[];
  answerCount: number;
  hasReplies: boolean;
  mine: boolean;
  /** 一句回答预览（由调用方填） */
  preview?: string;
  /** 讨论状态文案 */
  statusLabel: string;
}

export interface ThemeCluster {
  theme: ThemeSpec;
  /** 该区的中心（用于画若隐若现的关系线与分区标签） */
  x: number;
  y: number;
  count: number;
}

export interface SquareLayout {
  nodes: TopicNode[];
  clusters: ThemeCluster[];
  /** 画布内容的包围盒，供「回到我的位置」与缩略地图使用 */
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
  /** 主题之间的连接线（若隐若现的「街区」关系） */
  links: Array<{ from: string; to: string; theme: ThemeKey; strength: number }>;
}

/** 卡片尺寸区间：中央最大 320，外围最小 132。差异刻意克制。 */
const SIZE_MAX = 320;
const SIZE_MIN = 132;
/**
 * 纵向压缩系数。
 *
 * 为什么要把广场压扁：视口是 1440×900（16:10），而径向布局是正圆。
 * 正圆布局的包围盒高度等于宽度，fit 时**高度是瓶颈** ——
 * 实测「全景」只能到 32%，卡片缩成小点。压扁成椭圆后同样内容的高度
 * 只需 68%，全景就能到 ~65%，标题仍可辨认。
 * 这也更符合「广场」的隐喻：广场是横向铺开的，不是一座塔。
 */
const Y_SQUEEZE = 0.68;
/**
 * 卡片间最小间隙系数（相对于两张卡半宽之和）。
 * 1.10 = 留 10% 的缝。1.0 会让卡片边缘严丝合缝，看起来像拼图不像散落。
 */
const MIN_GAP = 1.1;
/** 中央话题的「最活跃」判定：作答人数权重 + 有无回应 + 是否我自己的。 */
function heatOf(t: TopicInput, maxAnswers: number): number {
  const byAnswers = maxAnswers > 0 ? Math.min(t.answerCount / maxAnswers, 1) : 0;
  const reply = t.hasReplies ? 0.22 : 0;
  const mine = t.mine ? 0.18 : 0;
  return Math.min(byAnswers * 0.66 + reply + mine, 1);
}

/**
 * 主入口：把话题排布到无限画布上。
 *
 * @param topics 话题列表；顺序会影响同区内的排布次序，所以调用方应传稳定顺序
 * @param avatarLookup handle → 显示名。用于卡片上的头像展开
 */
export function layoutSquare(
  topics: TopicInput[],
  avatarLookup: (handle: string) => string | undefined = () => undefined,
  avatarSource: (id: string) => string[] = () => [],
): SquareLayout {
  if (topics.length === 0) {
    return {
      nodes: [],
      clusters: [],
      bounds: { minX: -600, minY: -400, maxX: 600, maxY: 400 },
      links: [],
    };
  }

  const maxAnswers = Math.max(...topics.map((t) => t.answerCount), 1);

  // ① 按主题分区归组。
  const groups = new Map<ThemeKey, TopicInput[]>();
  for (const t of topics) {
    const th = themeOf(t.title);
    const arr = groups.get(th.key) ?? [];
    arr.push(t);
    groups.set(th.key, arr);
  }

  // ② 找出全场最活跃的一场 —— 它占据中央。
  const ranked = [...topics].sort((a, b) => {
    const d = heatOf(b, maxAnswers) - heatOf(a, maxAnswers);
    if (d !== 0) return d;
    return a.id < b.id ? -1 : 1; // 同热时按 id 定序，保证可复现
  });
  const centerTopic = ranked[0];

  const nodes: TopicNode[] = [];
  const clusters: ThemeCluster[] = [];

  // ③ 中央话题。
  if (centerTopic) {
    const th = themeOf(centerTopic.title);
    const handles = avatarSource(centerTopic.id).slice(0, 3);
    nodes.push({
      id: centerTopic.id,
      title: centerTopic.title,
      x: 0,
      y: 0,
      size: SIZE_MAX,
      heat: 1,
      theme: th,
      avatarHandles: handles,
      avatarNames: handles.map((h) => avatarLookup(h) ?? h),
      answerCount: centerTopic.answerCount,
      hasReplies: centerTopic.hasReplies,
      mine: centerTopic.mine,
      statusLabel: statusLabelOf(centerTopic),
    });
  }

  // ④ 其余话题按主题扇区分环摆放。
  //
  // 为什么从「单环均分」改成「分环」：单环写法里，一个区 6 张卡挤在
  // 99° 的弧上、半径只有 238px —— 弧长 411px 却要放下 6 张 ~180px 的卡，
  // 实测截图里科技区的卡片糊成一坨。几何上要么把半径撑到 ~1100px
  // （画布过大，全景缩放后更读不了字），要么分环。
  // 分环是闭式解：每环最多 3 张，环间距 = 平均卡宽 ×1.34，必然不重叠，
  // 而且比大半径方案紧凑得多。
  for (const theme of THEMES) {
    const list = groups.get(theme.key) ?? [];
    if (list.length === 0) continue;

    // 分区中心：方向角 + 半径。
    const cx = Math.cos(theme.angle) * theme.radius;
    const cy = Math.sin(theme.angle) * theme.radius;

    // 区内的稳定排序：热度降序、id 升序，保证同输入同结果。
    const ordered = [...list].sort((a, b) => {
      const d = heatOf(b, maxAnswers) - heatOf(a, maxAnswers);
      if (d !== 0) return d;
      return a.id < b.id ? -1 : 1;
    });

    // 环的容量与间距都按该区实际卡片尺寸算 —— 用全局常量会让
    // 「一个大区 + 一堆小卡」这种组合仍然重叠。
    const avgSize =
      ordered.reduce((s, t) => s + (SIZE_MIN + (SIZE_MAX - SIZE_MIN) * heatOf(t, maxAnswers) * 0.52), 0) /
      ordered.length;
    const PER_RING = 3;
    // 环间距：略大于平均卡宽即可（1.16 倍留出 16% 的缝）。
    // 用 1.34 时画布直径被推到 4000+，「全景」缩到 27% 就什么都看不清了。
    const RING_GAP = avgSize * 1.16;

    // 扇区张角随卡片数变宽，但不超过 100°：再宽就会伸进邻居的地盘，
    // 街区就糊成一片了。
    const spread = Math.min(Math.PI * 0.56, 0.72 + 0.16 * Math.min(ordered.length, PER_RING));

    ordered.forEach((t, i) => {
      if (t.id === centerTopic?.id) return; // 中央那场不重复放
      const seed = stableHash(t.id);

      const ring = Math.floor(i / PER_RING);
      const k = i % PER_RING;
      const inRing = Math.min(PER_RING, ordered.length - ring * PER_RING);

      // 同一环内均分；只有一张时正对扇区中心。
      const step = inRing > 1 ? spread / (inRing - 1) : 0;
      const base = inRing > 1 ? theme.angle - spread / 2 + step * k : theme.angle;
      // 抖动幅度压到半个分位宽的 18%：再大就会把刚算好的「不重叠」破坏掉。
      const jitter = step > 0 ? (rand01(seed, 1) - 0.5) * step * 0.36 : 0;
      const a = base + jitter;

      // 环半径：从分区基准半径起步，每多一环往外推一个 RING_GAP。
      // 再叠一点哈希抖动（±6%）让环看起来是自然聚落而不是同心圆。
      const rJitter = (rand01(seed, 2) - 0.5) * RING_GAP * 0.12;
      const r = theme.radius + ring * RING_GAP + rJitter;

      const heat = heatOf(t, maxAnswers);
      const size = SIZE_MIN + (SIZE_MAX - SIZE_MIN) * heat * 0.52;
      const handles = avatarSource(t.id).slice(0, 3);

      nodes.push({
        id: t.id,
        title: t.title,
        // 纵向压缩：把正圆扇区压成横椭圆（见 Y_SQUEEZE 注释）。
        x: cx + Math.cos(a) * r,
        y: (cy + Math.sin(a) * r) * Y_SQUEEZE,
        size,
        heat,
        theme,
        avatarHandles: handles,
        avatarNames: handles.map((h) => avatarLookup(h) ?? h),
        answerCount: t.answerCount,
        hasReplies: t.hasReplies,
        mine: t.mine,
        statusLabel: statusLabelOf(t),
      });
    });

    // 分区标签放在「中央卡边缘」与「第一环」之间的空档里 ——
    // 放在扇区几何中心会正好被卡片压住（实测过）。
    clusters.push({
      theme,
      x: cx * 0.56,
      y: cy * 0.56 * Y_SQUEEZE,
      count: ordered.length,
    });
  }

  // ⑤ 确定性松弛：消除一切卡片重叠。
  //
  // 为什么必须有这一步：前面的「分环 + 扇区均分」是几何近似 ——
  // 卡片尺寸随热度变化、扇区张角有上限、再叠一点哈希抖动，
  // 边缘情形必然出现交叠（实测最差 15%，两张卡糊在一起）。
  // 与其反复调参去逼近，不如把「不重叠」做成一个显式的收敛过程。
  //
  // 确定性怎么保证：输入数组顺序稳定（热度降序 + id 升序），
  // 推挤方向只依赖坐标差值，没有随机数、没有时间种子 ——
  // 同样的输入永远得到同样的输出，评委可以复现同一个广场。
  //
  // 为什么沿「重叠更小的那个轴」推开：位移最小，布局形态变化最小，
  // 不会因为一次微调把整个街区推散。
  relaxOverlaps(nodes, clusters);

  // ⑥ 关系线：同一分区内的话题两两相连（限制条数），强度随热度。
  // 为什么限制条数：全连接会变成一张密网，读起来像流程图，
  // 而规格要求「若隐若现的关系线，形成局部街区」——稀疏才有街区的感觉。
  const links: SquareLayout["links"] = [];
  for (const theme of THEMES) {
    const inTheme = nodes.filter((n) => n.theme.key === theme.key);
    if (inTheme.length < 2) continue;
    for (let i = 0; i < inTheme.length; i++) {
      // 只连相邻的 2 个，形成链状街区而非网状。
      for (let k = 1; k <= 2; k++) {
        const j = i + k;
        if (j >= inTheme.length) break;
        links.push({
          from: inTheme[i].id,
          to: inTheme[j].id,
          theme: theme.key,
          strength: Math.min(1, (inTheme[i].heat + inTheme[j].heat) / 2 + 0.2),
        });
      }
    }
    // 分区中心连一次第一个节点，让「街区」有个可见的归属锚点。
    if (inTheme.length > 0) {
      links.push({ from: "@" + theme.key, to: inTheme[0].id, theme: theme.key, strength: 0.5 });
    }
  }

  // ⑦ 包围盒（含卡片半尺寸，供缩略地图与「回到我的位置」用）。
  // 分区标签也要算进去 —— 松弛可能把它推到卡片外侧，
  // 不纳入包围盒的话「全景」时标签会被切在视口外。
  const xs = [
    ...nodes.flatMap((n) => [n.x - n.size / 2, n.x + n.size / 2]),
    ...clusters.flatMap((c) => [c.x - 62, c.x + 62]),
  ];
  const ys = [
    ...nodes.flatMap((n) => [n.y - n.size / 2, n.y + n.size / 2]),
    ...clusters.flatMap((c) => [c.y - 20, c.y + 20]),
  ];
  // pad 只用来让最外圈内容不贴视口边；给太大会直接压低「全景」的可用缩放。
  const pad = 150;
  const bounds = {
    minX: (xs.length ? Math.min(...xs) : 0) - pad,
    minY: (ys.length ? Math.min(...ys) : 0) - pad,
    maxX: (xs.length ? Math.max(...xs) : 0) + pad,
    maxY: (ys.length ? Math.max(...ys) : 0) + pad,
  };

  return { nodes, clusters, bounds, links };
}

/**
 * 把交叠的卡片推开，直到任意两张都不再重叠（原地修改 nodes）。
 *
 * 四个设计决定：
 *   ① **钉住中央卡**（nodes[0]）：它是广场的锚点，「最热那场在正中央」
 *      是规格要求；动它会让整个布局漂移，也让「回到我的位置」失去基准。
 *   ② **只推标签，不推卡片**：标签和卡片撞上时，被推开的是**标签**。
 *      第一版写反了（推卡片），结果中央卡被标签挤出原点 ——
 *      实测 world transform 的 y 偏移从 413 变成 166，中央卡歪在一边。
 *      标签是「说明文字」，让它给卡片让路才是对的层级。
 *   ③ **有迭代上限**：万一遇到极密集输入，宁可留一点残余交叠，
 *      也不能让循环跑不完（纯函数里死循环比轻微重叠严重得多）。
 *   ④ **零随机**：推挤方向只依赖坐标差值，同输入必然同输出。
 */
function relaxOverlaps(nodes: TopicNode[], clusters: ThemeCluster[]): void {
  const MAX_ITER = 80;
  const LABEL_R = 62; // 分区标签的「禁区」半径，够放下「科技 12」这种最长标签

  for (let iter = 0; iter < MAX_ITER; iter++) {
    let moved = 0;

    // 卡片两两：方形卡片，两个轴都重叠才算撞上。
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i];
        const b = nodes[j];
        const minDX = ((a.size + b.size) / 2) * MIN_GAP;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const ox = minDX - Math.abs(dx);
        const oy = minDX - Math.abs(dy);
        if (ox <= 0 || oy <= 0) continue;

        // 沿重叠更小的轴推开：位移最小，形态变化最小。
        // +0.5 是「至少推开半像素」，避免浮点误差让循环收敛不了。
        if (ox < oy) {
          const push = (ox / 2 + 0.5) * (dx >= 0 ? 1 : -1);
          // 钉住中央卡：只推另一方，推力加倍，保持总位移量级不变。
          if (i === 0) b.x += push * 2;
          else {
            b.x += push;
            a.x -= push;
          }
        } else {
          const push = (oy / 2 + 0.5) * (dy >= 0 ? 1 : -1);
          if (i === 0) b.y += push * 2;
          else {
            b.y += push;
            a.y -= push;
          }
        }
        moved++;
      }
    }

    // 标签 vs 卡片：把**标签**从卡片里挪出去（见设计决定 ②）。
    for (const c of clusters) {
      for (const n of nodes) {
        const minD = n.size / 2 + LABEL_R;
        const dx = c.x - n.x;
        const dy = c.y - n.y;
        const d = Math.hypot(dx, dy);
        if (d >= minD) continue;
        // 距离为 0 时没有方向可言，用一个稳定方向兜底（朝外），
        // 不用随机数 —— 否则布局就不可复现了。
        const ux = d > 0.01 ? dx / d : Math.cos(n.theme.angle);
        const uy = d > 0.01 ? dy / d : Math.sin(n.theme.angle);
        const push = minD - d;
        c.x += ux * push;
        c.y += uy * push;
        moved++;
      }
    }

    if (moved === 0) break;
  }
}

function statusLabelOf(t: TopicInput): string {
  if (t.mine) return t.hasReplies ? "我的讨论 · 已互相回应" : "我的讨论";
  if (t.hasReplies) return "讨论正热";
  return t.answerCount > 1 ? t.answerCount + " 位答主已作答" : "等真人回答";
}

/* ------------------------------ 视图变换工具 ------------------------------ */

export interface Viewport {
  /** 画布平移（屏幕像素） */
  x: number;
  y: number;
  /** 缩放倍数 */
  scale: number;
}

export const MIN_SCALE = 0.18;
export const MAX_SCALE = 2.2;

export function clampScale(s: number): number {
  return Math.min(Math.max(s, MIN_SCALE), MAX_SCALE);
}

/** 屏幕坐标 → 画布坐标。 */
export function toWorld(px: number, py: number, v: Viewport): { x: number; y: number } {
  return { x: (px - v.x) / v.scale, y: (py - v.y) / v.scale };
}

/**
 * 以某个屏幕点为锚点缩放 —— 滚轮缩放时鼠标下的内容不动。
 *
 * 这是「无限画布」体感的关键：如果只改 scale 而不修正平移，
 * 内容会往左上角跑，用户会觉得缩放「不跟手」。
 */
export function zoomAt(v: Viewport, px: number, py: number, factor: number): Viewport {
  const next = clampScale(v.scale * factor);
  if (next === v.scale) return v;
  const ratio = next / v.scale;
  return {
    scale: next,
    x: px - (px - v.x) * ratio,
    y: py - (py - v.y) * ratio,
  };
}

/**
 * 让某个话题居中并放大到目标倍数的视口。
 *
 * 为什么有 upper clamp（1.22）：卡片最大 320px，若让 320 的卡占满视口短边的
 * 62%，scale 会到 1.7 左右 —— 那张卡变成 550px 的巨物，四周邻居全被推出屏幕，
 * 用户失去「我在广场哪个位置」的空间感。1.22 让卡片在屏幕上约 390px，
 * 既明显放大又留得住上下文。
 *
 * @param vw/vh 视口宽高（CSS 像素）
 * @param padding 目标卡片四周留白
 */
export function focusViewport(
  node: { x: number; y: number; size: number },
  vw: number,
  vh: number,
  padding = 0.42,
): Viewport {
  const target = Math.min(vw, vh) * (1 - padding);
  const scale = clampScale(Math.min(target / Math.max(node.size, 1), 1.22));
  return {
    scale,
    x: vw / 2 - node.x * scale,
    y: vh / 2 - node.y * scale,
  };
}

/**
 * 广场的「家」视角 —— 首屏与关闭详情后都回到这里。
 *
 * 为什么不直接 fitViewport（把所有内容装进视口）：
 * 22 场讨论、6 个街区铺开后包围盒约 2000px 宽，1440 视口下 fit 只能到
 * **40%** —— 实测截图里所有标题都糊成 8px 的灰线，一个字读不出来。
 * 那不是「广场」，是一张看不懂的地图。
 *
 * 真实广场的体感是「你站在某处，看得清身边几摊，远处模糊但知道有」，
 * 所以家视角 = 对准最热的那一场 + 一个可读的缩放（约 0.9），
 * 让用户一眼能读中央话题，同时用余光看到周围街区的存在。
 * 想看全貌有「全景」按钮（它才是 fitViewport），
 * 想找自己的那场有「回到我的位置」。
 */
export function homeViewport(
  layout: SquareLayout,
  vw: number,
  vh: number,
): Viewport {
  const home = layout.nodes.find((n) => n.mine) ?? layout.nodes[0];
  if (!home) return fitViewport(layout.bounds, vw, vh);
  // 0.88：中央卡在 900 高视口上约 280px，标题 20px×0.88 ≈ 17.6px 清晰可读，
  // 同时四周还能露出 2–3 个邻居。
  const scale = clampScale(0.88);
  return {
    scale,
    x: vw / 2 - home.x * scale,
    y: vh / 2 - home.y * scale,
  };
}

/** 把所有内容装进视口（「回到我的位置」用）。 */
export function fitViewport(
  bounds: SquareLayout["bounds"],
  vw: number,
  vh: number,
): Viewport {
  const w = Math.max(bounds.maxX - bounds.minX, 1);
  const h = Math.max(bounds.maxY - bounds.minY, 1);
  const scale = clampScale(Math.min(vw / w, vh / h) * 0.92);
  const cx = (bounds.minX + bounds.maxX) / 2;
  const cy = (bounds.minY + bounds.maxY) / 2;
  return { scale, x: vw / 2 - cx * scale, y: vh / 2 - cy * scale };
}

/** 把中心放到我自己的讨论上；没有自己的讨论时回落到全场最热的一场。 */
export function myLocationNode(layout: SquareLayout): TopicNode | undefined {
  return layout.nodes.find((n) => n.mine) ?? layout.nodes[0];
}
