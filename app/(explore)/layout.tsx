import Link from 'next/link';

export default function ExploreLayout({ children }: { children: React.ReactNode }) {
  return <div className="explore-layout"><nav className="journey-nav" aria-label="探索导航"><Link href="/">首页</Link><span aria-hidden="true">/</span><span>探索 Human Mesh</span></nav>{children}</div>;
}
