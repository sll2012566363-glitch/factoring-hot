'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { BookOpenText, Bot, CircleHelp, FileClock, FileText, Flame, History, LayoutList, MessageSquareText, Rss, Sparkles, Tags } from 'lucide-react';
import ThemeToggle from './ThemeToggle';

const CONTENT_NAV = [
  { href: '/', label: '精选', icon: Sparkles },
  { href: '/all', label: '全部动态', icon: LayoutList },
  { href: '/report', label: '行业日报', icon: FileText },
  { href: '/report/weekly', label: '周度复盘', icon: FileClock },
  { href: '/report/monthly', label: '月度观察', icon: BookOpenText },
  { href: '/topics', label: '热门话题', icon: Tags },
];

const MORE_NAV = [
  { href: '/agent', label: 'Agent 接入', icon: Bot },
  { href: '/about', label: '关于本站', icon: CircleHelp },
  { href: '/changelog', label: '更新日志', icon: History },
  { href: '/archive', label: '报告归档', icon: BookOpenText },
  { href: '/feedback', label: '反馈与纠错', icon: MessageSquareText },
];

function NavGroup({ title, items, pathname }: { title: string; items: typeof CONTENT_NAV; pathname: string }) {
  return (
    <section className="side-nav-group">
      <p>{title}</p>
      <div>
        {items.map(({ href, label, icon: Icon }) => {
          const active = href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(`${href}/`);
          return (
            <Link key={href} href={href} className={`side-nav-link ${active ? 'is-active' : ''}`}>
              <Icon size={17} strokeWidth={active ? 2.25 : 1.8} />
              <span>{label}</span>
            </Link>
          );
        })}
      </div>
    </section>
  );
}

export default function Header() {
  const pathname = usePathname();
  return (
    <>
      <header className="mobile-header">
        <Link href="/" className="brand-lockup"><span>保</span><strong>保理 HOT</strong></Link>
        <div className="mobile-header-actions"><Link href="/all" aria-label="查看全部动态"><LayoutList size={19} /></Link><ThemeToggle /></div>
      </header>
      <aside className="side-nav">
        <Link href="/" className="brand-lockup"><span>保</span><strong>保理 HOT</strong></Link>
        <p className="brand-subtitle">保理与供应链金融<br />行业情报站</p>
        <nav>
          <NavGroup title="内容" items={CONTENT_NAV} pathname={pathname} />
          <NavGroup title="接入与更多" items={MORE_NAV} pathname={pathname} />
        </nav>
        <div className="side-nav-bottom">
          <Link href="/agent" className="side-rss"><Rss size={14} /> RSS / API 开放接入</Link>
          <ThemeToggle />
          <small>Factoring HOT · since 2026</small>
        </div>
      </aside>
    </>
  );
}
