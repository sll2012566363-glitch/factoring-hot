import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/** Simple API key auth for write operations */
function checkAuth(request: NextRequest): boolean {
  const apiKey = process.env.API_KEY;
  if (!apiKey) return true; // No auth configured = allow all (dev mode)
  const headerKey = request.headers.get('authorization')?.replace('Bearer ', '');
  const queryKey = request.nextUrl.searchParams.get('api_key');
  return headerKey === apiKey || queryKey === apiKey;
}

/** Get today's date in Beijing timezone (UTC+8) */
function getBeijingToday(): string {
  const now = new Date();
  const beijingOffset = 8 * 60 * 60 * 1000;
  const beijingDate = new Date(now.getTime() + beijingOffset);
  return beijingDate.toISOString().split('T')[0];
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const date = searchParams.get('date');
  const category = searchParams.get('category');
  const limit = parseInt(searchParams.get('limit') || '40');
  const offset = parseInt(searchParams.get('offset') || '0');
  
  let query = supabase
    .from('articles')
    .select('*', { count: 'exact' })
    .order('score', { ascending: false, nullsLast: true })
    .order('pub_date', { ascending: false })
    .range(offset, offset + limit - 1);
  
  if (date) {
    query = query.gte('pub_date', date).lte('pub_date', date + 'T23:59:59');
  }
  
  if (category) {
    query = query.eq('category', category);
  }
  
  const { data: articles, error, count } = await query;
  
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  
  return NextResponse.json({
    articles: articles || [],
    total: count || 0,
    date: date || 'all',
  });
}

export async function POST(request: NextRequest) {
  if (!checkAuth(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { action, articleIds, score, category, eventId } = body;

    if (!articleIds || !Array.isArray(articleIds)) {
      return NextResponse.json({ error: 'articleIds must be an array' }, { status: 400 });
    }
    
    if (action === 'update_scores') {
      const updates = articleIds.map((id: string) => ({
        id,
        score,
        scored_at: new Date().toISOString()
      }));
      
      const { error } = await supabase
        .from('articles')
        .upsert(updates);
      
      if (error) throw error;
      
      return NextResponse.json({ success: true });
    }
    
    if (action === 'assign_event') {
      const { error } = await supabase
        .from('articles')
        .update({ event_id: eventId })
        .in('id', articleIds);
      
      if (error) throw error;
      
      return NextResponse.json({ success: true });
    }
    
    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    
  } catch (error) {
    return NextResponse.json({ error: 'Operation failed' }, { status: 500 });
  }
}
