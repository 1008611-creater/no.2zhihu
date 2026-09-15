"use client";

import { motion } from "motion/react";
import { useReducedMotion } from "@/lib/motion/useReducedMotion";
import { DUR, EASE, SHIFT } from "@/lib/motion/tokens";

/**
 * 每次导航重新挂载，给所有子页面一个统一的入场节奏。
 *
 * 为什么不用 View Transitions API：它在 Safari 与部分移动浏览器上还不稳定，
 * 用 template 包一层 Motion 的淡入 + 位移是最稳的做法，且不会打断
 * 页面内的既有动画。
 */
export default function Template({ children }: { children: React.ReactNode }) {
  const reducedMotion = useReducedMotion();
  return (
    <motion.div
      initial={reducedMotion ? false : { opacity: 0, y: SHIFT.md }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: DUR.slow, ease: EASE.out }}
    >
      {children}
    </motion.div>
  );
}
