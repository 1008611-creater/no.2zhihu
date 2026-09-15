"use client";

import { useEffect, useRef } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import gsap from 'gsap';

/**
 * 只拦截普通同站页面导航；查询参数、下载、外链和组合键仍保持浏览器语义。
 */
export default function RouteTransition() {
  const overlay = useRef<HTMLDivElement>(null);
  const busy = useRef(false);
  const router = useRouter();
  const pathname = usePathname();
  useEffect(() => {
    const el = overlay.current;
    if (!el) return;
    busy.current = false;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const animation = gsap.fromTo(el, { clipPath: 'circle(150% at 100% 0%)' }, { clipPath: 'circle(0% at 100% 0%)', duration: .32, ease: 'power2.out' });
    return () => { animation.kill(); };
  }, [pathname]);
  useEffect(() => {
    // 用 ReturnType 取 gsap.to 的返回类型，而不是写 gsap.core.Tween：
    // gsap.core 是全局 ambient 命名空间，并未从 "gsap" 模块导出，
    // 在本文件（顶层已 import gsap）里引用 gsap.core.Tween 会被解析到
    // 模块作用域下的 gsap 而找不到 Tween，类型检查直接报错。
    let animation: ReturnType<typeof gsap.to> | undefined;
    let fallback: ReturnType<typeof setTimeout> | undefined;
    const handle = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
      const link = event.target instanceof Element ? event.target.closest('a[href]') : null;
      if (!(link instanceof HTMLAnchorElement) || link.target || link.hasAttribute('download')) return;
      const next = new URL(link.href);
      if (next.origin !== location.origin || next.pathname === location.pathname || !overlay.current) return;
      event.preventDefault();
      if (busy.current) return;
      busy.current = true;
      animation = gsap.to(overlay.current, { clipPath: 'circle(150% at 100% 0%)', duration: .2, ease: 'power2.in', onComplete: () => {
        router.push(next.pathname + next.search + next.hash);
        fallback = setTimeout(() => { busy.current = false; if (overlay.current) gsap.set(overlay.current, { clipPath: 'circle(0% at 100% 0%)' }); }, 2000);
      } });
    };
    document.addEventListener('click', handle, true);
    return () => { document.removeEventListener('click', handle, true); animation?.kill(); clearTimeout(fallback); };
  }, [router]);
  return <div ref={overlay} className="route-transition" aria-hidden="true" />;
}
