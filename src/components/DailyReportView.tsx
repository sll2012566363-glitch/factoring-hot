'use client';

import { Article, DailyReport, ReportSection } from '@/types';

type DailySection = ReportSection & { tier?: string; signals?: string[] };

function ReportSectionView({ section }: { section: DailySection }) {
  const { id, name, articles, maxItems = 5 } = section;
  if (id === 'today_signals') {
    if (!section.signals?.length) return null;
    return <section className="rounded-2xl border border-amber-200 bg-amber-50 p-5 sm:p-6"><p className="text-xs font-semibold tracking-[0.14em] text-amber-700">TODAY&apos;S SIGNALS</p><h3 className="mt-1 text-lg font-semibold text-slate-950">今日信号</h3><div className="mt-3 flex flex-wrap gap-2">{section.signals.map((signal) => <span key={signal} className="rounded-full bg-white px-3 py-1.5 text-sm text-slate-700 shadow-sm">{signal}</span>)}</div></section>;
  }
  if (!articles.length) return null;

  const meta = id === 'must_read'
    ? { eyebrow: 'EDITOR\'S PICK', note: '终审入选、正文可读、至少具备两类行业价值信号', style: 'border-sky-200 bg-sky-50/50' }
    : id === 'review_signals' || id === 'source_signals'
      ? { eyebrow: 'REVIEW SIGNALS', note: '正文已可读，但尚未完成最终评分；保留供研究人员复核', style: 'border-amber-200 bg-amber-50/60' }
      : id === 'recent_highlights'
        ? { eyebrow: 'LAST 7 DAYS', note: '今日样本不足时保留的近期终审可读内容', style: 'border-slate-200 bg-white' }
      : { eyebrow: 'INDUSTRY UPDATES', note: '已完成终审的行业资讯，点击查看原文', style: 'border-slate-200 bg-white' };

  return <section className={`rounded-2xl border p-5 sm:p-6 ${meta.style}`}>
    <div className="flex items-end justify-between gap-4"><div><p className="text-xs font-semibold tracking-[0.14em] text-sky-700">{meta.eyebrow}</p><h3 className="mt-1 text-xl font-semibold text-slate-950">{name}</h3><p className="mt-1 text-xs text-slate-500">{meta.note}</p></div><span className="shrink-0 text-xs text-slate-400">{articles.length} 篇</span></div>
    <div className="mt-4 divide-y divide-slate-200/80">{articles.slice(0, maxItems).map((article) => <a key={article.id} href={article.link} target="_blank" rel="noopener noreferrer" className="group block py-3 first:pt-0 last:pb-0"><p className="text-sm font-medium leading-6 text-slate-800 transition-colors group-hover:text-sky-700">{article.title}</p><div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-400"><span>{article.source_name}</span>{article.pub_date && <span>{String(article.pub_date).slice(0, 10)}</span>}{id !== 'source_signals' && article.score != null && <span className="text-amber-700">{Math.round(article.score)} 分</span>}</div>{article.excerpt && <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-500">{article.excerpt}</p>}</a>)}</div>
  </section>;
}

interface DailyReportViewProps {
  report: DailyReport | null;
  articlesBySection: Record<string, Article[]>;
}

export function DailyReportView({ report, articlesBySection }: DailyReportViewProps) {
  if (!report) return <div className="rounded-2xl border border-dashed border-slate-300 bg-white py-16 text-center"><p className="text-sm font-medium text-slate-700">今日日报尚未生成</p><p className="mt-2 text-xs text-slate-400">系统完成筛选后会自动生成；不以泛财经内容凑数。</p></div>;

  const selectedCount = report.sections.filter(section => section.id === 'must_read' || section.id === 'industry_updates').reduce((sum, section) => sum + (articlesBySection[section.id] || section.articles || []).length, 0);
  const reviewCount = (articlesBySection.review_signals || report.sections.find(section => section.id === 'review_signals')?.articles || []).length;
  const reportArticles = report.sections.flatMap(section => section.articles || []);
  const beijingDate = (value: string) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(value));
  const todayCount = reportArticles.filter(article => article.pub_date && beijingDate(article.pub_date) === report.report_date).length;
  const recentCount = Math.max(0, reportArticles.length - todayCount);

  return <article className="space-y-5 pb-10">
    <section className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6"><p className="text-xs font-semibold tracking-[0.14em] text-sky-700">DAILY BRIEFING</p><h2 className="mt-1 text-2xl font-semibold text-slate-950">{report.report_title || `${report.report_date} 保理日报`}</h2>{report.executive_summary && <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600">{report.executive_summary}</p>}<div className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-400"><span>本期展示 {report.total_articles} 篇</span><span className="text-sky-700">今日新增 {todayCount} 篇</span>{recentCount ? <span>近期精选 {recentCount} 篇</span> : null}<span>终审精选 {selectedCount} 篇</span>{reviewCount ? <span className="text-amber-700">待复核 {reviewCount} 篇</span> : null}<span className={report.is_stale ? 'text-amber-700' : ''}>{report.is_stale ? `当前展示 ${report.report_date} 的最近一期` : `生成于 ${new Date(report.generated_at).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false })}`}</span></div></section>
    {report.sections.map((section) => <ReportSectionView key={section.id} section={{ ...section, articles: articlesBySection[section.id] || section.articles || [] }} />)}
  </article>;
}

export default DailyReportView;
