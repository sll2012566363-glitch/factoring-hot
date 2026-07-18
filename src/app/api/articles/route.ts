import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/** 写操作鉴权：必须配置 API_KEY 且请求携带正确 key（默认 closed） */
function checkAuth(request: NextRequest): boolean {
  const apiKey = process.env.API_KEY;
  if (!apiKey) return false; // 未配置 key 一律拒绝写操作
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
    // pre-filter.ts（hourly pipeline 2/5步）判不相关的文章排除展示——
    // 之前这个字段判了但没人读，白判了
    .or('pre_filtered.is.null,pre_filtered.eq.true')
    // 全部动态是实时资料库，发布时间应优先于评分。
    .order('pub_date', { ascending: false })
    .order('score', { ascending: false })
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
