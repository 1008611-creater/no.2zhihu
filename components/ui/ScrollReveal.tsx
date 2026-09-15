"use client";

import { motion, useReducedMotion } from "motion/react";
import type { ReactNode } from "react";
import { REVEAL } from "@/lib/motion/tokens";

/**
 * 滚动揭示容器：全站统一的「滚到才播」入场。
 *
 * 具体参数全部来自 tokens 的 REVEAL 预设，这里不写任何裸数值——
 * 之前这个组件硬编码了 y:20 / duration:0.6 / ease:'easeOut'，
 * 和 token 体系是两套数字，改一处忘一处就会又散掉。
 *
 * 减少动态效果时 `initial={false}` 直接渲染终态，不播任何动画。
 */
export default function ScrollReveal({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  const reduced = useReducedMotion();
  return (
    <motion.div
      className={className}
      initial={reduced ? false : REVEAL.initial}
      whileInView={REVEAL.whileInView}
      viewport={REVEAL.viewport}
      transition={reduced ? { duration: 0 } : REVEAL.transition}
    >
      {children}
    </motion.div>
  );
}
