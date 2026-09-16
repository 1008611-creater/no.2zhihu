"use client";

import { useEffect, useState } from "react";
import { isChunkLoadError, markAutoReload } from "@/lib/domain/chunk-reload";

/**
 * 全局错误边界 —— **最后一道防线**，不是主力。
 *
 * ## 为什么说它是「最后一道」
 *
 * 实测（2026-09-16）：「部署删掉旧 chunk」这个场景**主要由 `app/error.tsx` 兜住**，
 * 本文件当时并没有被触发。所以真正修用户体验的是 `error.tsx`。
 *
 * 但本文件仍然必要，因为它覆盖 `error.tsx` **兜不到**的两种情况：
 *
 *   1. `app/error.tsx` 自己所在的 chunk 也没能加载出来（它同样是动态 chunk）；
 *   2. 错误发生在**根 layout 渲染期间** —— `error.tsx` 无法捕获根布局自身的错误。
 *
 * 它是会被内联进根 HTML 的，所以在「chunk 体系整体失效」时，它比 `error.tsx`
 * 更有可能活下来。留着它，成本是一个小文件，收益是不留死角。
 *
 * ## 一个刻意保留的粗糙
 *
 * 这里用 `<a href="/">` 而不是 `next/link`：本文件要在「客户端路由已不可用」的
 * 假设下工作，走原生跳转最稳 —— 慢一点，但不再依赖那份已经坏掉的清单。
 */

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const [chunkFailed, setChunkFailed] = useState(false);

  useEffect(() => {
    if (!isChunkLoadError(error)) return;
    setChunkFailed(true);
    if (markAutoReload()) window.location.reload();
  }, [error]);

  if (chunkFailed) {
    return (
      <html lang="zh-CN">
        <body>
          <section className="route-feedback" role="alert">
            <p className="eyebrow">页面需要刷新</p>
            <h1>这个页面在加载时更新过了</h1>
            <p className="lede">
              我们刚发布了一次更新，你打开的页面还在找旧的资源文件。
              <strong>你的数据没有丢</strong>，刷新一下就好。
            </p>
            <div className="feedback-actions">
              <button className="btn btn-primary" onClick={() => window.location.reload()}>
                刷新页面
              </button>
              <a className="btn" href="/">
                回首页
              </a>
            </div>
          </section>
        </body>
      </html>
    );
  }

  return (
    <html lang="zh-CN">
      <body>
        <section className="route-feedback" role="alert">
          <p className="eyebrow">页面暂时未能加载</p>
          <h1>这一步出了点问题</h1>
          <p className="lede">页面加载失败。可以重试，或回到首页重新进入。</p>
          <div className="feedback-actions">
            <button className="btn btn-primary" onClick={reset}>
              重试
            </button>
            <a className="btn" href="/">
              回首页
            </a>
          </div>
        </section>
      </body>
    </html>
  );
}
