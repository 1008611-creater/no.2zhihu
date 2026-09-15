"use client";

import { animate, useInView, useReducedMotion } from 'motion/react';
import { useEffect, useRef } from 'react';

export default function CountUp({ value }: { value: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const visible = useInView(ref, { once: true });
  const reduced = useReducedMotion();
  useEffect(() => {
    if (!visible || reduced) return;
    const animation = animate(0, value, { duration: 0.6, ease: 'easeOut', onUpdate: n => {
      if (ref.current) ref.current.textContent = Math.round(n).toLocaleString('zh-CN');
    } });
    return () => animation.stop();
  }, [value, visible, reduced]);
  return <span aria-label={value.toLocaleString('zh-CN')}><span ref={ref} aria-hidden="true">{value.toLocaleString('zh-CN')}</span></span>;
}
