"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * 探索区的面包屑。
 *
 * 原来这里写死一句「探索 Human Mesh」，`/discover` `/square` `/mesh` 三个区
 * 共用同一句话 —— 用户看不出自己站在哪一块。改成按路由给出当前区名，
 * 顺带把 `/personas/[handle]` 明确标成「分身发现」下面的档案页，
 * 让「名册 → 档案 → 带他去提问」这条路径在版面上看得见。
 */
const SECTIONS: Array<{ prefix: string; label: string }> = [
  { prefix: "/discover", label: "分身发现" },
  { prefix: "/personas", label: "分身发现 · 答主档案" },
  { prefix: "/square", label: "虚拟广场" },
  { prefix: "/mesh", label: "我的 Mesh" },
];

export default function Breadcrumb() {
  const pathname = usePathname();
  const hit = SECTIONS.find((s) => pathname === s.prefix || pathname.startsWith(s.prefix + "/"));

  return (
    <nav className="journey-nav" aria-label="当前位置">
      <Link href="/">首页</Link>
      <span aria-hidden="true">/</span>
      <span>{hit?.label ?? "探索"}</span>
    </nav>
  );
}
