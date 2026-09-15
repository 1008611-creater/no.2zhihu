import type { MetadataRoute } from "next";

/**
 * 站点地图。
 * 域名在部署到 Vercel 后由环境变量提供，未配置时退回相对路径，
 * 不硬编码任何个人域名。
 *
 * ⚠️ 列在这里的每条路径都必须是**真实返回 200 的页面**。
 * 2026-09-15 修正：原先列着 `/feed` 与 `/about`，两者都已不存在（实测 404）——
 * 站点地图把爬虫与评委送到死页上。同时补上真实存在却漏掉的
 * `/personas`（分身发现）与 `/me`（我的）。
 * `/mesh` 不再列出：它只是重定向到 `/me`，规范地址是 `/me`。
 */
const ROUTES: Array<{ path: string; priority: number }> = [
  { path: "/", priority: 1 },
  { path: "/mirror", priority: 0.9 },
  { path: "/square", priority: 0.9 },
  { path: "/personas", priority: 0.8 },
  { path: "/me", priority: 0.8 },
];

export default function sitemap(): MetadataRoute.Sitemap {
  const base = (process.env.NEXT_PUBLIC_SITE_URL ?? "").replace(/\/$/, "");
  const now = new Date();
  return ROUTES.map((r) => ({
    url: `${base}${r.path}`,
    lastModified: now,
    changeFrequency: "daily" as const,
    priority: r.priority,
  }));
}
