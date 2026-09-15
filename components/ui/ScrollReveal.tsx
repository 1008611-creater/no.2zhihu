"use client";

import { motion, useReducedMotion } from 'motion/react';
import type { ReactNode } from 'react';

/** silk 的统一视口节奏；减少动态效果时直接显示终态。 */
export default function ScrollReveal({ children, className = '' }: { children: ReactNode; className?: string }) {
  const reduced = useReducedMotion();
  return <motion.div className={className} initial={reduced ? false : 'hidden'} whileInView="visible"
    viewport={{ once: true, margin: '-20%' }} variants={{ hidden: { opacity: 0, y: 20 }, visible: { opacity: 1, y: 0 } }}
    transition={{ duration: reduced ? 0 : 0.6, ease: 'easeOut' }}>{children}</motion.div>;
}
