import { NextRequest, NextResponse } from 'next/server';
import {
  adminClient,
  checkRateLimit,
  jsonResponse,
} from '@/lib/public-api-utils';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://factoring-hot.vercel.app';

/**
 * GET /api/public/daily/[date]
 *
 * Returns the daily report for a specific date.
 * URL pattern: /api/public/daily/2026-07-05
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ date: string }> }
) {
  const rateBlocked = checkRateLimit(request);
  if (rateBlocked) return rateBlocked;

  const { date } = await params;

  // Validate date format
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json(
      { error: 'Invalid date format. Use YYYY-MM-DD.' },
      { status: 400 }
    );
  }

  const { data: report, error } = await adminClient
    .from('daily_reports')
    .select('*')
    .eq('report_date', date)
    .single();

  if (error || !report) {
    return NextResponse.json(
      { error: 'No daily report found for this date', date },
      { status: 404 }
    );
  }

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
