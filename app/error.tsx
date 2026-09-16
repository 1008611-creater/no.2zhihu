"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { isChunkLoadError, markAutoReload } from "@/lib/domain/chunk-reload";

/**
 * 路由段错误边界。
 *
 * ## 2026-09-16 的重要更正：这里才是「旧 chunk 404」的主战场
 *
 * 原本以为该由 `global-error.tsx` 兜底，**实测证明不是**：
 * 从磁盘删掉一个页面级 chunk 后重新打开页面，浏览器抛
 * `Uncaught ChunkLoadError: Loading chunk 36 failed`，
 * 而**捕获它的是本文件**（当时页面显示「这一步出了点问题」），
 * `global-error.tsx` 根本没被触发。
 *
 * 于是问题变成「提示与行动不匹配」：这个错误对用户说「可以重试」，
 * 但 `reset()` 只是重新渲染，**不会重新下载那个已被部署删掉的 chunk** ——
 * 用户点几次都一样。见 `lib/domain/chunk-reload.ts` 里的完整取证。
 *
 * 现在分成两条路径：
 *   · **资产过期**（ChunkLoadError）→ 自动重载一次（带 60 秒防死循环），
 *     并如实告诉用户「页面在加载时更新过了，你的数据没丢」；
 *   · **其他错误** → 保留原来的「重试」，因为它真的可能管用。
 */

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const [chunkFailed, setChunkFailed] = useState(false);
  const [autoReloaded, setAutoReloaded] = useState(false);

  useEffect(() => {
    if (!isChunkLoadError(error)) return;
    setChunkFailed(true);
    // 先尝试自愈：同一标签页 60 秒内只允许一次，避免「重载 → 又失败 → 再重载」死循环。
    if (markAutoReload()) {
      setAutoReloaded(true);
      window.location.reload();
    }
  }, [error]);

  if (chunkFailed) {
    return (
      <section className="route-feedback" role="alert">
        <p className="eyebrow">页面需要刷新</p>
        <h1>这个页面在加载时更新过了</h1>
        <p className="lede">
          我们刚发布了一次更新，你打开的页面还在找旧的资源文件，所以没能接上。
          <strong>你的数据没有丢</strong>（提问与回答都存在本机浏览器里），刷新一下就好。
        </p>
        <div className="feedback-actions">
          <button className="btn btn-primary" onClick={() => window.location.reload()}>
            刷新页面
          </button>
          <Link className="btn" href="/">
            回首页
          </Link>
        </div>
        {!autoReloaded && (
          <p className="dim" style={{ fontSize: 12.5, marginTop: 12 }}>
            刚才已经自动试过一次，如果还是这样，再点一次刷新即可。
          </p>
        )}
      </section>
    );
  }

  return (
    <section className="route-feedback" role="alert">
      <p className="eyebrow">页面暂时未能加载</p>
      <h1>这一步出了点问题</h1>
      <p className="lede">页面加载失败。可以重试，或回到首页重新进入。</p>
      <div className="feedback-actions">
        <button className="btn btn-primary" onClick={reset}>
          重试
        </button>
        <Link className="btn" href="/">
          回首页
        </Link>
      </div>
    </section>
  );
}
