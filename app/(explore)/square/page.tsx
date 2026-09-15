"use client";

import SquareField from "@/components/square/SquareField";

/**
 * 虚拟广场。
 *
 * 2026-09-15 改造（issue 9，评委反馈「还是太像后台记录页」）：
 *
 * 旧版是**纵向卡片列表** —— 本质上是「后台记录页」，一屏屏往下翻，
 * 看不出「广场」这个隐喻。新版做成**可拖拽、可缩放的无限画布**：
 * 每场讨论是一张散落在广场上的「话题桌」，用户像在广场里闲逛，
 * 而不是翻阅列表。
 *
 * 为什么不在这里包 `<section className="shell">`：无限画布需要占满视口，
 * 外边距与内层容器会把它压住。全屏布局由 SquareField 接管
 * （见 frontend-v2.css 的 .sq-bleed / body.sq-locked）。
 *
 * 也**不在这里渲染标题** —— 规格明确要求顶部只保留一句
 * 「此刻，广场上有 N 场讨论正在发生」，不要原先巨大的静态标题
 * （旧版那句「这座虚拟知乎里 / 已经讨论过的事」正是被点名要去掉的那种）。
 * 那一句由 SquareCanvas 渲染（它知道 N 是多少）。
 *
 * 筛选能力完整保留，只是从「页内一块 chip 行」移进画布顶栏，
 * 与那句计数并排 —— 规格给的四个：全部 / 正在发生 / 等真人回答 / 我的讨论。
 * `?filter=mine` 深链仍然可用（其它页面会用到），由 SquareField 在挂载后读取。
 */
export default function SquarePage() {
  return <SquareField />;
}
