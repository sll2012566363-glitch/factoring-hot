import { NextRequest, NextResponse } from 'next/server';
import {
  adminClient,
  buildRssFeed,
  rssResponse,
} from '@/lib/public-api-utils';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://factoring-hot.vercel.app';
const SITE_NAME = process.env.NEXT_PUBLIC_SITE_NAME || '保理 HOT';

const VALID_CATEGORIES: Record<string, string> = {
  frontier: '前沿解读',
  industry_model: '行业前沿模式',
  regulatory: '前沿监管新闻',
  dispute: '前沿争议解决',
  normative: '前沿规范文件',
};

/**
 * GET /feed/category/[cat].xml
 *
 * Category-specific RSS feed — articles from a single category.
 * URL pattern: /feed/category/policy.xml
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { cat: string } }
) {
  // Strip .xml suffix if present (Next.js may include it in the param)
  const cat = params.cat.replace(/\.xml$/, '');

  if (!(cat in VALID_CATEGORIES)) {
    return NextResponse.json(
      { error: `Invalid category. Must be one of: ${Object.keys(VALID_CATEGORIES).join(', ')}` },
      { status: 404 }
    );
  }

  const since = new Date();
  since.setDate(since.getDate() - 7);

  const { data: articles, error } = await adminClient
    .from('articles')
    .select('*')
    .eq('category', cat)
    .eq('is_selected', true)
    .or('pre_filtered.is.null,pre_filtered.eq.true')
    .gte('pub_date', since.toISOString())
    .order('score', { ascending: false })
    .limit(30);

  if (error) {
    return new Response('Feed generation failed', { status: 500 });
  }

  const catName = VALID_CATEGORIES[cat];
  const xml = buildRssFeed({
    title: `${SITE_NAME} - ${catName}`,
    link: `${SITE_URL}/all?category=${cat}`,
    description: `保理行业${catName}分类资讯 RSS`,
    items: (articles || []).map(a => ({
      title: a.title,
      link: a.link,
      description: a.excerpt || a.content?.substring(0, 200) || '',
      pubDate: a.pub_date,
      guid: a.id,
      category: cat,
    })),
  });

  return rssResponse(xml);
}
