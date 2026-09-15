import type { Metadata, Viewport } from 'next';
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
