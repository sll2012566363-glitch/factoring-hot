import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  // Use Beijing time for default date
  const now = new Date();
  const beijingOffset = 8 * 60 * 60 * 1000;
  const beijingDate = new Date(now.getTime() + beijingOffset);
  const date = searchParams.get('date') || beijingDate.toISOString().split('T')[0];
  
  const { data: report, error } = await supabase
    .from('daily_reports')
    .select('*')
    .eq('report_date', date)
    .single();
  
  if (error || !report) {
    return NextResponse.json({ error: 'Report not found' }, { status: 404 });
  }
  
  return NextResponse.json(report);
}

export async function POST(request: NextRequest) {
  // Auth check
  const apiKey = process.env.API_KEY;
  if (apiKey) {
    const headerKey = request.headers.get('authorization')?.replace('Bearer ', '');
    const queryKey = request.nextUrl.searchParams.get('api_key');
    if (headerKey !== apiKey && queryKey !== apiKey) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  try {
    const body = await request.json();
    const { report_date, sections, total_articles, executive_summary } = body;
    
    const { data, error } = await supabase
      .from('daily_reports')
      .upsert({
        report_date,
        sections,
        total_articles,
        executive_summary,
        generated_at: new Date().toISOString()
      })
      .select()
      .single();
    
    if (error) throw error;
    
    return NextResponse.json(data);
    
  } catch (error) {
    return NextResponse.json({ error: 'Failed to generate report' }, { status: 500 });
  }
}
