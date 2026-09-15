import type { Metadata, Viewport } from 'next';
import ReactDOM from 'react-dom';
import './globals.css';
import './frontend-v2.css';
import { MirrorProvider } from '@/lib/store/mirror-store';
import TopBar from '@/components/ui/TopBar';
import localFont from 'next/font/local';
import { MotionProvider } from '@/components/providers/MotionProvider';
import RouteTransition from '@/components/ui/RouteTransition';

const displayFont = localFont({
  src: [
    { path: './fonts/space-grotesk-400.woff2', weight: '400' },
    { path: './fonts/space-grotesk-500.woff2', weight: '500' },
    { path: './fonts/space-grotesk-600.woff2', weight: '600' },
    { path: './fonts/space-grotesk-700.woff2', weight: '700' },
  ], variable: '--font-display', display: 'swap',
});
const monoFont = localFont({
  src: [
    { path: './fonts/jetbrains-mono-400.woff2', weight: '400' },
    { path: './fonts/jetbrains-mono-500.woff2', weight: '500' },
  ], variable: '--font-mono', display: 'swap',
});

/**
 * 首屏看山素材预热。
 *
 * 为什么不用 GIF：官方 idle.gif 是 951 KB，作为 LCP 元素会让移动端
 * 白白多等一次大文件。WebP 版是 233 KB，这里 preload 的就是它 ——
 * 用 type="image/webp" 明确告诉浏览器「我真正要的是 WebP」，
 * 避免浏览器先按 GIF 探一次再回退。
 *
 * 为什么不写 metadata.other：Next 14 会把 other 里的键渲染成 <meta>，
 * 而不是 <link>，浏览器不认 meta 形式的 preload。App Router 里声明式
 * 预加载资源的正规做法是 ReactDOM.preload，它由 React 渲染成真正的
 * <link rel="preload">。本文件是服务端组件，可以直接调用。
 *
 * 兼容分支：不支持 WebP 的浏览器会忽略这条 preload，
 * 退回去取 Kanshan 里 <picture> 的 GIF 兜底分支，不会因此白屏。
 */
function preloadKanshan() {
  ReactDOM.preload('/kanshan/webp/idle.webp', { as: 'image', type: 'image/webp' });
  ReactDOM.preload('/kanshan/webp/greet.webp', { as: 'image', type: 'image/webp' });
}

export const metadata: Metadata = {
  metadataBase: new URL('https://zhihu.cauai.fun'),
  title: '二号知乎 · Human Mesh',
  description: '让每个问题，先在另一个知乎里发生。看山召集 Skill 分身作答，再把缺口交给真实的人。',
};

export const viewport: Viewport = {
  themeColor: '#07080f',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  preloadKanshan();
  return (
    <html lang="zh-CN">
      <body className={`${displayFont.variable} ${monoFont.variable}`}>
        <MotionProvider>
        <RouteTransition />
        <a className="skip-link" href="#main-content">跳到主要内容</a>
        <MirrorProvider>
          <TopBar />
          <main id="main-content" className="shell" tabIndex={-1}>{children}</main>
        </MirrorProvider>
        </MotionProvider>
      </body>
    </html>
  );
}
