"use client";

import Link from 'next/link';

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <section className="route-feedback" role="alert">
    <p className="eyebrow">页面暂时未能加载</p>
    <h1>这一步出了点问题</h1>
    <p className="lede">页面加载失败。可以重试，或回到首页重新进入。</p>
    <div className="feedback-actions"><button className="btn btn-primary" onClick={reset}>重试</button><Link className="btn" href="/">回首页</Link></div>
  </section>;
}
