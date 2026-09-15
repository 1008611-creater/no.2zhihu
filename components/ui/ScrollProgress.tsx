"use client";

import { motion, useReducedMotion, useScroll, useSpring } from "motion/react";

/**
 * 顶栏下方的阅读进度线。
 *
 * 为什么值得加：本站的首页与工作台都是长页面（分镜式大 section 堆叠），
 * 没有进度指示时读者不知道自己离底部还有多远。一条 2px 的状态色线
 * 是最低成本的解法 —— 不占布局、不做装饰、只表达「读到哪里」。
 *
 * 遵循 spec：
 *   - 减少动态效果时直接不渲染（进度本身不是信息，缺了不损失内容）；
 *   - 用 spring 而不用线性 width 过渡，与全站弹簧语言一致。
 */
export default function ScrollProgress() {
  const reduced = useReducedMotion();
  const { scrollYProgress } = useScroll();
  const scaleX = useSpring(scrollYProgress, { stiffness: 300, damping: 30, restDelta: 0.001 });

  if (reduced) return null;

  return <motion.div className="scroll-progress" style={{ scaleX }} aria-hidden="true" />;
}
