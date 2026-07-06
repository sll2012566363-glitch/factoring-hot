import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: '保理热榜 - 保理与供应链金融资讯聚合',
  description: '基于 20+ 权威信源，AI 实时评分，聚焦政策、市场、风险、创新四大维度的保理行业资讯平台',
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
    <html lang="zh-CN">
      <body className="antialiased">
        {children}
      </body>
    </html>
  );
}
