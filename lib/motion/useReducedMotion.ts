"use client";

import { useEffect, useState } from "react";

/**
 * 是否偏好「减少动态效果」—— **首帧恒为 false**，挂载后再校正。
 *
 * ## 为什么不能直接用 motion 的 useReducedMotion()
 *
 * 2026-09-15 实测事故（线上 `/square`，`prefers-reduced-motion: reduce`）：
 * 页面**卡在「正在铺开广场…」永远不动**，且 `square-library.json` **一次都没请求**。
 * 抓到的报错是 React #418（水合不匹配）→ #423，重试若干次后落到 #329，
 * 此时整棵树没有挂载成功，**effect 从未运行**，所以数据永远不来。
 * 同一个页面在 `no-preference` 下 0 报错、稳定 22 行。
 *
 * 根因：motion 的 `useReducedMotion()` 在**客户端首次渲染**就同步返回了媒体查询的
 * 真实值，而服务端渲染时没有 window、只能返回 `false`。于是所有在**渲染期**按它
 * 分支的组件（`app/template.tsx` 的 `initial={reducedMotion ? false : {...}}`、
 * TopBar / LogoMark / Kanshan / SquareCanvas / SquareStrip / GapCard 等）产出的
 * HTML 与客户端首帧不一致 → React 判定水合失败。
 *
 * 这正是本项目**已经写下来过的教训**：`SquareField` 的 `useIsNarrow` 注释里写着
 * 「初值用 false（先按桌面渲染）而不是同步读 matchMedia：服务端没有 window，
 * 同步读会让首屏 HTML 与客户端不一致（hydration 报错）」。
 * 那个 hook 遵守了，motion 的这个没有 —— 所以这里补一个同款。
 *
 * ## 代价（如实说明）
 *
 * 开启减少动态的用户，首帧会按「有动画」的分支渲染，挂载后一帧内切到静态分支，
 * 可能看到一次极短的形态切换。两害相权：一次 1 帧的切换 vs 整页永久卡死。
 */
export function useReducedMotion(): boolean {
  // 初值 false：与服务端渲染一致，保证首帧 HTML 匹配。
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReduced(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  return reduced;
}

export default useReducedMotion;
