import type { MetadataRoute } from "next";

/**
 * 站点地图。
 * 域名在部署到 Vercel 后由环境变量提供，未配置时退回相对路径，
 * 不硬编码任何个人域名。
 */
const ROUTES: Array<{ path: string; priority: number }> = [
  { path: "/", priority: 1 },
  { path: "/square", priority: 0.9 },
  { path: "/mirror", priority: 0.9 },
  { path: "/mesh", priority: 0.8 },
  { path: "/feed", priority: 0.7 },
  { path: "/about", priority: 0.6 },
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
