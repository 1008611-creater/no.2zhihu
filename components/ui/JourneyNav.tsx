"use client";

import Link from 'next/link';
import { usePathname } from 'next/navigation';

/**
 * 作答主流程：提出问题 → 邀请回答问题。
 *
 * 为什么只有两步：「真人补充」不是主流程的一步，而是**某一场**跑完之后、
 * 针对某个缺口才可能发生的分支动作。把它并列成第 3 步，会让整条流程读起来像
 * 「每个问题都要真人补一遍」——实际绝大多数问题分身自己就答完了。
 * 现在它降级为子页面，只从工作台/单篇回答的缺口入口进入。
 */
const STEPS = [
  { href: '/', label: '01 提出问题' },
  { href: '/mirror', label: '02 邀请回答' },
];

export default function JourneyNav() {
  const pathname = usePathname();
  return (
    <nav className="journey-nav" aria-label="回答流程">
      {STEPS.map((step) => (
        <Link
          key={step.href}
          href={step.href}
          aria-current={
            pathname === step.href || (step.href === '/mirror' && pathname.startsWith('/answer/'))
              ? 'step'
              : undefined
          }
        >
          {step.label}
        </Link>
      ))}
    </nav>
  );
}
