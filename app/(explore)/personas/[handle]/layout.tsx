import type { Metadata } from "next";

import { personaByHandle } from "@/lib/domain/personas";

/**
 * 答主档案段（`/personas/[handle]`）的 metadata。
 *
 * 为什么必须单独放一个 layout：`page.tsx` 是 `"use client"`（要用 `useParams` 与 Motion），
 * 而**客户端组件不能导出 `generateMetadata`** —— 于是「名册里没有这个人」这个提示页
 * 一直以 HTTP 200 返回。实测 2026-09-15：改名前的 11 个旧 handle（如
 * `/personas/ban-fo-xian-ren`）与任意乱拼的 handle 都会命中同一个 200 页面，
 * 上百个空页可以被搜索引擎当内容收录。
 *
 * 这里刻意**不**改成 404：点旧链接的是活人，给一个能回到名册的提示页比甩 404 好。
 * 要解决的只是「别让搜索引擎把空页收进去」，所以只加 `noindex`。
 * 路由段 layout 可以是服务端组件，正好用来补这一层。
 */
export function generateMetadata({ params }: { params: { handle: string } }): Metadata {
  if (personaByHandle(params.handle)) return {};
  return {
    title: "名册里没有这个人 · 影子知乎",
    robots: { index: false, follow: true },
  };
}

export default function PersonaHandleLayout({ children }: { children: React.ReactNode }) {
  return children;
}
