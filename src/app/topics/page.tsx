import { createClient } from '@supabase/supabase-js';
import Link from 'next/link';
import AppShell from '@/components/AppShell';
import { formatDateDaySafe } from '@/lib/date-utils';

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

interface PrimaryArticle {
  id: string;
  pub_date: string;
}

export const dynamic = 'force-dynamic';

export default async function TopicsPage() {
  // Cluster jobs run daily, so cluster_date is not the article date. Verify the
  // primary article itself is recent before showing a topic as "hot".
  const cutoff = new Date(Date.now() - 14 * 86400000).toISOString();
  const { data: rawClusters, error } = await supabase
    .from('topic_clusters')
    .select('*')
    .gte('cluster_date', cutoff.slice(0, 10))
    .order('source_count', { ascending: false })
    .order('max_score', { ascending: false })
    .limit(30);

  let hotTopics: Array<{
    cluster: ClusterRecord;
    relatedArticles: RelatedArticle[];
  }> = [];

  const clusters = rawClusters as ClusterRecord[] | null;
  const primaryDates = new Map<string, string>();
  if (clusters && clusters.length > 0) {
    const { data: primaryRows } = await supabase
      .from('articles')
      .select('id, pub_date')
      .in('id', clusters.map(cluster => cluster.primary_article_id))
      .gte('pub_date', cutoff)
      .or('pre_filtered.is.null,pre_filtered.eq.true');
    (primaryRows as PrimaryArticle[] | null)?.forEach(article => primaryDates.set(article.id, article.pub_date));

    // Only fetch related articles for clusters that have them
    hotTopics = await Promise.all(
      clusters.filter(cluster => primaryDates.has(cluster.primary_article_id)).map(async (cluster) => {
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

    // "热门话题"必须有真实的多信源覆盖，不将单篇文章伪装成热点。
    hotTopics = hotTopics.filter(
      ({ cluster }) => cluster.source_count >= 2
    );
  }

  // 北京时间展示（固定 Asia/Shanghai，避免 Vercel UTC 服务器导致日期错位）
  const formatDate = (dateStr: string) => formatDateDaySafe(dateStr);

  const scoreColor = (score: number) => {
    if (score >= 80) return 'bg-red-50 text-red-600';
    if (score >= 60) return 'bg-orange-50 text-orange-600';
    if (score >= 40) return 'bg-yellow-50 text-yellow-700';
    return 'bg-gray-100 text-gray-500';
  };

  return (
    <AppShell>
        <header className="page-intro flex items-end justify-between gap-4">
          <div>
            <p className="page-eyebrow">Multi-source signals</p>
            <h1 className="page-title">热门行业话题</h1>
            <p className="page-description">近 14 天获得多个信源覆盖的事件，按覆盖广度与关注度排序。</p>
          </div>
          <Link href="/" className="soft-button whitespace-nowrap">返回精选</Link>
        </header>

        {hotTopics.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
            <div className="text-gray-400 text-lg mb-2">暂无热门话题</div>
            <p className="text-gray-400 text-sm">
              近 14 天内暂无多信源覆盖的事件聚类，请等待数据采集后查看
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {hotTopics.map(({ cluster, relatedArticles }, index) => (
              <div
                key={cluster.id}
                className="surface overflow-hidden transition-colors hover:border-[var(--brand)]"
              >
                {/* Card header */}
                <div className="p-5 pb-4">
                  <div className="flex items-start gap-3">
                    {/* Rank badge */}
                    <div className={`flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold ${
                      index < 3
                        ? 'bg-[var(--brand)] text-white'
                        : 'bg-[var(--brand-soft)] text-[var(--brand)]'
                    }`}>
                      {index + 1}
                    </div>

                    <div className="flex-1 min-w-0">
                      {/* Title with link to primary article */}
                      <a
                        href={cluster.primary_link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-lg font-semibold text-[var(--ink)] leading-snug mb-2 hover:text-[var(--brand)] transition-colors"
                      >
                        {cluster.primary_title}
                      </a>

                      {/* Meta row */}
                      <div className="flex flex-wrap items-center gap-2 text-xs mt-2">
                        {/* Category tag */}
                        {cluster.primary_category && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded bg-[var(--brand-soft)] text-[var(--brand)] font-medium">
                            {SECTION_NAMES[cluster.primary_category] || cluster.primary_category}
                          </span>
                        )}

                        {/* Article count */}
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-[var(--paper)] text-[var(--muted)]">
                          {cluster.related_count + 1} 篇文章
                        </span>

                        {/* Source count */}
                        {cluster.source_count > 1 && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-[var(--brand-soft)] text-[var(--brand)] font-medium">
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
                          {formatDate(primaryDates.get(cluster.primary_article_id)!)}
                        </span>
                      </div>

                      {/* Excerpt */}
                      {cluster.primary_excerpt && (
                        <p className="mt-2 text-sm text-[var(--muted)] leading-relaxed line-clamp-2">
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
                  <div className="border-t border-[var(--line)] px-5 py-3 bg-[var(--paper)]/50">
                    <div className="text-xs font-medium text-gray-500 mb-2">相关报道</div>
                    <ul className="space-y-1.5">
                      {relatedArticles.slice(0, 6).map(article => (
                        <li key={article.id}>
                          <Link
                            href={`/article/${article.id}`}
                            className="flex items-center gap-2 text-sm text-[var(--ink)] hover:text-[var(--brand)] transition-colors group"
                          >
                            <span className="w-1 h-1 rounded-full bg-[var(--muted)] group-hover:bg-[var(--brand)] flex-shrink-0" />
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
    </AppShell>
  );
}
