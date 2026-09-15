"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { useReducedMotion } from "@/lib/motion/useReducedMotion";
import ScrollProgress from "./ScrollProgress";
import { LogoMark } from "./LogoMark";
import { DUR, SPRING } from "@/lib/motion/tokens";
import { useSession } from "@/lib/hooks/useSession";

/**
 * 四个 tab，一个 tab 只回答一个问题：
 *   · 首页     —— 我要问一个问题（提问 + 选答主，不铺任何结果）
 *   · 分身发现 —— 这座虚拟知乎里住着谁（答主名册 + 公共人物）
 *   · 虚拟广场 —— 别人问过什么、我问过什么（含「我曾经提问过的」）
 *   · 我的     —— 我的分身答过什么、我的 Mesh 长什么样
 *
 * 为什么把「分身发现」从 /mirror 拆出来：/mirror 原本同时干两件事 ——
 * 既列全部答主（看人），又渲染本场结果（看答案）。两者生命周期完全不同：
 * 名册永远在那儿，本场结果只在生成后存在。合在一个 tab 里，没生成过问题的
 * 用户进来只看到一句提示，生成过的用户又要先划过一整页名册才看到自己的答案。
 * 拆成独立 tab 之后，「看人」和「看回答」各归各位。
 */
const NAV = [
  { href: "/", label: "首页" },
  { href: "/personas", label: "分身发现" },
  { href: "/square", label: "虚拟广场" },
  { href: "/me", label: "我的" }
];

/**
 * 顶栏。
 *
 * 为什么加移动端抽屉：评审很可能用手机打开。旧的 nav 只是 flex-wrap，
 * 多个导航项在 720px 以下会挤成两行并把品牌挤变形。现在窄屏收成抽屉，
 * 保证「品牌 + 入口 + 账号」在小屏上依然是一行干净的版式。
 *
 * 账号区四态（见 lib/hooks/useSession.ts）：
 *   已登录且可用 → 头像 + @昵称 + 退出
 *   登录已过期 → 「登录已过期 · 重新登录」（cookie 还在但服务端 token 没了）
 *   已开通未登录 → 「知乎登录」
 *   未开通 → 什么都不显示，避免给一个必然报错的按钮
 *
 * 为什么要把「已过期」单列一态：cookie 有 7 天有效期，而 access_token 只活在
 * 服务端进程内存里。服务一重启，user 还在（cookie 没过期）但 token 已经没了 ——
 * 这时若照常显示「已登录」，用户点任何需要数据的入口都会收到 401，且看不出原因。
 */
export function TopBar() {
  const path = usePathname();
  const { user, available, tokenValid, loading: sessionLoading, login, logout } = useSession();
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
          {/* 用可动标识：hover/focus 时「分身」会从「真人」上轻轻分离再归位，
              把产品的核心动作藏进品牌图形里。静态场景（reduced-motion）自动降级。 */}
          <LogoMark size={32} alt="" className="brand-mark" />
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
            {user && tokenValid ? (
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
            ) : user ? (
              /* cookie 没过期、但服务端 token 已不在（服务重启或满 1 小时）。
                 如实说「过期」并给一个点一下就重新授权的入口，
                 而不是照常显示已登录、让用户去撞 401。 */
              <button onClick={login} title="登录已过期，请重新登录">
                登录已过期 · 重新登录
              </button>
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
              transition={{ duration: DUR.fast }}
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
              transition={reducedMotion ? { duration: 0 } : SPRING.light}
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
