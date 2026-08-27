import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { requireInternalApiKey } from '@/lib/api-auth';
import { checkRateLimit } from '@/lib/public-api-utils';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(request: NextRequest) {
  const rateBlocked = await checkRateLimit(request);
  if (rateBlocked) return rateBlocked;
  const sp = request.nextUrl.searchParams;
  const now = new Date();
  const beijingOffset = 8 * 60 * 60 * 1000;
  const beijingDate = new Date(now.getTime() + beijingOffset);
  const currentYear = beijingDate.getFullYear();

  const year = parseInt(sp.get('year') || String(currentYear));
  const month = sp.get('month');
  const limitRaw = parseInt(sp.get('limit') || '12');
  const limit = Math.min(Math.max(Number.isNaN(limitRaw) ? 12 : limitRaw, 1), 24);

  if (Number.isNaN(year) || year < 2020 || year > currentYear + 1) {
    return NextResponse.json({ error: 'year is invalid' }, { status: 400 });
  }

  if (month) {
    const monthNum = parseInt(month);
    if (Number.isNaN(monthNum) || monthNum < 1 || monthNum > 12) {
      return NextResponse.json({ error: 'month must be 1-12' }, { status: 400 });
    }
    const { data, error } = await supabase
      .from('monthly_reports')
      .select('*')
      .eq('year', year)
      .eq('month', monthNum)
      .single();

    if (error || !data) {
      return NextResponse.json({ error: 'Monthly report not found' }, { status: 404 });
    }
    return NextResponse.json(data, { headers: { 'Cache-Control': 'public, max-age=300, s-maxage=900' } });
  }

  const { data, error } = await supabase
    .from('monthly_reports')
    .select('*')
    .eq('year', year)
    .order('month', { ascending: false })
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

export async function POST(request: NextRequest) {
  const authError = requireInternalApiKey(request);
  if (authError) return authError;

  const body = await request.json();
  const year = Number.isNaN(parseInt(body.year)) ? new Date().getFullYear() : parseInt(body.year);
  const month = Number.isNaN(parseInt(body.month)) ? (new Date().getMonth() + 1) : parseInt(body.month);

  if (month < 1 || month > 12) {
    return NextResponse.json({ error: 'month must be 1-12' }, { status: 400 });
  }

  try {
    const { generateMonthlyReport } = await import('@/scripts/generate-reports');
    const report = await generateMonthlyReport(year, month);
    return NextResponse.json({ success: true, report });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Monthly report generation failed' },
      { status: 500 },
    );
  }
}
