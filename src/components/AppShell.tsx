import Link from 'next/link';
import { ArrowUpRight, BellRing, Rss, Sparkles } from 'lucide-react';
import Header from '@/components/Header';

interface AppShellProps {
  children: React.ReactNode;
  rail?: React.ReactNode;
  railAfter?: React.ReactNode;
  wide?: boolean;
}

function DefaultRail() {
  return (
    <>
      <section className="rail-card rail-subscribe">
        <span className="rail-kicker"><BellRing size={13} /> 每日更新</span>
        <h2>把行业变化，<br />留在同一个入口。</h2>
        <p>监管、市场、交易与风险信号，每小时持续整理。</p>
        <Link href="/agent" className="rail-link">订阅 RSS / API <ArrowUpRight size={14} /></Link>
      </section>
      <section className="rail-card">
        <span className="rail-kicker"><Sparkles size={13} /> 阅读原则</span>
        <ul className="rail-list">
          <li>多信源优先，而非单篇热度</li>
          <li>AI 只做筛选与索引，不替代原文</li>
          <li>聚焦保理与供应链金融实质关联</li>
        </ul>
        <Link href="/about" className="rail-link">了解我们如何筛选 <ArrowUpRight size={14} /></Link>
      </section>
      <section className="rail-rss">
        <Rss size={15} /> 可通过 RSS、API 或 Agent 接入
      </section>
    </>
  );
}

export default function AppShell({ children, rail, railAfter, wide = false }: AppShellProps) {
  return (
    <div className="app-shell">
      <Header />
      <div className={`app-shell-content ${wide ? 'app-shell-content-wide' : ''}`}>
        <main className="app-main">{children}</main>
        <aside className="app-rail">{rail ?? <DefaultRail />}{railAfter}</aside>
      </div>
    </div>
  );
}
