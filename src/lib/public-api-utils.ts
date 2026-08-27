import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// ── Beijing timezone helper ──────────────────────────────────────
export function getBeijingToday(): string {
  const now = new Date();
  const beijingOffset = 8 * 60 * 60 * 1000;
  return new Date(now.getTime() + beijingOffset).toISOString().split('T')[0];
}

// ── Admin Supabase client for public API (bypasses RLS) ────────────
export const adminClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// ── Cursor encoding/decoding (opaque base64 of created_at|id) ──────
export interface Cursor {
  createdAt: string;
  id: string;
}

export function encodeCursor(cursor: Cursor): string {
  return Buffer.from(`${cursor.createdAt}|${cursor.id}`).toString('base64url');
}

export function decodeCursor(raw: string): Cursor | null {
  try {
    const decoded = Buffer.from(raw, 'base64url').toString('utf-8');
    const [createdAt, id] = decoded.split('|');
    if (!createdAt || !id) return null;
    return { createdAt, id };
  } catch {
    return null;
  }
}

// ── ETag generation (simple FNV-1a-inspired hash) ───────────────────
export function generateETag(body: string): string {
  let hash = 0;
  for (let i = 0; i < body.length; i++) {
    const ch = body.charCodeAt(i);
    hash = ((hash << 5) - hash) + ch;
    hash |= 0;
  }
  return `"${(hash >>> 0).toString(16)}"`;
}

/** Return 304 if ETag matches, null otherwise */
export function checkETagMatch(request: NextRequest, etag: string): NextResponse | null {
  const ifNoneMatch = request.headers.get('if-none-match');
  if (ifNoneMatch && ifNoneMatch === etag) {
    return new NextResponse(null, {
      status: 304,
      headers: { 'ETag': etag, 'Cache-Control': 'public, max-age=300' },
    });
  }
  return null;
}

// ── Rate limiter: Upstash Redis (cross-instance) + in-memory fallback ──
interface RateEntry {
  count: number;
  windowStart: number;
}

const rateMap = new Map<string, RateEntry>();
const RATE_WINDOW_MS = 60_000; // 1 minute window
const RATE_LIMIT = Math.min(Math.max(Number(process.env.PUBLIC_API_RATE_LIMIT) || 60, 10), 600);
const MAX_RATE_KEYS = 10_000;
const UPSTASH_URL = process.env.UPSTASH_REDIS_REST_URL;
const UPSTASH_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
const RATE_REDIS_TIMEOUT_MS = 1_500;

function getClientIP(request: NextRequest): string {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    'unknown'
  );
}

/**
 * Fixed-window counter in Upstash Redis via the REST pipeline API.
 * Returns the hit count for the current window, or null when Redis is
 * unavailable (not configured, timeout, error) so the caller can fall
 * back to the in-memory limiter.
 */
async function redisRateIncrement(ip: string): Promise<number | null> {
  if (!UPSTASH_URL || !UPSTASH_TOKEN) return null;
  try {
    const windowKey = `rl:${ip}:${Math.floor(Date.now() / RATE_WINDOW_MS)}`;
    const response = await fetch(`${UPSTASH_URL}/pipeline`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${UPSTASH_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify([
        ['INCR', windowKey],
        ['EXPIRE', windowKey, '120'],
      ]),
      signal: AbortSignal.timeout(RATE_REDIS_TIMEOUT_MS),
    });
    if (!response.ok) return null;
    const data = await response.json() as Array<{ result?: unknown }>;
    const count = data?.[0]?.result;
    return typeof count === 'number' ? count : null;
  } catch {
    return null;
  }
}

function rateLimitResponse(): NextResponse {
  return NextResponse.json(
    { error: `Rate limit exceeded. Max ${RATE_LIMIT} requests per minute.` },
    {
      status: 429,
      headers: {
        'Retry-After': '60',
        'X-RateLimit-Limit': String(RATE_LIMIT),
        'X-RateLimit-Remaining': '0',
      },
    }
  );
}

export async function checkRateLimit(request: NextRequest): Promise<NextResponse | null> {
  const ip = getClientIP(request);

  // Cross-instance enforcement via Redis; on failure or when not configured,
  // degrade to the in-memory counter (single-instance safety net only).
  const redisCount = await redisRateIncrement(ip);
  if (redisCount !== null) {
    return redisCount > RATE_LIMIT ? rateLimitResponse() : null;
  }

  const now = Date.now();
  if (rateMap.size > MAX_RATE_KEYS || Math.random() < 0.01) {
    for (const [key, value] of rateMap) {
      if (now - value.windowStart > RATE_WINDOW_MS) rateMap.delete(key);
    }
  }
  const entry = rateMap.get(ip);

  if (!entry || now - entry.windowStart > RATE_WINDOW_MS) {
    rateMap.set(ip, { count: 1, windowStart: now });
    return null;
  }

  entry.count++;
  return entry.count > RATE_LIMIT ? rateLimitResponse() : null;
}

// ── Standard JSON response builder ─────────────────────────────────
export function jsonResponse(body: unknown, request: NextRequest, extraHeaders?: Record<string, string>): NextResponse {
  const bodyStr = JSON.stringify(body);
  const etag = generateETag(bodyStr);

  // Check ETag first
  const notModified = checkETagMatch(request, etag);
  if (notModified) return notModified;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json; charset=utf-8',
    'ETag': etag,
    'Cache-Control': 'public, max-age=300, s-maxage=600',
    'Access-Control-Allow-Origin': '*',
    'X-Content-Type-Options': 'nosniff',
    ...extraHeaders,
  };

  return new NextResponse(bodyStr, { status: 200, headers });
}

// ── RSS XML helpers ────────────────────────────────────────────────
function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export function buildRssFeed(opts: {
  title: string;
  link: string;
  description: string;
  items: Array<{
    title: string;
    link: string;
    description: string;
    pubDate: string;
    guid: string;
    category?: string;
  }>;
}): string {
  const { title, link, description, items } = opts;

  const rssItems = items.map(item => `
    <item>
      <title>${escapeXml(item.title)}</title>
      <link>${escapeXml(item.link)}</link>
      <description>${escapeXml(item.description)}</description>
      <pubDate>${new Date(item.pubDate).toUTCString()}</pubDate>
      <guid isPermaLink="false">${escapeXml(item.guid)}</guid>
      ${item.category ? `<category>${escapeXml(item.category)}</category>` : ''}
    </item>`).join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${escapeXml(title)}</title>
    <link>${escapeXml(link)}</link>
    <description>${escapeXml(description)}</description>
    <language>zh-CN</language>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
    <atom:link href="${escapeXml(link)}" rel="self" type="application/rss+xml"/>
    ${rssItems}
  </channel>
</rss>`;
}

export function rssResponse(xml: string): NextResponse {
  return new NextResponse(xml, {
    status: 200,
    headers: {
      'Content-Type': 'application/rss+xml; charset=utf-8',
      'Cache-Control': 'public, max-age=1800, s-maxage=3600',
      'Access-Control-Allow-Origin': '*',
    },
  });
}
