import type { MetadataRoute } from "next";

/**
 * 站点清单。
 *
 * 为什么需要它：官方提交清单把「项目封面图 / icon」列为加分项，评委在浏览器
 * 标签页、分享卡片和添加到主屏时都会看到这枚图标，是最低成本的设计感补强。
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "二号知乎 · Human Mesh",
    short_name: "二号知乎",
    description:
      "看山召集由知乎公开回答蒸馏出的 Skill 分身多视角作答，标出共同缺口，再把缺口交给真实的人接管。",
    start_url: "/",
    display: "standalone",
    background_color: "#07080f",
    theme_color: "#07080f",
    lang: "zh-CN",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
