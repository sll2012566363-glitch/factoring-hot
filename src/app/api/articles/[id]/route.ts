import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { assessContentQuality } from '@/lib/content-quality';
import { checkRateLimit } from '@/lib/public-api-utils';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const rateBlocked = checkRateLimit(request);
  if (rateBlocked) return rateBlocked;
  const { id } = await params;
  
  const { data: article, error } = await supabase
    .from('articles')
    .select('id, title, link, excerpt, content, content_html, cover_image, source_name, category, score, score_dimensions, pub_date, ai_reason, scoring_method, event_id, event_title, created_at, status, is_selected, content_quality')
    .eq('id', id)
    .eq('pre_filtered', true)
    .in('status', ['selected', 'pending'])
    .eq('content_quality', 'full')
    .single();
  
  if (error || !article) {
    return NextResponse.json({ error: 'Article not found' }, { status: 404 });
  }
  
  return NextResponse.json({ ...article, reviewTier: article.is_selected ? 'selected' : 'signal', contentQuality: assessContentQuality(article) });
}
