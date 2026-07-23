import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { assessContentQuality } from '@/lib/content-quality';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  
  const { data: article, error } = await supabase
    .from('articles')
    .select('id, title, link, excerpt, content, content_html, cover_image, source_name, category, score, score_dimensions, pub_date, ai_reason, scoring_method, event_id, event_title, created_at')
    .eq('id', id)
    .eq('pre_filtered', true)
    .eq('status', 'selected')
    .eq('is_selected', true)
    .single();
  
  if (error || !article) {
    return NextResponse.json({ error: 'Article not found' }, { status: 404 });
  }
  
  return NextResponse.json({ ...article, contentQuality: assessContentQuality(article) });
}
