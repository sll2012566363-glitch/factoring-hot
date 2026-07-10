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
};

interface ClusterRecord {
  id: string;
  primary_article_id: string;
  primary_title: string;
  primary_excerpt: string | null;
  primary_score: number | null;
  primary_link: string;
  primary_source: string;
  primary_category: string;
  related_article_ids: string[];
  related_count: number;
  source_count: number;
  unique_sources: string[];
  max_score: number;
  avg_score: number;
  cluster_date: string;
}

interface RelatedArticle {
  id: string;
  title: string;
  source_name: string;
  score: number | null;
}

export const dynamic = 'force-dynamic';

export default async function TopicsPage() {
  // Fetch clusters from last 14 days, sorted by source_count then max_score
  const { data: clusters, error } = await supabase
    .from('topic_clusters')
    .select('*')
    .gte('cluster_date', new Date(Date.now() - 14 * 86400000).toISOString().split('T')[0])
    .order('source_count', { ascending: false })
    .order('max_score', { ascending: false })
    .limit(30);

  let hotTopics: Array<{
    cluster: ClusterRecord;
    relatedArticles: RelatedArticle[];
  }> = [];

  if (clusters && clusters.length > 0) {
    // Only fetch related articles for clusters that have them
    hotTopics = await Promise.all(
      clusters.map(async (cluster: ClusterRecord) => {
        let relatedArticles: RelatedArticle[] = [];

        if (cluster.related_article_ids && cluster.related_article_ids.length > 0) {
          const { data: rows } = await supabase
            .from('articles')
            .select('id, title, source_name, score')
            .in('id', cluster.related_article_ids.slice(0, 10));

          if (rows) {
            relatedArticles = (rows as RelatedArticle[]).sort(
              (a, b) => (b.score || 0) - (a.score || 0)
            );
          }
        }

        return { cluster, relatedArticles };
      })
    );

    // Filter out single-article "clusters" with no real multi-source coverage
    // but keep them if source_count >= 2
    hotTopics = hotTopics.filter(
      ({ cluster }) => cluster.source_count >= 2 || cluster.related_count >= 1
    );
  }

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
  };

  const scoreColor = (score: number) => {
    if (score >= 80) return 'bg-red-50 text-red-600';
    if (score >= 60) return 'bg-orange-50 text-orange-600';
    if (score >= 40) return 'bg-yellow-50 text-yellow-700';
    return 'bg-gray-100 text-gray-500';
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
              近 14 天多信源覆盖的高热度事件聚合，按信源数量和评分排序
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
            <p className="text-gray-400 text-sm">
              近 14 天内暂无多信源覆盖的事件聚类，请等待数据采集后查看
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {hotTopics.map(({ cluster, relatedArticles }, index) => (
              <div
                key={cluster.id}
                className="bg-white rounded-xl border border-gray-200 overflow-hidden hover:border-blue-200 transition-colors"
              >
                {/* Card header */}
                <div className="p-5 pb-4">
                  <div className="flex items-start gap-3">
                    {/* Rank badge */}
                    <div className={`flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold ${
                      index < 3
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-100 text-gray-500'
                    }`}>
                      {index + 1}
                    </div>

                    <div className="flex-1 min-w-0">
                      {/* Title with link to primary article */}
                      <a
                        href={cluster.primary_link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-lg font-semibold text-gray-900 leading-snug mb-2 hover:text-blue-600 transition-colors"
                      >
                        {cluster.primary_title}
                      </a>

                      {/* Meta row */}
                      <div className="flex flex-wrap items-center gap-2 text-xs mt-2">
                        {/* Category tag */}
                        {cluster.primary_category && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded bg-blue-50 text-blue-600 font-medium">
                            {SECTION_NAMES[cluster.primary_category] || cluster.primary_category}
                          </span>
                        )}

                        {/* Article count */}
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-gray-100 text-gray-600">
                          {cluster.related_count + 1} 篇文章
                        </span>

                        {/* Source count */}
                        {cluster.source_count > 1 && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-green-50 text-green-600 font-medium">
                            {cluster.source_count} 个信源
                          </span>
                        )}

                        {/* Score badge */}
                        {cluster.max_score > 0 && (
                          <span className={`inline-flex items-center px-2 py-0.5 rounded font-medium ${scoreColor(cluster.max_score)}`}>
                            最高 {Math.round(cluster.max_score)} 分
                          </span>
                        )}

                        {/* Date */}
                        <span className="text-gray-400">
                          {formatDate(cluster.cluster_date)}
                        </span>
                      </div>

                      {/* Excerpt */}
                      {cluster.primary_excerpt && (
                        <p className="mt-2 text-sm text-gray-600 leading-relaxed line-clamp-2">
                          {cluster.primary_excerpt}
                        </p>
                      )}

                      {/* Source names */}
                      {cluster.unique_sources && cluster.unique_sources.length > 0 && (
                        <div className="mt-2 text-xs text-gray-400">
                          信源：{cluster.unique_sources.join('、')}
                        </div>
                      )}

                      {/* Primary source */}
                      <div className="mt-1 text-xs text-gray-400">
                        主要来源：{cluster.primary_source}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Related articles */}
                {relatedArticles.length > 0 && (
                  <div className="border-t border-gray-100 px-5 py-3 bg-gray-50/50">
                    <div className="text-xs font-medium text-gray-500 mb-2">相关报道</div>
                    <ul className="space-y-1.5">
                      {relatedArticles.slice(0, 6).map(article => (
                        <li key={article.id}>
                          <Link
                            href={`/article/${article.id}`}
                            className="flex items-center gap-2 text-sm text-gray-700 hover:text-blue-600 transition-colors group"
                          >
                            <span className="w-1 h-1 rounded-full bg-gray-300 group-hover:bg-blue-400 flex-shrink-0" />
                            <span className="truncate">{article.title}</span>
                            {article.score != null && (
                              <span className="text-xs text-gray-400 flex-shrink-0">
                                {Math.round(article.score)}分
                              </span>
                            )}
                            <span className="text-xs text-gray-400 flex-shrink-0 ml-auto hidden sm:inline">
                              {article.source_name}
                            </span>
                          </Link>
                        </li>
                      ))}
                    </ul>
                    {cluster.related_count > 6 && (
                      <div className="mt-2 text-xs text-gray-400">
                        还有 {cluster.related_count - 6} 篇相关报道...
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
