/**
 * 看山的状态表 —— 全站唯一的状态源。
 *
 * 素材说明：官方动态包只提供 6 段成品循环（待机 / 打招呼 / 晃悠 / 电脑 / 瞌睡 / 运球），
 * 所以这里做的是「产品状态 → 官方动作」的映射，而不是自己重画关键帧。
 * 每个产品状态都能落到一段真实存在的官方动画上，映射关系必须显式写在这里，
 * 不允许在组件里临时拼。
 *
 * 素材落地在 public/kanshan/：
 *   anim/*.gif  动态（成品循环，透明底）
 *   still/*.png 静态首帧（prefers-reduced-motion 兜底）
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

export interface KanshanAsset {
  /** 动态素材地址（透明底 GIF，官方原始文件，作为最终降级） */
  anim: string;
  /**
   * 动态素材的 WebP 版本（同帧率同尺寸，仅换容器）。
   *
   * 为什么两副并存：官方 GIF 单段接近 1 MB，6 段合计 5.56 MB，
   * 首屏 preload 一段就等于让评委多等一次。WebP 体积约为原文件的 24%，
   * 且 2026 年主流浏览器全部支持。但「不使用未授权素材」要求官方原始文件
   * 不得删改，所以 GIF 保留为 <picture> 里的兜底源，而不是被替换掉。
   */
  animWebp: string;
  /** 静态首帧地址（PNG，reduced-motion 用） */
  still: string;
  /** 官方动作名，用于无障碍描述 */
  label: string;
}

/**
 * 状态 → 官方动作映射。
 *
 * 选型理由：
 *   - 「电脑」用于一切「正在处理」的时段（检索 / 思考 / 作答），
 *     因为这三步在用户眼里是同一件事：看山在替你看材料。
 *   - 「晃悠」用于等待与转折（挑人 / 发现缺口），表达「在场上踱步」。
 *   - 「打招呼」用于开场与邀请，都是「面向某个人」的动作。
 *   - 「运球」只在闭环完成时出现 —— 全站最稀缺的庆祝动作。
 */
export const KANSHAN_ASSET_BY_STATE: Record<KanshanState, KanshanAsset> = {
  idle:      { anim: "/kanshan/anim/idle.gif",     animWebp: "/kanshan/webp/idle.webp",     still: "/kanshan/still/idle.png",     label: "待机" },
  greeting:  { anim: "/kanshan/anim/greet.gif",    animWebp: "/kanshan/webp/greet.webp",    still: "/kanshan/still/greet.png",    label: "打招呼" },
  routing:   { anim: "/kanshan/anim/sway.gif",     animWebp: "/kanshan/webp/sway.webp",     still: "/kanshan/still/sway.png",     label: "晃悠" },
  searching: { anim: "/kanshan/anim/computer.gif", animWebp: "/kanshan/webp/computer.webp", still: "/kanshan/still/computer.png", label: "用电脑" },
  thinking:  { anim: "/kanshan/anim/computer.gif", animWebp: "/kanshan/webp/computer.webp", still: "/kanshan/still/computer.png", label: "用电脑" },
  answering: { anim: "/kanshan/anim/computer.gif", animWebp: "/kanshan/webp/computer.webp", still: "/kanshan/still/computer.png", label: "用电脑" },
  gap:       { anim: "/kanshan/anim/sway.gif",     animWebp: "/kanshan/webp/sway.webp",     still: "/kanshan/still/sway.png",     label: "晃悠" },
  inviting:  { anim: "/kanshan/anim/greet.gif",    animWebp: "/kanshan/webp/greet.webp",    still: "/kanshan/still/greet.png",    label: "打招呼" },
  celebrate: { anim: "/kanshan/anim/ball.gif",     animWebp: "/kanshan/webp/ball.webp",     still: "/kanshan/still/ball.png",     label: "运球" },
  sleepy:    { anim: "/kanshan/anim/sleepy.gif",   animWebp: "/kanshan/webp/sleepy.webp",   still: "/kanshan/still/sleepy.png",   label: "瞌睡" },
};

/** 状态 → 设计系统的状态色，用于舞台光晕与装饰环。 */
export const KANSHAN_ACCENT_BY_STATE: Record<KanshanState, "blue" | "violet" | "green" | "orange"> = {
  idle: "blue",
  greeting: "green",
  routing: "blue",
  searching: "blue",
  thinking: "violet",
  answering: "violet",
  gap: "orange",
  inviting: "green",
  celebrate: "green",
  sleepy: "violet",
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
  // 2026-09-17：原为「更新 Mesh」+「关系图会跟着多出节点和边」。本场关系图下线后
  // 那句就成了假承诺 —— 没有任何一张图会因为补一段真人而变化。改成如实描述这一落点。
  { key: "celebrate", label: "补充已写入", caption: "这一段并进最终稿，闭环完成" },
];
