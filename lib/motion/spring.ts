/**
 * 动效公共工具。
 *
 * 为什么这么小：看山的全部动效都交给 Motion（useSpring / useTransform /
 * useAnimationFrame）驱动，手写弹簧积分器已不再需要。这里只保留 UI 侧
 * 真正复用的纯函数，避免留一堆没人调用的死代码。
 *
 * 关于 grok-icon-study 的审计结论见 docs/character-engine.md：
 * 该项目的动效由三部分组成 —— ① 固定步长（1/120）的半隐式欧拉弹簧积分器；
 * ② 状态 → 眼神播放列表的状态表，每个状态带停留时长区间；
 * ③ 路径扁平化后做顶点插值。
 * 本项目采用了 ②（状态表驱动，见 components/kanshan/states.ts），
 * ① 与 ③ 由 Motion 与 SVG 路径插值替代。几何与配色全部原创。
 */

/** 把 n 夹到 [min, max]。 */
export const clamp = (n: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, n));
