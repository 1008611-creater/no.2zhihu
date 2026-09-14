"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV = [
  { href: "/", label: "首页" },
  { href: "/square", label: "虚拟广场" },
  { href: "/mirror", label: "镜像工作台" },
  { href: "/mesh", label: "Human Mesh" },
  { href: "/feed", label: "分身动态" },
  { href: "/about", label: "说明与审计" }
];

export function TopBar() {
  const path = usePathname();
  return (
    <header className="topbar">
      <div className="topbar-inner">
        <Link href="/" className="brand">
          <span className="brand-mark" aria-hidden>
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none">
              <circle cx="8.5" cy="10" r="3.1" fill="#0b0d17" />
              <circle cx="15.5" cy="10" r="3.1" fill="#0b0d17" />
              <path d="M9 16.4h6" stroke="#0b0d17" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </span>
          <span>
            <span className="brand-name">二号知乎</span>
            <br />
            <span className="brand-sub">Human Mesh · 知乎黑客松</span>
          </span>
        </Link>
        <nav className="nav">
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} data-active={path === n.href}>
              {n.label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}

export default TopBar;
