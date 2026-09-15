"use client";

import { motion, useReducedMotion, useScroll, useTransform } from 'motion/react';
import { useRef } from 'react';

/**
 * 首屏主标题。
 *
 * 为什么用 scrollYProgress 而不是交给 Lenis：这是唯一一处「滚动驱动」
 * 的位移，幅度刻意压到 24px —— 它只负责让标题在离开视口时慢半拍，
 * 不构成视差表演（design-system.md 明令禁止无意义视差）。
 *
 * 降级：prefers-reduced-motion 时既不做滚动位移，也不拆字，
 * 直接渲染成一把完整的 h1，保证读屏与静态截图都是终态。
 */
export default function HeroTitle() {
  const ref = useRef<HTMLHeadingElement>(null);
  const reduced = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start start', 'end start'] });
  const y = useTransform(scrollYProgress, [0, 1], [0, -24]);
  const text = '先替你把这个问题答一遍。';

  if (reduced) {
    return (
      <h1 ref={ref}>
        让知乎上任何一个答主
        <br />
        <em>{text}</em>
      </h1>
    );
  }

  return (
    <motion.h1 ref={ref} style={{ y }}>
      让知乎上任何一个答主
      <br />
      <motion.em
        aria-label={text}
        initial="hidden"
        animate="visible"
        variants={{ visible: { transition: { staggerChildren: 0.04 } } }}
      >
        {Array.from(text).map((char, i) => (
          <motion.span
            className="text-character"
            aria-hidden="true"
            key={i}
            variants={{ hidden: { opacity: 0, y: 14 }, visible: { opacity: 1, y: 0 } }}
            transition={{ duration: 0.6, ease: 'easeOut' }}
          >
            {char}
          </motion.span>
        ))}
      </motion.em>
    </motion.h1>
  );
}
