import { createClient } from '@supabase/supabase-js';
import Link from 'next/link';
import Header from '@/components/Header';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const SECTION_NAMES: Record<string, string> = {
  frontier: '前沿解读',
  industry_model: '行业前沿模式',
  regulatory: '前沿监管新闻',
  dispute: '前沿争议解决',
  normative: '前沿规范文件',
  policy: '政策动态',
  market: '市场信号',
  risk: '风险预警',
  innovation: '创新实践',
};

interface EventRecord {
  id: string;
  event_title: string;
  summary: string | null;
  category: string;
  article_count: number;
  article_ids: string[] | null;
  importance_score: number | null;
  first_seen_at: string;
  last_seen_at: string;
}

interface ArticleInfo {
  id: string;
  title: string;
  source_name: string;
}

export const dynamic = 'force-dynamic';

export default async function TopicsPage() {
  // Lookback 7 days
  const sinceDate = new Date();
  sinceDate.setDate(sinceDate.getDate() - 7);

  // Fetch events within the time window
  const { data: events, error } = await supabase
    .from('events')
    .select('*')
    .gte('first_seen_at', sinceDate.toISOString())
    .order('article_count', { ascending: false })
    .order('importance_score', { ascending: false })
    .limit(30);

  let hotTopics: Array<{
    event: EventRecord;
    articles: ArticleInfo[];
    sourceCount: number;
    sourceNames: string[];
  }> = [];

  if (events && events.length > 0) {
    // For each event, fetch related articles
    hotTopics = await Promise.all(
      events.map(async (event: EventRecord) => {
        let articles: ArticleInfo[] = [];
        let sourceCount = 0;
        let sourceNames: string[] = [];

        if (event.article_ids && event.article_ids.length > 0) {
          const { data: articleRows } = await supabase
            .from('articles')
            .select('id, title, source_name')
            .in('id', event.article_ids.slice(0, 20));

          if (articleRows) {
            articles = articleRows as ArticleInfo[];
            const uniqueSources = new Set(articles.map(a => a.source_name));
            sourceNames = Array.from(uniqueSources);
            sourceCount = sourceNames.length;
          }
        }

        return { event, articles, sourceCount, sourceNames };
      })
    );

    // Re-sort by sourceCount (primary) then importanceScore (secondary)
    hotTopics.sort((a, b) => {
      if (b.sourceCount !== a.sourceCount) return b.sourceCount - a.sourceCount;
      const scoreA = a.event.importance_score || 0;
      const scoreB = b.event.importance_score || 0;
      return scoreB - scoreA;
    });
  }

  const firstSeen = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' });
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <Header title="保理热榜" />

      <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Page header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">热门话题</h1>
            <p className="text-sm text-gray-500 mt-1">
              近 7 天多信源覆盖的高热度事件聚合
            </p>
          </div>
          <Link
            href="/"
            className="inline-flex items-center gap-2 px-4 py-2 bg-white text-gray-600 text-sm rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            返回热榜
          </Link>
        </div>

        {hotTopics.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
            <div className="text-gray-400 text-lg mb-2">暂无热门话题</div>
            <p className="text-gray-400 text-sm">近 7 天内暂无多信源覆盖的事件，请稍后再来查看</p>
          </div>
        ) : (
          <div className="space-y-6">
            {hotTopics.map(({ event, articles, sourceCount, sourceNames }, index) => (
              <div
                key={event.id}
                className="bg-white rounded-xl border border-gray-200 overflow-hidden hover:border-blue-200 transition-colors"
              >
                {/* Card header */}
                <div className="p-6 pb-4">
                  <div className="flex items-start gap-4">
                    {/* Rank badge */}
                    <div className={`flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold ${
                      index < 3
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-100 text-gray-500'
                    }`}>
                      {index + 1}
                    </div>

                    <div className="flex-1 min-w-0">
                      {/* Title */}
                      <h2 className="text-lg font-semibold text-gray-900 leading-snug mb-2">
                        {event.event_title}
                      </h2>

                      {/* Meta row */}
                      <div className="flex flex-wrap items-center gap-2 text-xs">
                        {/* Category tag */}
                        {event.category && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded bg-blue-50 text-blue-600 font-medium">
                            {SECTION_NAMES[event.category] || event.category}
                          </span>
                        )}

                        {/* Article count */}
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-gray-100 text-gray-600">
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                          </svg>
                          {event.article_count} 篇文章
                        </span>

                        {/* Source count */}
                        {sourceCount > 0 && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-green-50 text-green-600 font-medium">
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2" />
                            </svg>
                            {sourceCount} 个信源
                          </span>
                        )}

                        {/* Date range */}
                        <span className="text-gray-400">
                          {firstSeen(event.first_seen_at)} — {firstSeen(event.last_seen_at)}
                        </span>

                        {/* Importance score */}
                        {event.importance_score && event.importance_score > 0 && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded bg-yellow-50 text-yellow-700 font-medium">
                            {Math.round(event.importance_score)} 分
                          </span>
                        )}
                      </div>

                      {/* Summary */}
                      {event.summary && (
                        <p className="mt-3 text-sm text-gray-600 leading-relaxed">
                          {event.summary}
                        </p>
                      )}

                      {/* Source names */}
                      {sourceNames.length > 0 && (
                        <div className="mt-2 text-xs text-gray-400">
                          信源：{sourceNames.join('、')}
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Related articles */}
                {articles.length > 0 && (
                  <div className="border-t border-gray-100 px-6 py-4 bg-gray-50/50">
                    <div className="text-xs font-medium text-gray-500 mb-2">相关文章</div>
                    <ul className="space-y-1.5">
                      {articles.slice(0, 8).map(article => (
                        <li key={article.id}>
                          <Link
                            href={`/article/${article.id}`}
                            className="flex items-center gap-2 text-sm text-gray-700 hover:text-blue-600 transition-colors group"
                          >
                            <span className="w-1 h-1 rounded-full bg-gray-300 group-hover:bg-blue-400 flex-shrink-0" />
                            <span className="truncate">{article.title}</span>
                            <span className="text-xs text-gray-400 flex-shrink-0 ml-auto hidden sm:inline">
                              {article.source_name}
                            </span>
                          </Link>
                        </li>
                      ))}
                    </ul>
                    {articles.length > 8 && (
                      <div className="mt-2 text-xs text-gray-400">
                        还有 {articles.length - 8} 篇相关文章...
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
