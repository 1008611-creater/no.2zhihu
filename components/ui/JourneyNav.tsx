"use client";

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const STEPS = [{ href: '/', label: '01 提问' }, { href: '/mirror', label: '02 查看回答' }, { href: '/fill', label: '03 真人补充' }];
export default function JourneyNav() {
  const pathname = usePathname();
  return <nav className="journey-nav" aria-label="回答流程">{STEPS.map(step => <Link key={step.href} href={step.href} aria-current={pathname === step.href || (step.href === '/mirror' && pathname.startsWith('/answer/')) ? 'step' : undefined}>{step.label}</Link>)}</nav>;
}
