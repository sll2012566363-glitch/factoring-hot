import { NextRequest, NextResponse } from 'next/server';
import {
  adminClient,
  getBeijingToday,
  encodeCursor,
  decodeCursor,
  checkRateLimit,
  jsonResponse,
} from '@/lib/public-api-utils';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://factoring-hot.vercel.app';
const MAX_TAKE = 100;
const DEFAULT_TAKE = 20;

/** Map internal category to display name */
const CATEGORY_LABELS: Record<string, string> = {
  frontier: '前沿解读',
  industry_model: '行业前沿模式',
  regulatory: '前沿监管新闻',
  dispute: '前沿争议解决',
  normative: '前沿规范文件',
};

/**
 * GET /api/public/items
 *
 * Public items API — anonymous, with cursor pagination, ETag, rate limiting.
 *
 * Query params:
 *   mode     — "all" | "selected" (default: "selected")
 *   category — filter by category id (policy/market/risk/innovation)
 *   since    — ISO date string, return items after this date
 *   take     — page size 1-100 (default: 20)
 *   cursor   — opaque cursor from previous response
 *   q        — full-text search in title + content
 */
export async function GET(request: NextRequest) {
  // Rate limit check
  const rateBlocked = checkRateLimit(request);
  if (rateBlocked) return rateBlocked;

  const sp = request.nextUrl.searchParams;
  const mode = sp.get('mode') || 'all';
  const category = sp.get('category');
  const since = sp.get('since');
  const takeRaw = parseInt(sp.get('take') || '20');
  const take = Math.min(Math.max(Number.isNaN(takeRaw) ? 20 : takeRaw, 1), MAX_TAKE);
  const cursorRaw = sp.get('cursor');
  const q = sp.get('q')?.trim();

  // Validate mode
  if (mode !== 'all' && mode !== 'selected') {
    return NextResponse.json(
      { error: 'mode must be "all" or "selected"' },
      { status: 400 }
    );
  }

  // Validate category
  if (category && !(category in CATEGORY_LABELS)) {
    return NextResponse.json(
      { error: `Invalid category. Must be one of: ${Object.keys(CATEGORY_LABELS).join(', ')}` },
      { status: 400 }
    );
  }

  // Decode cursor if present
  let cursor = null;
  if (cursorRaw) {
    cursor = decodeCursor(cursorRaw);
    if (!cursor) {
      return NextResponse.json({ error: 'Invalid cursor' }, { status: 400 });
    }
  }

  // Build query
  let query = adminClient
    .from('articles')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(take + 1); // fetch one extra to detect if there's a next page

  // Mode filter
  if (mode === 'selected') {
    query = query.eq('is_selected', true);
  }

  // Category filter
  if (category) {
    query = query.eq('category', category);
  }

  // Since filter
  if (since) {
    const sinceDate = new Date(since);
    if (isNaN(sinceDate.getTime())) {
      return NextResponse.json({ error: 'Invalid since date' }, { status: 400 });
    }
    query = query.gte('pub_date', sinceDate.toISOString());
  }

  // Cursor-based pagination: items created_at < cursor (older items)
  if (cursor) {
    query = query
      .or(`created_at.lt.${cursor.createdAt},and(created_at.eq.${cursor.createdAt},id.lt.${cursor.id})`);
  }

  // Full-text search (ilike on title, since Supabase doesn't have FTS without extensions)
  if (q) {
    query = query.ilike('title', `%${q}%`);
  }

  const { data: articles, error, count } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const items = articles || [];
  const hasMore = items.length > take;
  const page = hasMore ? items.slice(0, take) : items;

  // Build next cursor from last item
  let nextCursor: string | null = null;
  if (hasMore && page.length > 0) {
    const last = page[page.length - 1];
    nextCursor = encodeCursor({
      createdAt: last.created_at || new Date().toISOString(),
      id: last.id,
    });
  }

  // Transform to public item format (matching AI Hot's shape)
  const publicItems = page.map(a => ({
    id: a.id,
    title: a.title,
    url: a.link,
    permalink: a.link,
    source: a.source_name,
    sourceId: a.source_id,
    publishedAt: a.pub_date,
    summary: a.excerpt || null,
    category: a.category,
    categoryLabel: CATEGORY_LABELS[a.category] || a.category,
    priority: a.priority,
    score: a.score ?? 0,
    scoreDimensions: a.score_dimensions || null,
    scoringMethod: a.scoring_method || null,
    selected: a.is_selected ?? false,
    eventId: a.event_id || null,
    eventTitle: a.event_title || null,
  }));

  const responseBody = {
    items: publicItems,
    total: count || 0,
    take,
    nextCursor,
    hasMore,
    siteUrl: SITE_URL,
    generatedAt: new Date().toISOString(),
  };

  return jsonResponse(responseBody, request);
}

/** Preflight for CORS */
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
