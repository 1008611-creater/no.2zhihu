"use client";

import { motion, useReducedMotion, useScroll, useTransform } from 'motion/react';
import { useRef } from 'react';

export default function HeroTitle() {
  const ref = useRef<HTMLHeadingElement>(null);
  const reduced = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start start', 'end start'] });
  const y = useTransform(scrollYProgress, [0, 1], [0, -24]);
  const text = '先替你把这个问题答一遍。';
  return <motion.h1 ref={ref} style={reduced ? undefined : { y }}>
    让知乎上任何一个答主<br />
    <motion.em aria-label={text} initial={reduced ? false : 'hidden'} animate="visible" variants={{ visible: { transition: { staggerChildren: .04 } } }}>
      {Array.from(text).map((char, i) => <motion.span className="text-character" aria-hidden="true" key={i} variants={{ hidden: { opacity: 0, y: 14 }, visible: { opacity: 1, y: 0 } }} transition={{ duration: reduced ? 0 : .6, ease: 'easeOut' }}>{char}</motion.span>)}
    </motion.em>
  </motion.h1>;
}
