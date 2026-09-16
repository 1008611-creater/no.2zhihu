import type { Metadata } from "next";

import { personaPageMeta } from "@/lib/domain/persona-meta";

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
 *
 * ⚠️ 2026-09-16 补：命中名册时**也必须**返回 metadata —— 这里原来写的是 `return {}`，
 * 于是 16 位答主的档案页全部只有根布局的默认标题（分享出去都是同一句话，
 * 而本产品的评价标准正是「遮住名字也该看得出不是同一个人」）。
 * 现在两种情况都走 `lib/domain/persona-meta.ts` 的同一个函数，口径只有一处；
 * 该函数是纯函数、不 import next，因此能被自检脚本直接调用（见
 * `scripts/check-persona-metadata.mjs`）。
 */
export function generateMetadata({ params }: { params: { handle: string } }): Metadata {
  const meta = personaPageMeta(params.handle);

  return {
    title: meta.title,
    description: meta.description,
    // 未知 handle 不给 canonical：那会暗示这一页才是「正主」。
    alternates: meta.path ? { canonical: meta.path } : undefined,
    openGraph: {
      title: meta.title,
      description: meta.description,
      type: "profile",
      url: meta.path,
    },
    // 只在未知 handle 时加 noindex；命中名册的档案页保持可收录。
    ...(meta.noindex ? { robots: { index: false, follow: true } } : {}),
  };
}

export default function PersonaHandleLayout({ children }: { children: React.ReactNode }) {
  return children;
}
