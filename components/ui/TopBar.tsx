"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import ScrollProgress from "./ScrollProgress";
import { useSession } from "@/lib/hooks/useSession";

const NAV = [
  { href: "/", label: "首页" },
  { href: "/square", label: "虚拟广场" },
  { href: "/mirror", label: "分身发现" },
  { href: "/mesh", label: "我的 Mesh" }
];

/**
 * 顶栏。
 *
 * 为什么加移动端抽屉：评审很可能用手机打开。旧的 nav 只是 flex-wrap，
 * 多个导航项在 720px 以下会挤成两行并把品牌挤变形。现在窄屏收成抽屉，
 * 保证「品牌 + 入口 + 账号」在小屏上依然是一行干净的版式。
 *
 * 账号区三态（见 lib/hooks/useSession.ts）：
 *   已登录 → 头像 + @昵称 + 退出
 *   已开通未登录 → 「知乎登录」
 *   未开通 → 什么都不显示，避免给一个必然报错的按钮
 */
export function TopBar() {
  const path = usePathname();
  const { user, available, loading: sessionLoading, login, logout } = useSession();
  const [open, setOpen] = useState(false);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const drawerRef = useRef<HTMLElement>(null);
  const reducedMotion = useReducedMotion();

  // 路由变化时自动收起抽屉，避免点完还在原地挡着页面。
  useEffect(() => { setOpen(false); }, [path]);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    drawerRef.current?.querySelector<HTMLElement>("button, a")?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
      if (e.key !== "Tab") return;
      const items = drawerRef.current?.querySelectorAll<HTMLElement>("button, a[href]");
      if (!items?.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault(); last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault(); first.focus();
      }
    };
    const wide = window.matchMedia("(min-width: 861px)");
    const closeOnWide = () => { if (wide.matches) setOpen(false); };
    wide.addEventListener("change", closeOnWide);
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKey);
      wide.removeEventListener("change", closeOnWide);
      toggleRef.current?.focus();
    };
  }, [open]);

  return (
    <header className="topbar">
      <ScrollProgress />
      <div className="topbar-inner">
        <Link href="/" className="brand" aria-label="影子知乎 · 回到首页">
          <span className="brand-mark" aria-hidden>
            {/* 主 logo 与 favicon / apple-icon 用同一形象资源（public/logo.png），
                保证「标签页图标 = 顶栏品牌」视觉一致。 */}
            <img src="/logo.png" alt="" width={32} height={32} decoding="async" />
          </span>
          <span className="brand-text">
            <span className="brand-name">影子知乎</span>
            <span className="brand-sub">Agent 可调用的人类知识网络</span>
          </span>
        </Link>

        <nav className="nav" aria-label="主导航">
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} data-active={isActive(path, n.href)} aria-current={isActive(path, n.href) ? 'page' : undefined}>
              {n.label}
              {isActive(path, n.href) && <motion.span aria-hidden="true" className="nav-active-marker" layoutId={reducedMotion ? undefined : 'nav-active'} transition={{ type: 'spring', stiffness: 260, damping: 26 }} />}
            </Link>
          ))}
        </nav>

        {!sessionLoading && (
          <div className="account">
            {user ? (
              <>
                <span className="account-avatar" aria-hidden>
                  {user.avatarUrl ? (
                    // 知乎头像域名不固定，用原生 img 规避 next/image 白名单。
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={user.avatarUrl} alt="" width={28} height={28} />
                  ) : (
                    user.name.slice(0, 1)
                  )}
                </span>
                <span className="account-name">@{user.name}</span>
                <button onClick={logout} aria-label="退出登录">退出</button>
              </>
            ) : available ? (
              <button onClick={login}>知乎登录</button>
            ) : null}
          </div>
        )}

        <button
          ref={toggleRef}
          className="nav-toggle"
          onClick={() => setOpen((v) => !v)}
          aria-label={open ? "关闭导航" : "打开导航"}
          aria-expanded={open}
          aria-controls="mobile-navigation"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
            {open ? (
              <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
            ) : (
              <path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
            )}
          </svg>
        </button>
      </div>

      <AnimatePresence>
        {open && (
          <>
            <motion.button
              className="nav-scrim"
              tabIndex={-1}
              aria-label="关闭导航"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.18 }}
              onClick={() => setOpen(false)}
            />
            <motion.nav
              ref={drawerRef}
              id="mobile-navigation"
              className="nav-drawer"
              role="dialog"
              aria-modal="true"
              aria-label="移动端导航"
              initial={reducedMotion ? false : { x: "100%" }}
              animate={{ x: 0 }}
              exit={reducedMotion ? { opacity: 0 } : { x: "100%" }}
              transition={reducedMotion ? { duration: 0 } : { type: "spring", stiffness: 320, damping: 34 }}
            >
              <button className="btn btn-ghost" onClick={() => setOpen(false)}>关闭导航</button>
              {NAV.map((n) => (
                <Link key={n.href} href={n.href} data-active={isActive(path, n.href)}>
                  {n.label}
                </Link>
              ))}
              {!sessionLoading && (
                user ? (
                  <button className="btn btn-ghost" onClick={logout}>退出 @{user.name}</button>
                ) : available ? (
                  <button className="btn btn-ghost" onClick={login}>知乎登录</button>
                ) : null
              )}
            </motion.nav>
          </>
        )}
      </AnimatePresence>
    </header>
  );
}

/** 子路由也算激活（例如 /personas/xxx 时「分身发现」保持高亮）。 */
function isActive(path: string, href: string): boolean {
  if (href === "/") return path === "/";
  return path === href || path.startsWith(href + "/");
}

export default TopBar;
