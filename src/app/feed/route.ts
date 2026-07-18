import { NextRequest } from 'next/server';
import {
  adminClient,
  getBeijingToday,
  buildRssFeed,
  rssResponse,
} from '@/lib/public-api-utils';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://factoring-hot.vercel.app';
const SITE_NAME = process.env.NEXT_PUBLIC_SITE_NAME || '保理 HOT';

/**
 * GET /feed.xml
 *
 * Main RSS feed — selected articles from the last 7 days, newest first.
 */
export async function GET(request: NextRequest) {
  // Last 7 days
  const since = new Date();
  since.setDate(since.getDate() - 7);

  const { data: articles, error } = await adminClient
    .from('articles')
    .select('*')
    .eq('is_selected', true)
    .or('pre_filtered.is.null,pre_filtered.eq.true')
    .gte('pub_date', since.toISOString())
    .order('pub_date', { ascending: false })
    .order('score', { ascending: false })
    .limit(50);

  if (error) {
    return new Response('Feed generation failed', { status: 500 });
  }

  const xml = buildRssFeed({
    title: `${SITE_NAME} - 精选资讯`,
    link: SITE_URL,
    description: '保理与供应链金融行业精选资讯 RSS',
    items: (articles || []).map(a => ({
      title: a.title,
      link: a.link,
      description: a.excerpt || a.content?.substring(0, 200) || '',
      pubDate: a.pub_date,
      guid: a.id,
      category: a.category,
    })),
  });

  return rssResponse(xml);
}
