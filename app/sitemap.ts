import type { MetadataRoute } from "next";

/**
 * 站点地图。
 * 域名在部署到 Vercel 后由环境变量提供，未配置时退回相对路径，
 * 不硬编码任何个人域名。
 *
 * 2026-09-15：清掉两个不存在的路由（`/feed`、`/about` —— 全站没有任何链接指向它们，
 * 进 sitemap 只会让爬虫拿到 404），换成真实的 `/discover`。
 */
const ROUTES: Array<{ path: string; priority: number }> = [
  { path: "/", priority: 1 },
  { path: "/discover", priority: 0.9 },
  { path: "/square", priority: 0.9 },
  { path: "/mirror", priority: 0.9 },
  { path: "/mesh", priority: 0.8 },
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
