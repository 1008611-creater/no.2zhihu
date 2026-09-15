import Link from 'next/link';

export default function NotFound() {
  return <section className="route-feedback">
    <p className="eyebrow">404 / 未找到页面</p>
    <h1>这条路还没有答案</h1>
    <p className="lede">地址可能已变更，请检查链接或回到首页。</p>
    <Link className="btn btn-primary" href="/">回首页</Link>
  </section>;
}
