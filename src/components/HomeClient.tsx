'use client';

import Link from 'next/link';
import { ArrowUpRight, Search, Sparkles } from 'lucide-react';
import { useMemo, useState } from 'react';
import AppShell from '@/components/AppShell';
import DateGroup from '@/components/DateGroup';
import { Article } from '@/types';

const sections = [
  { id: 'frontier', name: '深度解读' },
  { id: 'industry_model', name: '业务与市场' },
  { id: 'regulatory', name: '监管政策' },
  { id: 'dispute', name: '风险与争议' },
  { id: 'normative', name: '规范文件' },
];

const SECTION_NAMES: Record<string, string> = {
  frontier: '深度解读', industry_model: '业务与市场', regulatory: '监管政策', dispute: '风险与争议', normative: '规范文件',
};

const BEIJING_TIME_ZONE = 'Asia/Shanghai';

function beijingDateParts(dateStr: string) {
  const parts = new Intl.DateTimeFormat('zh-CN', { timeZone: BEIJING_TIME_ZONE, year: 'numeric', month: 'numeric', day: 'numeric', weekday: 'short' }).formatToParts(new Date(dateStr));
  const value = (type: string) => parts.find(part => part.type === type)?.value || '';
  return { year: value('year'), month: value('month'), day: value('day'), weekday: value('weekday') };
}

function beijingDateKey(dateStr: string) {
  const date = beijingDateParts(dateStr);
  return `${date.year}-${date.month.padStart(2, '0')}-${date.day.padStart(2, '0')}`;
}

function formatDateLabel(dateStr: string): string {
  const date = beijingDateParts(dateStr);
  const todayKey = beijingDateKey(new Date().toISOString());
  const targetKey = beijingDateKey(dateStr);
  const diffDays = Math.round((Date.parse(`${todayKey}T00:00:00+08:00`) - Date.parse(`${targetKey}T00:00:00+08:00`)) / 86400000);
  const monthDay = `${date.month}月${date.day}日`;
  if (diffDays === 0) return `今天 · ${monthDay} ${date.weekday}`;
  if (diffDays === 1) return `昨天 · ${monthDay} ${date.weekday}`;
  return `${monthDay} ${date.weekday}`;
}

function groupByDate(articles: Article[]) {
  const groups = new Map<string, Article[]>();
  articles.forEach(article => {
    const key = beijingDateKey(article.pub_date);
    groups.set(key, [...(groups.get(key) || []), article]);
  });
  return Array.from(groups.entries()).sort((a, b) => b[0].localeCompare(a[0])).map(([key, items]) => ({
    label: formatDateLabel(key), articles: items.sort((a, b) => (b.score || 0) - (a.score || 0)),
  }));
}

export default function HomeClient({ initialArticles, sourceBriefs, lastFetchedAt }: { initialArticles: Article[]; sourceBriefs: Article[]; lastFetchedAt: string | null }) {
  const [selectedSection, setSelectedSection] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const focus = useMemo(() => {
    const today = beijingDateKey(new Date().toISOString());
    const todayArticles = initialArticles.filter(article => beijingDateKey(article.pub_date) === today);
    return [...(todayArticles.length ? todayArticles : initialArticles)].sort((a, b) => (b.score || 0) - (a.score || 0))[0];
  }, [initialArticles]);
  const filteredArticles = useMemo(() => initialArticles.filter(article => {
    if (selectedSection && article.category !== selectedSection) return false;
    if (!searchQuery.trim()) return true;
    const q = searchQuery.trim().toLowerCase();
    return article.title?.toLowerCase().includes(q) || article.excerpt?.toLowerCase().includes(q) || article.source_name?.toLowerCase().includes(q);
  }), [initialArticles, selectedSection, searchQuery]);
  const dateGroups = useMemo(() => groupByDate(filteredArticles), [filteredArticles]);

  const rail = (
    <>
      <section className="rail-card rail-subscribe">
        <span className="rail-kicker"><Sparkles size={13} /> 本站定位</span>
        <h2>每天五分钟，<br />掌握行业变量。</h2>
        <p>只保留与保理、应收账款和供应链金融真正有关的信号。</p>
      </section>
      {focus && <section className="rail-card"><span className="rail-kicker">当前焦点</span><Link href={`/article/${focus.id}`} className="block mt-3 text-[13px] font-semibold leading-6 hover:text-[var(--brand)]">{focus.title}</Link><p className="mt-2">{focus.source_name} · {Math.round(focus.score || 0)} 分</p></section>}
      <section className="rail-card"><span className="rail-kicker">继续阅读</span><Link href="/topics" className="rail-link">查看多信源热点 <ArrowUpRight size={14} /></Link><Link href="/report" className="rail-link">阅读今日行业日报 <ArrowUpRight size={14} /></Link></section>
    </>
  );

  return (
    <AppShell rail={rail}>
      <header className="page-intro">
        <p className="page-eyebrow">精选 · 行业情报</p>
        <h1 className="page-title">今天，什么值得关注？</h1>
        <p className="page-description">只展示已收录完整正文的行业情报；未达到全文标准的内容会明确作为原文线索分流。</p>
      </header>

      <section className="realtime-strip" aria-label="实时采集状态">
        <span className="realtime-dot" />
        <strong>实时采集</strong>
        <span>{lastFetchedAt ? `最近抓取 ${new Intl.DateTimeFormat('zh-CN', { timeZone: BEIJING_TIME_ZONE, hour: '2-digit', minute: '2-digit' }).format(new Date(lastFetchedAt))}` : '等待首次抓取'}</span>
        <span>精选 {initialArticles.length} 篇</span>
        {sourceBriefs.length > 0 && <span>待核实线索 {sourceBriefs.length} 条</span>}
      </section>

      {focus && <section className="hero-focus">
        <span className="hero-focus-label"><Sparkles size={14} /> 今日行业焦点</span>
        <h2><Link href={`/article/${focus.id}`}>{focus.title}</Link></h2>
        <p>{focus.ai_reason || focus.excerpt || focus.content || '多源行业信息正在持续汇集。'}</p>
        <div className="hero-focus-meta"><span><strong>{focus.source_name}</strong></span><span>{Math.round(focus.score || 0)} 分关注度</span><Link href={`/article/${focus.id}`}>查看解读 <ArrowUpRight size={13} /></Link></div>
      </section>}

      <section className="feed-toolbar">
        <div className="feed-tabs">
          <button onClick={() => setSelectedSection(null)} className={`feed-tab ${selectedSection === null ? 'active' : ''}`}>全部</button>
          {sections.map(section => <button key={section.id} onClick={() => setSelectedSection(section.id)} className={`feed-tab ${selectedSection === section.id ? 'active' : ''}`}>{section.name}</button>)}
        </div>
        <label className="feed-search"><Search size={14} /><input value={searchQuery} onChange={event => setSearchQuery(event.target.value)} placeholder="搜索标题、来源…" /></label>
      </section>

      <section aria-label="最新精选">
        {dateGroups.length ? dateGroups.map(group => <DateGroup key={group.label} dateLabel={group.label} articles={group.articles} categoryMap={SECTION_NAMES} />) : <div className="py-16 text-center text-sm text-[var(--muted)]">未找到匹配内容，试试调整筛选条件。</div>}
      </section>
      {sourceBriefs.length > 0 && <section className="source-briefs" aria-label="原文线索">
        <div className="source-briefs-head"><div><p className="page-eyebrow">Source signals</p><h2 className="section-title">原文线索</h2></div><p>未达到站内全文标准，避免跳转空壳详情。</p></div>
        {sourceBriefs.map(article => <article className="source-brief" key={article.id}><div><span>{article.source_name}</span><h3><a href={article.link} target="_blank" rel="noopener noreferrer">{article.title}</a></h3><p>{article.excerpt || article.content || '请查看原始链接。'}</p></div><a href={article.link} target="_blank" rel="noopener noreferrer" aria-label={`查看 ${article.title} 原文`}><ArrowUpRight size={17} /></a></article>)}
      </section>}
      <p className="mt-8 text-center text-xs text-[var(--muted)]">当前显示 {filteredArticles.length} 篇 · 资讯由多个公开信源采集，引用请以原文为准</p>
    </AppShell>
  );
}
