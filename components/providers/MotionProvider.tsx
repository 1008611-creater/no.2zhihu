"use client";

import { MotionConfig } from 'motion/react';
import { useEffect, type ReactNode } from 'react';
import Lenis from 'lenis';

export function MotionProvider({ children }: { children: ReactNode }) {
  useEffect(() => {
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
    let lenis: Lenis | undefined;
    const sync = () => {
      lenis?.destroy();
      lenis = undefined;
      if (!preference.matches) lenis = new Lenis({ autoRaf: true, anchors: true });
    };
    sync();
    preference.addEventListener('change', sync);
    return () => { preference.removeEventListener('change', sync); lenis?.destroy(); };
  }, []);
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>;
}
