/**
 * 看山的状态表。
 *
 * 参考 grok-icon-study 的做法：每个状态配一组「眼神目标 + 停留时长区间」，
 * 由计时器在区间内随机切换，角色就自然了，而不是靠一条固定关键帧动画。
 *
 * 这里的状态是按「二号知乎」的产品流程命名的，看山在流程里担任主持人。
 */

export type KanshanState =
  | "idle"
  | "greeting"
  | "routing"
  | "searching"
  | "thinking"
  | "answering"
  | "gap"
  | "inviting"
  | "celebrate"
  | "sleepy";

export interface EyeTarget {
  /** 瞳孔偏移，-1 ~ 1 */
  x: number;
  y: number;
  /** 眼睑闭合度 0=睁 1=闭 */
  lid: number;
  /** 眼睛缩放（惊讶时放大） */
  scale: number;
}

export const EYE_PLAYLISTS: Record<KanshanState, EyeTarget[]> = {
  idle: [
    { x: 0, y: 0, lid: 0, scale: 1 },
    { x: 0.34, y: 0.06, lid: 0, scale: 1 },
    { x: -0.3, y: 0.1, lid: 0, scale: 1 },
    { x: 0, y: 0, lid: 1, scale: 1 },
  ],
  greeting: [
    { x: 0, y: 0.16, lid: 0, scale: 1.06 },
    { x: 0.2, y: 0, lid: 0, scale: 1 },
    { x: -0.2, y: 0, lid: 0, scale: 1 },
    { x: 0, y: 0, lid: 1, scale: 1 },
  ],
  routing: [
    { x: -0.44, y: -0.06, lid: 0, scale: 1 },
    { x: 0.44, y: -0.06, lid: 0, scale: 1 },
    { x: 0, y: -0.2, lid: 0, scale: 0.98 },
  ],
  searching: [
    { x: 0.5, y: 0.12, lid: 0, scale: 1 },
    { x: -0.5, y: 0.12, lid: 0, scale: 1 },
    { x: 0.24, y: -0.16, lid: 0, scale: 1.04 },
  ],
  thinking: [
    { x: 0.22, y: -0.3, lid: 0, scale: 0.94 },
    { x: -0.2, y: -0.28, lid: 0.16, scale: 0.94 },
    { x: 0.1, y: -0.32, lid: 0, scale: 0.92 },
  ],
  answering: [
    { x: 0, y: 0.06, lid: 0.1, scale: 1 },
    { x: 0.16, y: 0, lid: 0, scale: 1 },
    { x: -0.16, y: 0, lid: 0.06, scale: 1 },
  ],
  gap: [
    { x: 0, y: 0, lid: 0, scale: 1.32 },
    { x: 0.1, y: -0.1, lid: 0, scale: 1.22 },
  ],
  inviting: [
    { x: 0, y: 0.18, lid: 0.05, scale: 1.12 },
    { x: 0.26, y: 0.06, lid: 0, scale: 1.04 },
  ],
  celebrate: [
    { x: 0, y: -0.12, lid: 0.3, scale: 1.1 },
    { x: 0.3, y: 0, lid: 0.34, scale: 1.06 },
    { x: -0.3, y: 0, lid: 0.34, scale: 1.06 },
  ],
  sleepy: [
    { x: 0, y: 0.14, lid: 0.82, scale: 1 },
    { x: 0.12, y: 0.14, lid: 0.88, scale: 1 },
  ],
};

/** 每个状态的停留时长（毫秒），参考实现同样用区间随机。 */
export const HOLD_MS: Record<KanshanState, [number, number]> = {
  idle: [2200, 4200],
  greeting: [900, 1500],
  routing: [520, 900],
  searching: [620, 1000],
  thinking: [1400, 2400],
  answering: [1500, 2600],
  gap: [1600, 2400],
  inviting: [1300, 2100],
  celebrate: [700, 1300],
  sleepy: [3600, 6200],
};

/** 头部姿态与耳朵，按状态给不同目标值。 */
export interface Pose {
  /** 头部旋转（度） */
  tilt: number;
  /** 头部上下浮动（px） */
  bob: number;
  /** 耳朵旋转（度） */
  ear: number;
  /** 身体缩放呼吸感 */
  breathe: number;
  /** 是否摆动尾巴 */
  tail: boolean;
}

export const POSE_BY_STATE: Record<KanshanState, Pose> = {
  idle: { tilt: 0, bob: 0, ear: 0, breathe: 1, tail: false },
  greeting: { tilt: -7, bob: -4, ear: -13, breathe: 1.02, tail: true },
  routing: { tilt: 0, bob: -2, ear: 4, breathe: 1.01, tail: false },
  searching: { tilt: 9, bob: -3, ear: 9, breathe: 1.01, tail: true },
  thinking: { tilt: -9, bob: -1, ear: -6, breathe: 1, tail: false },
  answering: { tilt: 3, bob: -2, ear: 2, breathe: 1.015, tail: false },
  gap: { tilt: 0, bob: -9, ear: 20, breathe: 1.05, tail: true },
  inviting: { tilt: 7, bob: -3, ear: -9, breathe: 1.02, tail: true },
  celebrate: { tilt: 0, bob: -11, ear: 16, breathe: 1.07, tail: true },
  sleepy: { tilt: -11, bob: 4, ear: -15, breathe: 0.985, tail: false },
};

/**
 * 由流程步数推导看山状态 —— 全站唯一的状态源。
 *
 * 为什么要有这个函数：首屏角色与流程舞台曾经各自算状态（一个看 running/mirror，
 * 一个看 step），同一个页面上会出现两个看山动作不一致的情况。收敛到一个纯函数后，
 * 两处渲染必然同步，也更容易测试。
 *
 * @param step -1 未开始；0..length-1 流程中；>= length 已完成
 */
export function flowStateAt(step: number): KanshanState {
  if (step < 0) return "idle";
  if (step >= FLOW_STATES.length) return "celebrate";
  return FLOW_STATES[step].key;
}

/** 产品流程里每一步对应的看山状态与文案。 */
export const FLOW_STATES: Array<{ key: KanshanState; label: string; caption: string }> = [
  { key: "greeting", label: "接入问题", caption: "看山先确认你问的是什么" },
  { key: "routing", label: "Human Router", caption: "正在挑选该由哪些分身来答" },
  { key: "searching", label: "取真实证据", caption: "在知乎检索公开回答" },
  { key: "thinking", label: "交叉比对", caption: "检查哪些地方证据不足" },
  { key: "answering", label: "生成多视角", caption: "每个分身按自己的文风作答" },
  { key: "gap", label: "缺口识别", caption: "这一段只有真人能答" },
  { key: "inviting", label: "邀请真人", caption: "按公开回答匹配到具体的人" },
  { key: "celebrate", label: "更新 Mesh", caption: "补充完成，关系图长出新的边" },
];
