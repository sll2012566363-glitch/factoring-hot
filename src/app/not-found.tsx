import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="route-state">
      <p className="page-eyebrow">404</p>
      <h1 className="page-title">页面不存在</h1>
      <p className="page-description">链接可能已失效，或文章尚未公开。</p>
      <Link href="/" className="primary-button">返回首页</Link>
    </main>
  );
}
