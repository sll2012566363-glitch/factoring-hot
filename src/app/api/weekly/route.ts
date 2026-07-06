import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

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
  const sp = request.nextUrl.searchParams;
  const now = new Date();
  const beijingOffset = 8 * 60 * 60 * 1000;
  const beijingDate = new Date(now.getTime() + beijingOffset);
  const currentYear = beijingDate.getFullYear();

  const year = parseInt(sp.get('year') || String(currentYear));
  const week = sp.get('week');
  const limit = Math.min(parseInt(sp.get('limit') || '12'), 52);

  if (week) {
    // Single report lookup
    const { data, error } = await supabase
      .from('weekly_reports')
      .select('*')
      .eq('year', year)
      .eq('week_number', parseInt(week))
      .single();

    if (error || !data) {
      return NextResponse.json({ error: 'Weekly report not found' }, { status: 404 });
    }
    return NextResponse.json(data);
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
  });
}
