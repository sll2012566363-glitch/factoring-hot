import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { requireInternalApiKey } from '@/lib/api-auth';
import { fetchArticleContent } from '@/lib/article-content';
import { classifyArticle } from '@/lib/classifier';
import { contentQualityFields, hasFullContent } from '@/lib/content-quality';
import { editorialExclusionReason, isRelevant } from '@/lib/relevance';
import { getWechatSource, isWechatArticleUrl } from '@/lib/wechat-sources';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

/**
 * Imports one allow-listed WeChat article by URL. Account profile crawling is
 * intentionally excluded: WeChat exposes no stable public account feed.
 */
export async function POST(request: NextRequest) {
  const authError = requireInternalApiKey(request);
  if (authError) return authError;

  try {
    const body = await request.json() as { url?: string; sourceId?: string };
    const url = String(body.url || '').trim();
    const source = getWechatSource(String(body.sourceId || ''));
    if (!source) return NextResponse.json({ error: 'Unknown or unapproved WeChat source' }, { status: 400 });
    if (!isWechatArticleUrl(url)) return NextResponse.json({ error: 'A valid mp.weixin.qq.com/s article URL is required' }, { status: 400 });

    const fetched = await fetchArticleContent(url);
    if (!fetched?.title || !hasFullContent({ content: fetched.text, content_html: fetched.html })) {
      return NextResponse.json({ error: 'Full article content could not be verified; nothing was imported' }, { status: 422 });
    }
    const exclusion = editorialExclusionReason(fetched.title, url);
    if (exclusion) return NextResponse.json({ error: `Article rejected: ${exclusion}` }, { status: 422 });

    const relevance = await isRelevant(fetched.title, fetched.text, {
      sourceId: source.id,
      url,
      enableLLM: true,
    });
    if (!relevance.relevant) {
      return NextResponse.json({ error: 'Article is not sufficiently related to factoring, supply-chain finance, or financial leasing' }, { status: 422 });
    }

    const classification = classifyArticle(fetched.title, fetched.text);
    const content = fetched.text.length > 5000
      ? fetched.text.substring(0, fetched.text.lastIndexOf('。', 5000) + 1 || 5000)
      : fetched.text;
    const article = {
      title: fetched.title,
      link: url,
      content,
      content_html: fetched.html,
      excerpt: fetched.excerpt,
      cover_image: fetched.coverImage,
      ...contentQualityFields({ content, content_html: fetched.html }),
      pub_date: fetched.pubDate || new Date().toISOString(),
      source_id: source.id,
      source_name: source.name,
      category: classification.section,
      priority: source.priority,
      weight: source.weight,
      pre_filtered: true,
      status: 'pending',
      is_selected: false,
      ai_reason: `微信公众号白名单导入；${relevance.reason || relevance.method}`,
    };

    const { data, error } = await supabase
      .from('articles')
      .upsert(article, { onConflict: 'link' })
      .select('id, title, source_name, content_quality, pub_date')
      .single();
    if (error) throw error;
    return NextResponse.json({ success: true, article: data });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Import failed' }, { status: 500 });
  }
}
