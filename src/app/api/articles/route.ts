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

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const date = searchParams.get('date');
  const category = searchParams.get('category');
  const limitRaw = parseInt(searchParams.get('limit') || '40');
  const offsetRaw = parseInt(searchParams.get('offset') || '0');
  const limit = Math.min(Math.max(Number.isNaN(limitRaw) ? 40 : limitRaw, 1), 500);
  const offset = Math.max(Number.isNaN(offsetRaw) ? 0 : offsetRaw, 0);
  
  // 列表不返回 content_html（单条可达 30KB+，500 条能把响应撑到数 MB）；
  // content 只用于卡片摘要降级与搜索，截断后返回
  let query = supabase
    .from('articles')
    .select(
      'id, title, link, excerpt, content, source_name, category, score, pub_date, ai_reason, scoring_method, score_dimensions, cover_image, created_at',
      { count: 'exact' }
    )
    .order('score', { ascending: false })
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

  const slim = (articles || []).map((a) => ({
    ...a,
    content: a.content ? a.content.substring(0, 300) : a.content,
  }));

  return NextResponse.json({
    articles: slim,
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
      const { error } = await supabase
        .from('articles')
        .update({
          score,
          scored_at: new Date().toISOString()
        })
        .in('id', articleIds);
      
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
