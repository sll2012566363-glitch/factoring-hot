import { NextRequest, NextResponse } from 'next/server';
import {
  adminClient,
  checkRateLimit,
  jsonResponse,
} from '@/lib/public-api-utils';

const DEFAULT_TAKE = 10;
const MAX_TAKE = 50;

/**
 * GET /api/public/hot-topics
 *
 * Returns hot topics ranked by multi-source coverage and score.
 * Data comes from the topic_clusters table (bigram Jaccard clustering).
 *
 * Query params:
 *   take  — number of results (default: 10, max: 50)
 *   days  — look-back window in days (default: 7)
 */
export async function GET(request: NextRequest) {
  const rateBlocked = checkRateLimit(request);
  if (rateBlocked) return rateBlocked;

  const sp = request.nextUrl.searchParams;
  const take = Math.min(Math.max(parseInt(sp.get('take') || '10'), 1), MAX_TAKE);
  const days = Math.min(Math.max(parseInt(sp.get('days') || '7'), 1), 30);

  // Calculate lookback date
  const sinceDate = new Date();
  sinceDate.setDate(sinceDate.getDate() - days);
  const sinceDateStr = sinceDate.toISOString().split('T')[0];

  // cluster_date is the clustering job date, not the article publication date.
  // Query primary articles too so this endpoint never labels old content as hot.
  const { data: rawClusters, error } = await adminClient
    .from('topic_clusters')
    .select('*')
    .gte('cluster_date', sinceDateStr)
    .order('source_count', { ascending: false })
    .order('max_score', { ascending: false })
    .limit(take * 3);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const primaryIds = (rawClusters || []).map((cluster: any) => cluster.primary_article_id);
  const { data: primaryArticles, error: primaryError } = primaryIds.length
    ? await adminClient.from('articles').select('id, pub_date').in('id', primaryIds).gte('pub_date', sinceDate.toISOString()).eq('pre_filtered', true).in('status', ['selected', 'pending'])
    : { data: [], error: null };

  if (primaryError) return NextResponse.json({ error: primaryError.message }, { status: 500 });

  const primaryDates = new Map((primaryArticles || []).map((article: any) => [article.id, article.pub_date]));
  const hotTopics = (rawClusters || [])
    .filter((c: any) => c.source_count >= 2 && primaryDates.has(c.primary_article_id))
    .slice(0, take)
    .map((c: any) => ({
    id: c.id,
    title: c.primary_title,
    summary: c.primary_excerpt || null,
    category: c.primary_category,
    articleCount: c.related_count + 1,
    sourceCount: c.source_count,
    sourceNames: c.unique_sources || [],
    maxScore: c.max_score || 0,
    avgScore: c.avg_score || 0,
    // Preserve the response property for compatibility, but make it truthful.
    clusterDate: primaryDates.get(c.primary_article_id),
  }));

  const body = {
    hotTopics,
    total: hotTopics.length,
    days,
    generatedAt: new Date().toISOString(),
  };

  return jsonResponse(body, request);
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, If-None-Match',
      'Access-Control-Max-Age': '86400',
    },
  });
}
