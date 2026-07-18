'use client';

import { Article, DailyReport, ReportSection } from '@/types';

function ReportSectionView({ title, icon, articles, maxItems = 5 }: {
  title: string;
  icon: string;
  articles: Article[];
  maxItems?: number;
}) {
  return (
    <section className="report-section">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-lg">{icon}</span>
        <h3 className="section-title">{title}</h3>
        <span className="text-xs text-[var(--muted)]">
          {articles.length} 条
        </span>
      </div>
      
      <div>
        {articles.slice(0, maxItems).map((article) => (
          <a
            key={article.id}
            href={article.link}
            target="_blank"
            rel="noopener noreferrer"
            className="block text-sm text-[var(--ink)] hover:text-[var(--brand)] transition-colors"
          >
            <span className="line-clamp-1">{article.title}</span>
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
  if (!report) {
    return (
      <div className="report-paper text-center py-12">
        <div className="text-[var(--muted)] text-4xl mb-3">📋</div>
        <p className="text-[var(--muted)]">今日日报尚未生成</p>
      </div>
    );
  }
  
  return (
    <article className="report-paper">
      <div className="mb-6">
        <h2 className="text-2xl font-bold mb-2">
          {report.report_title || `${report.report_date} 保理日报`}
        </h2>
        {report.executive_summary && (
          <p className="text-sm text-[var(--muted)] leading-relaxed mb-2">{report.executive_summary}</p>
        )}
        <p className="text-sm text-[var(--muted)]">
          共收录 {report.total_articles} 篇文章
        </p>
      </div>
      
      <div>
        {report.sections.map((section) => (
          <ReportSectionView
            key={section.id}
            title={section.name}
            icon={getSectionIcon(section.id)}
            articles={articlesBySection[section.id] || section.articles || []}
            maxItems={section.maxItems}
          />
        ))}
      </div>
    </article>
  );
}

function getSectionIcon(sectionId: string): string {
  const icons: Record<string, string> = {
    top_stories: '🔥',
    frontier: '🔍',
    industry_model: '🏭',
    regulatory: '📋',
    dispute: '⚖️',
    normative: '📄',
    depth: '🔍',
  };
  return icons[sectionId] || '📰';
}

export default DailyReportView;
