'use client';

export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="zh-CN">
      <body>
        <main className="route-state" role="alert">
          <p className="page-eyebrow">暂时无法加载</p>
          <h1 className="page-title">页面遇到了问题</h1>
          <p className="page-description">请稍后重试；资讯数据不会因此丢失。</p>
          <button className="primary-button" onClick={reset}>重新加载</button>
        </main>
      </body>
    </html>
  );
}
