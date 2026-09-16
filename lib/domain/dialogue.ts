/**
 * 虚拟广场 · 人群之间的小动作与招呼（纯函数，零随机、可复现）。
 *
 * ## 这一层只做「关系动作」，不产出台词
 *
 * owner 要的是「能自主运动、对话、打招呼、有小动作、挠头之类的、跟真人一样」。
 * 但**编造人物台词会违反本项目的诚实性铁律** —— 半佛仙人没说过的话，
 * 不能由我们替他写在广场上。
 *
 * 所以这里的分工是：
 *   · **动作**（谁转向谁、谁冲谁挥手、谁挠头）—— 由本模块生成，纯几何
 *   · **文字**（真名 / `lens` 一句话）—— 全部取自库里已有的字段，不新增一个字
 *
 * 合起来读到的效果就是「他们在聊」，而广场上没有一个字是我们编的。
 *
 * ## 为什么动作要「有对象」而不是各动各的
 *
 * 上一版每个人只是自己轻微上下起伏（呼吸）。那读起来是「一排东西在动」，
 * 不是「一群人在说话」。差别就在**有没有指向**：
 * 一个人转头看另一个人，这一下就让人相信他俩认识。
 */

import { stableHash } from "./square-layout";

/** 小动作。全部是「姿态变化」，不是插画。 */
export type Gesture =
  | "breeze"    // 只是被风吹动一下（绝大多数时刻，保持安静）
  | "turn"      // 转头看向某个人
  | "wave"      // 抬手招呼
  | "nod"       // 点头
  | "lean-in"   // 凑近一点（在认真听）
  | "scratch";  // 挠头（想不通 / 尴尬）

export interface Interact {
  /** 主体（人形的稳定 key） */
  from: string;
  /** 对象：另一个人的 key；null = 面向话题中心那件发光的物件 */
  to: string | null;
  gesture: Gesture;
  /** 相位 0..1 —— 决定这一下发生在循环的第几成，让全场错开 */
  phase: number;
  /** 一轮循环的时长（秒）。不同动作快慢不同，避免全场同频 */
  period: number;
}

/**
 * 动作各占多少比例。
 *
 * **breeze 占 54%** 是关键：如果每个人都在挥手、点头，
 * 那不是人群，是机器人展。真实人群里绝大多数人只是站着，
 * 少数几个人在说话 —— 这个比例就是「安静的大多数 + 几个在聊的」。
 *
 * ⚠️ 54% 不是拍的：第一版给 62%，自检算出实际静立 **76%**
 * （权重分布不均 + 只给 3–5 人分配，小样本波动大），
 * 报「太死，看不出有人在聊」。按数据调到 54%，实际落在约 70%。
 * **不要去放宽自检的上限来让它变绿** —— 上限是按「像不像人群」定的，
 * 该改的是这里的权重。
 */
const GESTURE_TABLE: Array<{ g: Gesture; weight: number; period: number }> = [
  { g: "breeze", weight: 54, period: 5.2 },
  { g: "turn", weight: 18, period: 6.4 },
  { g: "nod", weight: 10, period: 4.8 },
  { g: "lean-in", weight: 8, period: 6.0 },
  { g: "scratch", weight: 6, period: 7.6 },
  { g: "wave", weight: 4, period: 5.6 },
];

const TOTAL_WEIGHT = GESTURE_TABLE.reduce((n, r) => n + r.weight, 0);

/**
 * 给一个话题里的人形分配动作。
 *
 * @param clusterId 话题 id（做哈希种子）
 * @param figureKeys 该簇全部人形的稳定 key（必须是 `crowd.ts` 给的那些）
 *
 * 三条设计约束：
 *   ① **只有 persona 参与**（缺口的人还没来，不能让他有动作 —— 那等于
 *      假装他已经站在那儿了）。调用方传进来的 keys 必须已经过滤过。
 *   ② **动作必须指向簇内的另一个人或中心物件**，不指向场外 ——
 *      指向场外的动作读起来像「发呆」。
 *   ③ 同一 key 永远得到同一个动作（可复现，与全站硬约束一致）。
 */
export function interactionsOf(clusterId: string, figureKeys: string[]): Interact[] {
  if (figureKeys.length === 0) return [];
  const seed = stableHash(clusterId);

  return figureKeys.map((key, i) => {
    const h = (seed ^ stableHash(key)) >>> 0;

    // 按权重挑动作
    let pick = (h % TOTAL_WEIGHT) / TOTAL_WEIGHT;
    let chosen = GESTURE_TABLE[0];
    for (const row of GESTURE_TABLE) {
      const share = row.weight / TOTAL_WEIGHT;
      if (pick < share) {
        chosen = row;
        break;
      }
      pick -= share;
    }

    // 对象：优先指向簇里的另一个人（不指自己）。
    // 只有一个人时只能面向中心的物件 —— 一个人朝空气转头会很怪。
    let to: string | null = null;
    if (chosen.g !== "breeze" && chosen.g !== "scratch") {
      const others = figureKeys.filter((k) => k !== key);
      to = others.length > 0 ? others[((h >>> 5) % others.length)] : null;
    }

    // 相位：由 key 派生，让全场几百个人的动作错开。
    const phase = ((h >>> 11) % 1000) / 1000;

    return { from: key, to, gesture: chosen.g, phase, period: chosen.period };
  });
}

/** 动作 → 一句话说明（无障碍标签与自检用）。 */
export const GESTURE_LABELS: Record<Gesture, string> = {
  breeze: "静立",
  turn: "转头看向同伴",
  wave: "向同伴招呼",
  nod: "点头",
  "lean-in": "凑近听",
  scratch: "挠头",
};

/**
 * 看山（主持人）此刻该看哪一簇。
 *
 * 为什么单独一个函数：这是**唯一一个由时间驱动的选择**，其余全是几何。
 * 把它抽出来是为了让「看山在看谁」这件事可以被自检直接调用验证，
 * 而不是埋在组件的 effect 里。
 *
 * @param ids 广场上全部话题 id（顺序即布局顺序，稳定）
 * @param t   已流逝的秒数
 * @param every 每隔几秒换一次视线
 */
export function kanshanGazeAt(ids: string[], t: number, every = 7): string | null {
  if (ids.length === 0) return null;
  const i = Math.floor(t / every) % ids.length;
  return ids[i];
}
