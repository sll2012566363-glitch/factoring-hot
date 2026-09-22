'use client';

import { ArrowUpRight } from 'lucide-react';
import { Article, DailyReport, ReportSection } from '@/types';

type DailySection = ReportSection & { tier?: string; signals?: string[] };

// 每个板块对应一个主题色（非图片横幅，改用网站品牌色系的 CSS 渐变横幅）
const SECTION_THEMES: Record<string, { accent: string; soft: string }> = {
  must_read: { accent: '#c41230', soft: '#fdf0f3' },
  industry_updates: { accent: '#2b40ab', soft: '#eef1fc' },
  regulatory: { accent: '#002c68', soft: '#e6ecf7' },
  dispute: { accent: '#c41230', soft: '#fdf0f3' },
  normative: { accent: '#2b40ab', soft: '#eef1fc' },
  review_signals: { accent: '#b45309', soft: '#fdf6e9' },
  source_signals: { accent: '#b45309', soft: '#fdf6e9' },
};

const SIGNALS_SECTION_IDS = new Set(['today_signals', 'review_signals', 'source_signals']);

function sectionTitleOf(id: string): string {
  if (id === 'must_read') return '今日必读';
  if (id === 'industry_updates') return '行业动态';
  if (id === 'review_signals') return '待复核线索';
  if (id === 'source_signals') return '来源信号';
  if (id === 'recent_highlights') return '近期精选';
  return '今日动态';
}

function ReportSectionView({ section }: { section: DailySection }) {
  const { id, name, articles, maxItems = 5 } = section;

  // 今日信号：一组彩色标签徽章，作日报顶部概览
  if (id === 'today_signals') {
    if (!section.signals?.length) return null;
    return (
      <section className="daily-banner daily-banner-signals">
        <div className="daily-banner-title">
          <span className="daily-pill">今日信号</span>
          <span className="daily-banner-note">signal of the day</span>
        </div>
        <div className="daily-signal-list">
          {section.signals.map((signal) => (
            <span key={signal} className="daily-signal">{signal}</span>
          ))}
        </div>
      </section>
    );
  }
  if (!articles.length) return null;

  const theme = SECTION_THEMES[id] || SECTION_THEMES.industry_updates;
  const isSignal = SIGNALS_SECTION_IDS.has(id);
  const title = sectionTitleOf(id);

  return (
    <section className="daily-block">
      {/* 板块横幅标题（CSS 渐变，非图片，符合网站品牌色） */}
      <header className="daily-block-head" style={{ borderLeftColor: theme.accent }}>
        <div>
          <h3 className="daily-block-title" style={{ color: theme.accent }}>{title}</h3>
          <p className="daily-block-note">
            {id === 'must_read'
              ? '终审入选、正文可读、具备行业价值信号'
              : isSignal
                ? '正文已可读但尚未完成最终评分，保留供复核'
                : '已完成终审的行业资讯，点击查看原文'}
          </p>
        </div>
        <span className="daily-count">{articles.length} 篇</span>
      </header>

      {/* 日报式圆点条目列表 */}
      <div className="daily-list">
        {articles.slice(0, maxItems).map((article) => (
          <a key={article.id} href={article.link} target="_blank" rel="noopener noreferrer" className="daily-entry group">
            <span className="daily-entry-dot" style={{ background: theme.accent }} aria-hidden />
            <div className="daily-entry-main">
              <p className="daily-entry-title group-hover:text-[color:var(--brand)]">
                {article.title}
              </p>
              {article.excerpt && <p className="daily-entry-excerpt">{article.excerpt}</p>}
              <div className="daily-entry-meta">
                <span>{article.source_name}</span>
                {article.pub_date && <span>{String(article.pub_date).slice(0, 10)}</span>}
                {!isSignal && article.score != null && <span style={{ color: theme.accent }}>{Math.round(article.score)} 分</span>}
                <ArrowUpRight size={13} className="daily-entry-arrow" />
              </div>
            </div>
          </a>
        ))}
      </div>
    </section>
  );
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
  const title = report.report_title || `${report.report_date} 保理日报`;

  return (
    <article className="daily-paper space-y-6 pb-10">
      {/* 刊头：日期标题 + 办报说明（对齐微信日报，但用网站视觉） */}
      <header className="daily-masthead">
        <p className="page-eyebrow">Daily Briefing · 保理日报</p>
        <h2 className="daily-masthead-title">{title}</h2>
        <p className="daily-masthead-source">来源：各地金融监管官网及互联网公开信息 · 本平台归类整理</p>
        {report.executive_summary && <p className="daily-masthead-lead">{report.executive_summary}</p>}
        <div className="daily-masthead-meta">
          <span>本期展示 <strong>{report.total_articles}</strong> 篇</span>
          <span className="text-[color:var(--brand)]">今日新增 {todayCount} 篇</span>
          {recentCount ? <span>近期精选 {recentCount} 篇</span> : null}
          <span>终审精选 {selectedCount} 篇</span>
          {reviewCount ? <span className="text-[color:var(--red)]">待复核 {reviewCount} 篇</span> : null}
          <span className={report.is_stale ? 'text-[color:var(--red)]' : ''}>{report.is_stale ? `当前展示 ${report.report_date} 的最近一期` : `生成于 ${new Date(report.generated_at).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false })}`}</span>
        </div>
      </header>

      {report.sections.map((section) => (
        <ReportSectionView key={section.id} section={{ ...section, articles: articlesBySection[section.id] || section.articles || [] }} />
      ))}
    </article>
  );
}

export default DailyReportView;