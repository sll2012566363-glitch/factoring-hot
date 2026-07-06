'use client';

/**
 * Shared view for weekly/monthly reports.
 * Monthly view matches the DOCX format:
 *   Cover → Editorial Board → Center Intro → 5 Parts
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

      {/* ─── Editorial Board (monthly) ─── */}
      {type === 'monthly' && report.editorial_board && (
        <EditorialBoard board={report.editorial_board} />
      )}

      {/* ─── Center Introduction (monthly) ─── */}
      {type === 'monthly' && report.center_intro && (
        <CenterIntro intro={report.center_intro} />
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

      {/* ─── Expert Opinions (monthly) ─── */}
      {type === 'monthly' && report.expert_opinions && (
        <ExpertOpinions opinions={report.expert_opinions} />
      )}

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

function EditorialBoard({ board }: { board: any }) {
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-6">
      <h3 className="text-base font-semibold text-gray-900 mb-4 flex items-center gap-2">
        <span>👥</span> 编委会名单
      </h3>
      <div className="space-y-3 text-sm">
        {board.chief_editor && (
          <div>
            <span className="font-medium text-gray-800">主编：</span>
            <span className="text-gray-700">{board.chief_editor}</span>
          </div>
        )}
        {board.chief_editor_title && (
          <p className="text-xs text-gray-500 ml-12">{board.chief_editor_title}</p>
        )}
        {board.deputy_editors && Array.isArray(board.deputy_editors) && (
          <div>
            <span className="font-medium text-gray-800">副主编：</span>
            <span className="text-gray-700">{board.deputy_editors.join('  ')}</span>
          </div>
        )}
        {board.editorial_members && Array.isArray(board.editorial_members) && (
          <div>
            <span className="font-medium text-gray-800">编辑成员：</span>
            <span className="text-gray-700">{board.editorial_members.join('  ')}</span>
          </div>
        )}
        {board.contact && (
          <div className="text-xs text-gray-500 pt-1 border-t border-gray-100">
            联系电话：{board.contact}
          </div>
        )}
      </div>
    </div>
  );
}

function CenterIntro({ intro }: { intro: any }) {
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-6">
      <h3 className="text-base font-semibold text-gray-900 mb-3 flex items-center gap-2">
        <span>🏛️</span> {intro.name || '研究中心简介'}
      </h3>
      {intro.description && (
        <p className="text-sm text-gray-700 leading-relaxed mb-3">{intro.description}</p>
      )}
      {intro.service_model && (
        <div className="bg-gray-50 rounded-md p-3 text-sm">
          <span className="font-medium text-gray-800">服务模式：</span>
          <span className="text-gray-600">{intro.service_model}</span>
        </div>
      )}
    </div>
  );
}

function MonthlyOverview({ overview }: { overview: any }) {
  const categories = overview.by_category;
  const total = overview.total_articles || 0;

  const bars = [
    { key: 'frontier', label: '前沿解读', color: 'bg-indigo-500' },
    { key: 'industry_model', label: '行业前沿模式', color: 'bg-green-500' },
    { key: 'regulatory', label: '前沿监管新闻', color: 'bg-blue-500' },
    { key: 'dispute', label: '前沿争议解决', color: 'bg-orange-500' },
    { key: 'normative', label: '前沿规范文件', color: 'bg-purple-500' },
  ];

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-6">
      <h3 className="text-base font-semibold text-gray-900 mb-4 flex items-center gap-2">
        <span>📊</span> 月度概览
      </h3>

      {/* Category distribution bars */}
      {categories && (
        <div className="space-y-2 mb-4">
          {bars.map(({ key, label, color }) => {
            const count = categories[key] || 0;
            const pct = total > 0 ? Math.round((count / total) * 100) : 0;
            return (
              <div key={key} className="flex items-center gap-3">
                <span className="text-xs text-gray-600 w-16 shrink-0">{label}</span>
                <div className="flex-1 bg-gray-100 rounded-full h-5 overflow-hidden">
                  <div
                    className={`${color} h-full rounded-full transition-all`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <span className="text-xs text-gray-500 w-16 text-right shrink-0">
                  {count} 篇 ({pct}%)
                </span>
              </div>
            );
          })}
        </div>
      )}

      {/* Stats row */}
      <div className="flex items-center gap-4 text-xs text-gray-500 pt-3 border-t border-gray-100">
        <span>总计 {total} 篇</span>
        {overview.avg_score != null && <span>平均评分 {overview.avg_score}</span>}
      </div>
    </div>
  );
}

function SectionBlock({ meta, content }: { meta: { label: string; icon: string; part: string }; content: any }) {
  // Handle subsections (e.g., regulatory news has national + regional)
  const hasSubsections = content.subsections && Array.isArray(content.subsections);
  const directArticles = extractArticles(content);

  // Skip empty sections
  if (!hasSubsections && directArticles.length === 0 && !content.articles) return null;

  return (
    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
      {/* Section header */}
      <div className="bg-gray-50 px-6 py-4 border-b border-gray-200">
        <h3 className="text-base font-bold text-gray-900 flex items-center gap-2">
          <span>{meta.icon}</span>
          <span className="text-xs text-gray-400 font-normal">{meta.part}：</span>
          {meta.label}
        </h3>
      </div>

      <div className="p-6">
        {/* Sub-sections (regulatory news) */}
        {hasSubsections && content.subsections.map((sub: any, i: number) => {
          const subArticles = extractArticles(sub);
          if (subArticles.length === 0) return null;
          return (
            <div key={i} className={i > 0 ? 'mt-6' : ''}>
              <h4 className="text-sm font-semibold text-gray-800 mb-3 pb-2 border-b border-gray-100">
                {sub.title}
              </h4>
              <ArticleList articles={subArticles} />
            </div>
          );
        })}

        {/* Direct articles */}
        {!hasSubsections && directArticles.length > 0 && (
          <ArticleList articles={directArticles} />
        )}
      </div>
    </div>
  );
}

function ArticleList({ articles }: { articles: any[] }) {
  return (
    <div className="space-y-4">
      {articles.map((article, i) => (
        <ArticleCard key={article.id || i} article={article} index={i + 1} />
      ))}
    </div>
  );
}

function ArticleCard({ article, index }: { article: any; index: number }) {
  const score = article.score;
  const scoreColor = score >= 85 ? 'text-red-600 bg-red-50' :
    score >= 70 ? 'text-orange-600 bg-orange-50' :
    'text-gray-600 bg-gray-50';

  return (
    <div className="border border-gray-100 rounded-md p-4 hover:border-blue-200 transition-colors">
      <div className="flex items-start gap-3">
        {/* Index number */}
        <span className="shrink-0 w-6 h-6 rounded-full bg-blue-600 text-white text-xs flex items-center justify-center font-medium mt-0.5">
          {index}
        </span>

        <div className="flex-1 min-w-0">
          {/* Title + Score */}
          <div className="flex items-start justify-between gap-2 mb-1">
            {article.link ? (
              <a
                href={article.link}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm font-medium text-gray-900 hover:text-blue-600 transition-colors leading-relaxed"
              >
                {article.title}
              </a>
            ) : (
              <h5 className="text-sm font-medium text-gray-900 leading-relaxed">
                {article.title}
              </h5>
            )}
            {score != null && (
              <span className={`shrink-0 text-xs font-medium px-2 py-0.5 rounded-full ${scoreColor}`}>
                {score}分
              </span>
            )}
          </div>

          {/* Meta line */}
          <div className="flex items-center gap-3 text-xs text-gray-500 mt-1">
            {article.source_name && <span>{article.source_name}</span>}
            {article.pub_date && (
              <span>{new Date(article.pub_date).toLocaleDateString('zh-CN')}</span>
            )}
            {article.category && (
              <span className="text-blue-500">
                {CATEGORY_LABELS[article.category] || article.category}
              </span>
            )}
          </div>

          {/* Excerpt */}
          {article.excerpt && (
            <p className="text-xs text-gray-600 leading-relaxed mt-2 line-clamp-2">
              {article.excerpt}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function ExpertOpinions({ opinions }: { opinions: any }) {
  const items = Array.isArray(opinions) ? opinions : [];
  if (items.length === 0) return null;

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-6">
      <h3 className="text-base font-semibold text-gray-900 mb-4 flex items-center gap-2">
        <span>🎓</span> 专家推荐
      </h3>
      <div className="space-y-4">
        {items.map((op: any, i: number) => (
          <div key={i} className="border border-gray-100 rounded-md p-4">
            <div className="flex items-start justify-between gap-2 mb-2">
              <h4 className="text-sm font-medium text-gray-900">{op.title}</h4>
              {op.score != null && (
                <span className="shrink-0 text-xs font-medium px-2 py-0.5 rounded-full bg-red-50 text-red-600">
                  {op.score}分
                </span>
              )}
            </div>
            {op.source && (
              <p className="text-xs text-gray-500 mb-2">{op.source}</p>
            )}
            {op.opinion && (
              <p className="text-xs text-gray-600 leading-relaxed">{op.opinion}</p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Utility ──────────────────────────────────────────

function extractArticles(content: any): any[] {
  if (!content) return [];
  if (Array.isArray(content.articles)) return content.articles;
  if (Array.isArray(content)) return content;
  return [];
}

/** Renders raw JSONB content — handles objects, arrays, and strings (fallback) */
function JsonSection({ data }: { data: any }) {
  if (typeof data === 'string') {
    return <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-line">{data}</p>;
  }

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
