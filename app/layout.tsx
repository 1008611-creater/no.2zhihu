import type { Metadata, Viewport } from 'next';
import './globals.css';
import { MirrorProvider } from '@/lib/store/mirror-store';
import TopBar from '@/components/ui/TopBar';

export const metadata: Metadata = {
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
      <body>
        <MirrorProvider>
          <TopBar />
          <main className="shell">{children}</main>
        </MirrorProvider>
      </body>
    </html>
  );
}
