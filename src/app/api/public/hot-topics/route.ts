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
 * Returns hot topics ranked by multi-source coverage.
 * A "hot topic" = an event that was reported by multiple distinct sources.
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

  // Fetch events within the time window, ordered by article_count (coverage)
  const { data: events, error } = await adminClient
    .from('events')
    .select('*')
    .gte('first_seen_at', sinceDate.toISOString())
    .order('article_count', { ascending: false })
    .order('importance_score', { ascending: false })
    .limit(take);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const hotEvents = events || [];

  // For each event, gather distinct source names from its articles
  const hotTopics = [];
  for (const event of hotEvents) {
    let sourceNames: string[] = [];
    let sourceCount = 0;

    if (event.article_ids && event.article_ids.length > 0) {
      const { data: articles } = await adminClient
        .from('articles')
        .select('source_name')
        .in('id', event.article_ids.slice(0, 20)); // limit sub-query

      if (articles) {
        const uniqueSources = new Set(articles.map((a: any) => a.source_name));
        sourceNames = Array.from(uniqueSources);
        sourceCount = sourceNames.length;
      }
    }

    hotTopics.push({
      id: event.id,
      title: event.event_title,
      summary: event.summary || null,
      category: event.category,
      articleCount: event.article_count,
      sourceCount,
      sourceNames,
      importanceScore: event.importance_score || 0,
      firstSeenAt: event.first_seen_at,
      lastSeenAt: event.last_seen_at,
    });
  }

  // Re-sort by sourceCount (multi-source coverage) as primary, importanceScore as secondary
  hotTopics.sort((a, b) => {
    if (b.sourceCount !== a.sourceCount) return b.sourceCount - a.sourceCount;
    return b.importanceScore - a.importanceScore;
  });

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
