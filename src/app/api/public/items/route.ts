import { NextRequest, NextResponse } from 'next/server';
import {
  adminClient,
  getBeijingToday,
  encodeCursor,
  decodeCursor,
  checkRateLimit,
  jsonResponse,
} from '@/lib/public-api-utils';
import { assessContentQuality } from '@/lib/content-quality';

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

/** Transform an internal article row to the public item shape (AI Hot compatible). */
function toPublicItem(a: any, quality: ReturnType<typeof assessContentQuality>) {
  return {
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
    reviewTier: a.is_selected ? 'selected' : 'signal',
    eventId: a.event_id || null,
    eventTitle: a.event_title || null,
    contentTier: quality.tier,
    detailAvailable: quality.tier === 'full',
  };
}

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
 *   page     — 1-based page number; offset pagination that supports jumping
 *              to arbitrary pages (takes precedence over cursor)
 *   q        — search in title, summary and full text
 */
export async function GET(request: NextRequest) {
  // Rate limit check
  const rateBlocked = await checkRateLimit(request);
  if (rateBlocked) return rateBlocked;

  const sp = request.nextUrl.searchParams;
  const mode = sp.get('mode') || 'all';
  const category = sp.get('category');
  const since = sp.get('since');
  const takeRaw = parseInt(sp.get('take') || '20');
  const take = Math.min(Math.max(Number.isNaN(takeRaw) ? 20 : takeRaw, 1), MAX_TAKE);
  const cursorRaw = sp.get('cursor');
  const pageRaw = parseInt(sp.get('page') || '');
  const page = Number.isNaN(pageRaw) || pageRaw < 1 ? null : pageRaw;
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

  // Decode cursor if present (skipped when offset `page` mode is used)
  let cursor = null;
  if (cursorRaw && !page) {
    cursor = decodeCursor(cursorRaw);
    if (!cursor) {
      return NextResponse.json({ error: 'Invalid cursor' }, { status: 400 });
    }
  }

  // Build query. Offset mode fetches an exact [from, to] range; cursor mode
  // fetches take+1 rows to detect whether a next page exists.
  const offsetFrom = page ? (page - 1) * take : 0;
  let query = adminClient
    .from('articles')
    .select('id, title, link, excerpt, content, content_html, source_name, source_id, category, priority, score, score_dimensions, scoring_method, is_selected, event_id, event_title, pub_date, created_at, content_quality', { count: 'exact' })
    // pre-filter.ts 判不相关的文章排除展示
    .eq('pre_filtered', true)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false });

  if (page) {
    query = query.range(offsetFrom, offsetFrom + take - 1);
  } else {
    query = query.limit(take + 1);
  }

  // Mode filter. "all" means all relevant, complete-text records; it can
  // include pending records that are usable in the live research library.
  if (mode === 'selected') {
    query = query.eq('status', 'selected').eq('is_selected', true);
  } else {
    query = query.in('status', ['selected', 'pending']).eq('content_quality', 'full');
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

  // Lightweight multi-field search. Keep this route compatible with hosted
  // Supabase instances where a text-search extension may not be enabled.
  if (q) {
    const safeQuery = q.replace(/[,%()]/g, ' ').trim().slice(0, 80);
    if (safeQuery) query = query.or(`title.ilike.%${safeQuery}%,excerpt.ilike.%${safeQuery}%,content.ilike.%${safeQuery}%`);
  }

  const { data: articles, error, count } = await query;

  if (error) {
    // PostgREST returns 416 "Requested range not satisfiable" when the offset
    // exceeds the current row count (e.g. rows were deleted between two page
    // requests). Treat it as an empty page rather than a server error.
    if (String(error.message || '').includes('range not satisfiable')) {
      return jsonResponse({
        items: [],
        total: 0,
        take,
        page: page || 1,
        totalPages: Math.max(1, (page || 1) - 1),
        nextCursor: null,
        hasMore: false,
        siteUrl: SITE_URL,
        generatedAt: new Date().toISOString(),
      }, request);
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const items = articles || [];
  const total = count || 0;
  const totalPages = Math.max(1, Math.ceil(total / take));

  // Offset mode: derive pagination fields from the exact count.
  if (page) {
    const publicItems = items.map(a => {
      const quality = assessContentQuality(a);
      return toPublicItem(a, quality);
    });
    return jsonResponse({
      items: publicItems,
      total,
      take,
      page,
      totalPages,
      nextCursor: null,
      hasMore: page < totalPages,
      siteUrl: SITE_URL,
      generatedAt: new Date().toISOString(),
    }, request);
  }

  const hasMore = items.length > take;
  const pageItems = hasMore ? items.slice(0, take) : items;

  // Build next cursor from last item
  let nextCursor: string | null = null;
  if (hasMore && pageItems.length > 0) {
    const last = pageItems[pageItems.length - 1];
    nextCursor = encodeCursor({
      createdAt: last.created_at || new Date().toISOString(),
      id: last.id,
    });
  }

  // Transform to public item format (matching AI Hot's shape)
  const publicItems = pageItems.map(a => toPublicItem(a, assessContentQuality(a)));

  const responseBody = {
    items: publicItems,
    total,
    take,
    page: 1,
    totalPages,
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
