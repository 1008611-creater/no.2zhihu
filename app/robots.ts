import type { MetadataRoute } from "next";

/** 允许抓取公开页面；接口与本地数据路径不索引。 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/api/"],
      },
    ],
  };
}
