import { NextRequest } from 'next/server';
import {
  adminClient,
  buildRssFeed,
  rssResponse,
} from '@/lib/public-api-utils';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://factoring-hot.vercel.app';
const SITE_NAME = process.env.NEXT_PUBLIC_SITE_NAME || '保理 HOT';

/**
 * GET /feed/all.xml
 *
 * Full RSS feed — all articles from the last 3 days, regardless of selection status.
 */
export async function GET(request: NextRequest) {
  const since = new Date();
  since.setDate(since.getDate() - 3);

  const { data: articles, error } = await adminClient
    .from('articles')
    .select('*')
    .eq('pre_filtered', true)
    .eq('status', 'selected')
    .eq('is_selected', true)
    .gte('pub_date', since.toISOString())
    .order('pub_date', { ascending: false })
    .limit(100);

  if (error) {
    return new Response('Feed generation failed', { status: 500 });
  }

  const xml = buildRssFeed({
    title: `${SITE_NAME} - 全部资讯`,
    link: `${SITE_URL}/all`,
    description: '保理与供应链金融行业全部资讯 RSS',
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
