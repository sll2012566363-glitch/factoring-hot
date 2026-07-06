'use client';

import { Article, DailyReport, ReportSection } from '@/types';

function ReportSectionView({ title, icon, articles, maxItems = 5 }: {
  title: string;
  icon: string;
  articles: Article[];
  maxItems?: number;
}) {
  return (
    <div className="mb-6">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-lg">{icon}</span>
        <h3 className="text-base font-semibold text-gray-900">{title}</h3>
        <span className="text-xs text-gray-500">
          {articles.length} 条
        </span>
      </div>
      
      <div className="space-y-2">
        {articles.slice(0, maxItems).map((article) => (
          <a
            key={article.id}
            href={article.link}
            target="_blank"
            rel="noopener noreferrer"
            className="block text-sm text-gray-700 hover:text-blue-600 hover:bg-blue-50 p-2 rounded transition-colors"
          >
            <span className="line-clamp-1">{article.title}</span>
          </a>
        ))}
      </div>
    </div>
  );
}

interface DailyReportViewProps {
  report: DailyReport | null;
  articlesBySection: Record<string, Article[]>;
}

export function DailyReportView({ report, articlesBySection }: DailyReportViewProps) {
  if (!report) {
    return (
      <div className="text-center py-12">
        <div className="text-gray-400 text-4xl mb-3">📋</div>
        <p className="text-gray-600">今日日报尚未生成</p>
      </div>
    );
  }
  
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-6">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-900 mb-2">
          {report.report_title || `${report.report_date} 保理日报`}
        </h2>
        {report.executive_summary && (
          <p className="text-sm text-gray-600 mb-2">{report.executive_summary}</p>
        )}
        <p className="text-sm text-gray-500">
          共收录 {report.total_articles} 篇文章
        </p>
      </div>
      
      <div className="space-y-6">
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
    </div>
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
