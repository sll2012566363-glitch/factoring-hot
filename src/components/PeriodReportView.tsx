'use client';

/**
 * Shared view for weekly/monthly reports.
 * Monthly view matches the DOCX format:
 * Each part renders article cards with title/link/source/score/excerpt.
 */

const SECTION_META: Record<string, { label: string; icon: string; part: string }> = {
  section_frontier_interpretation: { label: '前沿解读', icon: '🔍', part: '第一部分' },
  section_industry_model:        { label: '行业前沿模式', icon: '🏭', part: '第二部分' },
  section_regulatory_news:       { label: '前沿监管新闻', icon: '📋', part: '第三部分' },
  section_dispute_resolution:    { label: '前沿争议解决', icon: '⚖️', part: '第四部分' },
  section_normative_documents:   { label: '前沿规范文件', icon: '📄', part: '第五部分' },
};

const CATEGORY_LABELS: Record<string, string> = {
  frontier: '前沿解读', industry_model: '行业前沿模式', regulatory: '前沿监管新闻', dispute: '前沿争议解决', normative: '前沿规范文件',
};

interface PeriodReportViewProps {
  type: 'weekly' | 'monthly';
  report: any;
}

export function PeriodReportView({ type, report }: PeriodReportViewProps) {
  if (!report) {
    return (
      <div className="text-center py-12">
        <div className="text-gray-400 text-4xl mb-3">{type === 'weekly' ? '📊' : '📰'}</div>
        <p className="text-gray-600">
          {type === 'weekly' ? '暂无周报数据' : '暂无月刊数据'}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* ─── Cover Card ─── */}
      {type === 'monthly' ? (
        <MonthlyCover report={report} />
      ) : (
        <WeeklyHeader report={report} />
      )}

      {/* ─── Monthly Overview ─── */}
      {type === 'monthly' && report.monthly_overview && (
        <MonthlyOverview overview={report.monthly_overview} />
      )}

      {/* ─── Key Insights (weekly) ─── */}
      {type === 'weekly' && report.key_insights && report.key_insights.length > 0 && (
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h3 className="text-base font-semibold text-gray-900 mb-3 flex items-center gap-2">
            <span>💡</span> 关键洞察
          </h3>
          <ul className="space-y-2">
            {report.key_insights.map((insight: string, i: number) => (
              <li key={i} className="flex items-start gap-2 text-sm text-gray-700">
                <span className="text-blue-500 mt-0.5 shrink-0">•</span>
                <span>{insight}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* ─── Five Standard Sections ─── */}
      {Object.entries(SECTION_META).map(([key, meta]) => {
        const content = report[key];
        if (!content) return null;

        return (
          <SectionBlock key={key} meta={meta} content={content} />
        );
      })}

      {/* ─── Trend Analysis (weekly) ─── */}
      {type === 'weekly' && report.trend_analysis && (
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h3 className="text-base font-semibold text-gray-900 mb-3 flex items-center gap-2">
            <span>📈</span> 趋势分析
          </h3>
          <JsonSection data={report.trend_analysis} />
        </div>
      )}
    </div>
  );
}

// ─── Sub-components ─────────────────────────────────────

function MonthlyCover({ report }: { report: any }) {
  const dateRange = report.report_date_range;
  const rangeStr = dateRange
    ? `${dateRange.start || ''} — ${dateRange.end || ''}`
    : '';

  return (
    <div className="bg-gradient-to-b from-blue-600 to-blue-800 rounded-lg text-white p-8 text-center">
      <p className="text-sm text-blue-200 mb-2 tracking-wider">北京德和衡（上海）律师事务所</p>
      <p className="text-sm text-blue-200 mb-6">金融业务中心 · 供应链研究中心</p>
      <h1 className="text-2xl font-bold mb-2 leading-relaxed">
        {report.report_title || `${report.year}年${report.month}月 保理与供应链金融行业月刊`}
      </h1>
      {rangeStr && (
        <p className="text-sm text-blue-200 mt-2">{rangeStr}</p>
      )}
      {report.executive_summary && (
        <div className="mt-6 bg-white/10 rounded-md p-4 text-left">
          <p className="text-sm text-blue-100 leading-relaxed whitespace-pre-line">
            {report.executive_summary}
          </p>
        </div>
      )}
      <div className="flex items-center justify-center gap-6 mt-6 text-xs text-blue-200">
        <span>共收录 {report.total_articles} 篇文章</span>
        {report.generated_at && (
          <span>生成于 {new Date(report.generated_at).toLocaleDateString('zh-CN')}</span>
        )}
      </div>
    </div>
  );
}

function WeeklyHeader({ report }: { report: any }) {
  const dateRange = report.report_date_range;
  const rangeStr = dateRange
    ? `${dateRange.start || ''} — ${dateRange.end || ''}`
    : '';

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-6">
      <h2 className="text-2xl font-bold text-gray-900 mb-1">
        {report.report_title || `${report.year} 年第 ${report.week_number} 周 保理周报`}
      </h2>
      {rangeStr && <p className="text-sm text-gray-500 mb-3">{rangeStr}</p>}
      {report.executive_summary && (
        <div className="bg-blue-50 border border-blue-100 rounded-md p-4 mt-3">
          <p className="text-sm text-blue-700 leading-relaxed whitespace-pre-line">
            {report.executive_summary}
          </p>
        </div>
      )}
      <div className="flex items-center gap-4 mt-4 text-xs text-gray-500">
        <span>共收录 {report.total_articles} 篇文章</span>
        {report.generated_at && (
          <span>生成于 {new Date(report.generated_at).toLocaleString('zh-CN')}</span>
        )}
      </div>
    </div>
  );
}

function MonthlyOverview({ overview }: { overview: any }) {
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-6">
      <h3 className="text-base font-semibold text-gray-900 mb-3">月度概览</h3>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-center">
        <div className="bg-blue-50 rounded-lg p-3">
          <div className="text-2xl font-bold text-blue-600">{overview.total_articles}</div>
          <div className="text-xs text-blue-500 mt-1">总文章数</div>
        </div>
        <div className="bg-green-50 rounded-lg p-3">
          <div className="text-2xl font-bold text-green-600">{overview.avg_score}</div>
          <div className="text-xs text-green-500 mt-1">平均评分</div>
        </div>
        <div className="bg-purple-50 rounded-lg p-3">
          <div className="text-2xl font-bold text-purple-600">{overview.by_category?.regulatory || 0}</div>
          <div className="text-xs text-purple-500 mt-1">监管新闻</div>
        </div>
        <div className="bg-orange-50 rounded-lg p-3">
          <div className="text-2xl font-bold text-orange-600">{overview.by_category?.dispute || 0}</div>
          <div className="text-xs text-orange-500 mt-1">争议解决</div>
        </div>
      </div>
    </div>
  );
}

function SectionBlock({ meta, content }: { meta: { label: string; icon: string; part: string }; content: any }) {
  const articles = content.articles || [];
  const subsections = content.subsections;

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-6">
      <h3 className="text-base font-semibold text-gray-900 mb-4 flex items-center gap-2">
        <span>{meta.icon}</span> {meta.label}
      </h3>

      {articles.length > 0 && <ArticleList articles={articles} />}

      {subsections && Array.isArray(subsections) && subsections.map((sub: any, i: number) => (
        <div key={i} className="mt-4">
          <h4 className="text-sm font-medium text-gray-700 mb-2 pl-2 border-l-2 border-blue-400">
            {sub.title}
          </h4>
          {sub.articles && <ArticleList articles={sub.articles} />}
        </div>
      ))}

      {articles.length === 0 && !subsections && (
        <p className="text-sm text-gray-400">暂无内容</p>
      )}
    </div>
  );
}

function ArticleList({ articles }: { articles: any[] }) {
  return (
    <div className="space-y-2">
      {articles.map((article: any, i: number) => (
        <a
          key={article.id || i}
          href={article.link}
          target="_blank"
          rel="noopener noreferrer"
          className="block group"
        >
          <div className="flex items-start gap-2 p-2 rounded hover:bg-gray-50 transition-colors">
            <span className="text-xs text-gray-400 mt-0.5 shrink-0 w-4 text-right">{i + 1}</span>
            <div className="flex-1 min-w-0">
              <div className="text-sm text-gray-800 group-hover:text-blue-600 transition-colors line-clamp-1">
                {article.title}
              </div>
              <div className="flex items-center gap-2 mt-0.5 text-xs text-gray-400">
                {article.source_name && <span>{article.source_name}</span>}
                {article.score != null && (
                  <span className="text-yellow-600">{Math.round(article.score)}分</span>
                )}
              </div>
            </div>
          </div>
        </a>
      ))}
    </div>
  );
}

function JsonSection({ data }: { data: any }) {
  if (Array.isArray(data)) {
    return (
      <ul className="space-y-2">
        {data.map((item, i) => (
          <li key={i} className="flex items-start gap-2 text-sm text-gray-700">
            <span className="text-gray-400 mt-0.5 shrink-0">•</span>
            <span>{typeof item === 'string' ? item : JSON.stringify(item)}</span>
          </li>
        ))}
      </ul>
    );
  }

  if (typeof data === 'object' && data !== null) {
    return (
      <div className="space-y-2">
        {Object.entries(data).map(([k, v]) => (
          <div key={k} className="text-sm">
            <span className="font-medium text-gray-800">{k}：</span>
            <span className="text-gray-600">{typeof v === 'string' ? v : JSON.stringify(v)}</span>
          </div>
        ))}
      </div>
    );
  }

  return null;
}

export default PeriodReportView;
