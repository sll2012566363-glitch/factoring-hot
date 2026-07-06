import { NextRequest, NextResponse } from 'next/server';
import {
  adminClient,
  getBeijingToday,
  checkRateLimit,
  jsonResponse,
} from '@/lib/public-api-utils';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://factoring-hot.vercel.app';

/**
 * GET /api/public/daily
 *
 * Returns today's daily report.
 * Supports ?date=YYYY-MM-DD for specific date.
 */
export async function GET(request: NextRequest) {
  const rateBlocked = checkRateLimit(request);
  if (rateBlocked) return rateBlocked;

  const sp = request.nextUrl.searchParams;
  const date = sp.get('date') || getBeijingToday();

  // Fetch daily report
  const { data: report, error } = await adminClient
    .from('daily_reports')
    .select('*')
    .eq('report_date', date)
    .single();

  if (error || !report) {
    // Try to find the nearest report (within 3 days)
    const { data: nearest } = await adminClient
      .from('daily_reports')
      .select('*')
      .gte('report_date', subtractDays(date, 3))
      .lte('report_date', date)
      .order('report_date', { ascending: false })
      .limit(1);

    if (!nearest || nearest.length === 0) {
      return NextResponse.json(
        { error: 'No daily report found for this date', date, available: false },
        { status: 404 }
      );
    }

    return buildDailyResponse(nearest[0], request);
  }

  return buildDailyResponse(report, request);
}

function subtractDays(dateStr: string, days: number): string {
  const d = new Date(dateStr);
  d.setDate(d.getDate() - days);
  return d.toISOString().split('T')[0];
}

function buildDailyResponse(report: any, request: NextRequest): NextResponse {
  const body = {
    id: report.id,
    date: report.report_date,
    title: report.report_title,
    lead: {
      title: report.report_title,
      summary: report.executive_summary || '',
    },
    sections: report.sections || [],
    totalArticles: report.total_articles,
    executiveSummary: report.executive_summary || '',
    topSources: report.top_sources || [],
    categoryDistribution: report.category_distribution || {},
    generatedAt: report.generated_at,
    siteUrl: SITE_URL,
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
