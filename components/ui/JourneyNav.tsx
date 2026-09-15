"use client";

import Link from 'next/link';
import { usePathname } from 'next/navigation';

/**
 * 提问流程的流程条。
 *
 * 2026-09-15 两条主线重构：这里只保留提问主线的两步 ——「01 提问 → 02 查看回答」。
 *
 * 「真人补充」原先与上面两步并列成「03」，读起来像每个人都要走的第三阶段，
 * 实际上它只发生在看山标出缺口、或者你决定接管某一篇回答之后。现在把它降级成
 * `02 查看回答` 下面的子页面，以 `↳` 的形式贴在当前步骤后面 —— 位置对了，
 * 也不再默认每个人都会走到这里。
 *
 * 「分身发现」不在这条流程里：它是另一条主线，入口在顶部导航的 Tab。
 */
const STEPS = [{ href: '/', label: '01 提问' }, { href: '/mirror', label: '02 查看回答' }];

/** 提问流程的子页面：挂在哪一步下面、叫什么。 */
const SUB_PAGES: Array<{ prefix: string; parent: string; label: string }> = [
  { prefix: '/fill', parent: '/mirror', label: '真人补充' },
  { prefix: '/answer', parent: '/mirror', label: '单篇回答' },
];

export default function JourneyNav() {
  const pathname = usePathname();
  const sub = SUB_PAGES.find((s) => pathname === s.prefix || pathname.startsWith(s.prefix + '/'));

  return (
    <nav className="journey-nav" aria-label="提问流程">
      {STEPS.map((step) => {
        const active = pathname === step.href || (step.href === '/mirror' && !!sub);
        return (
          <Link key={step.href} href={step.href} aria-current={active ? 'step' : undefined}>
            {step.label}
          </Link>
        );
      })}
      {sub && (
        <span className="mono dimmer" style={{ paddingLeft: 2 }}>
          ↳ {sub.label}
        </span>
      )}
    </nav>
  );
}
