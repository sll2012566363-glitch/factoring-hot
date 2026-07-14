import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: '保理热榜 - 保理与供应链金融资讯聚合',
  description: '基于 48 个权威信源，AI 实时评分，聚焦前沿解读、行业模式、监管动态、争议解决、规范文件五大维度的保理行业资讯平台',
  keywords: ['保理', '供应链金融', 'ABS', '应收账款', '金融资讯'],
  authors: [{ name: 'Factoring HOT' }],
  openGraph: {
    title: '保理热榜',
    description: '保理与供应链金融资讯聚合',
    type: 'website',
  }
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <head>
        {/* 防 FOUC：首帧前按 localStorage/系统偏好定主题 */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('theme')||'system';var d=t==='dark'||(t==='system'&&window.matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.classList.toggle('dark',d);}catch(e){}})();`,
          }}
        />
      </head>
      <body className="antialiased">
        {children}
      </body>
    </html>
  );
}
