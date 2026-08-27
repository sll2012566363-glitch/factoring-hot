import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { checkRateLimit } from '@/lib/public-api-utils';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * GET /api/weekly
 *
 * Query params:
 *   year  — filter by year (default: current year)
 *   week  — filter by ISO week number
 *   limit — max results (default: 12)
 *
 * Without week param: returns list of weekly reports for the year.
 * With year+week: returns a single weekly report.
 */
export async function GET(request: NextRequest) {
  const rateBlocked = await checkRateLimit(request);
  if (rateBlocked) return rateBlocked;
  const sp = request.nextUrl.searchParams;
  const now = new Date();
  const beijingOffset = 8 * 60 * 60 * 1000;
  const beijingDate = new Date(now.getTime() + beijingOffset);
  const currentYear = beijingDate.getFullYear();

  const year = parseInt(sp.get('year') || String(currentYear));
  const week = sp.get('week');
  const limitRaw = parseInt(sp.get('limit') || '12');
  const limit = Math.min(Math.max(Number.isNaN(limitRaw) ? 12 : limitRaw, 1), 52);

  if (Number.isNaN(year) || year < 2020 || year > currentYear + 1) {
    return NextResponse.json({ error: 'year is invalid' }, { status: 400 });
  }

  if (week) {
    const weekNum = parseInt(week);
    if (Number.isNaN(weekNum) || weekNum < 1 || weekNum > 53) {
      return NextResponse.json({ error: 'week must be 1-53' }, { status: 400 });
    }
    // Single report lookup
    const { data, error } = await supabase
      .from('weekly_reports')
      .select('*')
      .eq('year', year)
      .eq('week_number', weekNum)
      .single();

    if (error || !data) {
      return NextResponse.json({ error: 'Weekly report not found' }, { status: 404 });
    }
    return NextResponse.json(data, { headers: { 'Cache-Control': 'public, max-age=300, s-maxage=900' } });
  }

  // List all weekly reports for the year
  const { data, error } = await supabase
    .from('weekly_reports')
    .select('*')
    .eq('year', year)
    .order('week_number', { ascending: false })
    .limit(limit);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    reports: data || [],
    year,
    total: (data || []).length,
  }, { headers: { 'Cache-Control': 'public, max-age=300, s-maxage=900' } });
}
