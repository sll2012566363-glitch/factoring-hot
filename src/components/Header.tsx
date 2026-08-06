'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Archive, BookOpenText, Bot, CircleHelp, FileClock, FileText, History, LayoutList, MessageSquareText, Rss, Search, Sparkles, Tags } from 'lucide-react';
import ThemeToggle from './ThemeToggle';

const CONTENT_NAV = [
  { href: '/', label: '编辑精选', icon: Sparkles },
  { href: '/all', label: '实时动态', icon: LayoutList },
  { href: '/topics', label: '主题追踪', icon: Tags },
];

const INSIGHT_NAV = [
  { href: '/report', label: '行业日报', icon: FileText },
  { href: '/report/weekly', label: '周度复盘', icon: FileClock },
  { href: '/report/monthly', label: '月度观察', icon: BookOpenText },
  { href: '/archive', label: '报告归档', icon: Archive },
];

const MORE_NAV = [
  { href: '/agent', label: 'Agent 接入', icon: Bot },
  { href: '/about', label: '关于本站', icon: CircleHelp },
  { href: '/changelog', label: '更新日志', icon: History },
  { href: '/feedback', label: '反馈与纠错', icon: MessageSquareText },
];

function NavGroup({ title, items, pathname }: { title: string; items: Array<{ href: string; label: string; icon: typeof Sparkles }>; pathname: string }) {
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
          <NavGroup title="行业洞察" items={INSIGHT_NAV} pathname={pathname} />
          <NavGroup title="接入与更多" items={MORE_NAV} pathname={pathname} />
        </nav>
        <div className="side-nav-bottom">
          <Link href="/agent" className="side-rss"><Rss size={14} /> RSS / API 开放接入</Link>
          <div className="side-nav-tools"><Link href="/all" aria-label="搜索实时动态"><Search size={14} /> 搜索资料库</Link><ThemeToggle /></div>
          <small>Factoring HOT · since 2026</small>
        </div>
      </aside>
    </>
  );
}
