import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit, jsonResponse } from '@/lib/public-api-utils';

/**
 * GET /api/public/version
 *
 * Returns API version and endpoint index.
 */
export async function GET(request: NextRequest) {
  const rateBlocked = checkRateLimit(request);
  if (rateBlocked) return rateBlocked;

  const body = {
    name: '保理 HOT Public API',
    version: '1.0.0',
    description: '保理与供应链金融行业资讯聚合公开 API',
    endpoints: {
      items: {
        path: '/api/public/items',
        method: 'GET',
        description: '获取资讯条目（支持分类、搜索、游标分页）',
        params: {
          mode: 'all | selected (default: selected)',
          category: 'policy | market | risk | innovation',
          since: 'ISO date string (e.g. 2026-07-01)',
          take: '1-100 (default: 20)',
          cursor: 'opaque cursor from previous response',
          q: 'full-text search in title',
        },
      },
      daily: {
        path: '/api/public/daily',
        method: 'GET',
        description: '获取今日日报',
        params: {
          date: 'YYYY-MM-DD (default: today in Beijing time)',
        },
      },
      dailyByDate: {
        path: '/api/public/daily/{date}',
        method: 'GET',
        description: '获取指定日期的日报',
      },
      hotTopics: {
        path: '/api/public/hot-topics',
        method: 'GET',
        description: '获取热门话题（按多信源覆盖排序）',
        params: {
          take: '1-50 (default: 10)',
          days: 'look-back window 1-30 days (default: 7)',
        },
      },
      feeds: {
        rss: '/feed.xml',
        all: '/feed/all.xml',
        daily: '/feed/daily.xml',
        category: '/feed/category/{category}.xml',
      },
    },
    rateLimit: '60 requests per minute per IP',
    cachePolicy: 'ETag + 304 Not Modified supported, max-age=300',
    siteUrl: process.env.NEXT_PUBLIC_SITE_URL || 'https://factoring-hot.vercel.app',
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
