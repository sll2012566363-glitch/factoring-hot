import { NextRequest } from 'next/server';
import {
  adminClient,
  getBeijingToday,
  buildRssFeed,
  rssResponse,
} from '@/lib/public-api-utils';

// Force dynamic rendering — this route depends on runtime date
export const dynamic = 'force-dynamic';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://factoring-hot.vercel.app';
const SITE_NAME = process.env.NEXT_PUBLIC_SITE_NAME || '保理 HOT';

const CATEGORY_NAMES: Record<string, string> = {
  frontier: '前沿解读',
  industry_model: '行业前沿模式',
  regulatory: '前沿监管新闻',
  dispute: '前沿争议解决',
  normative: '前沿规范文件',
};

/**
 * GET /feed/daily.xml
 *
 * Daily report RSS — each item is a section of today's daily report.
 */
export async function GET(request: NextRequest) {
  const today = getBeijingToday();

  const { data: report, error } = await adminClient
    .from('daily_reports')
    .select('*')
    .eq('report_date', today)
    .single();

  if (error || !report) {
    // Fall back to yesterday's report
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().split('T')[0];

    const { data: fallback } = await adminClient
      .from('daily_reports')
      .select('*')
      .eq('report_date', yesterdayStr)
      .single();

    if (!fallback) {
      // Return empty feed
      const xml = buildRssFeed({
        title: `${SITE_NAME} - 日报`,
        link: `${SITE_URL}/report`,
        description: '保理行业每日日报 RSS',
        items: [],
      });
      return rssResponse(xml);
    }

    return buildDailyRss(fallback);
  }

  return buildDailyRss(report);
}

function buildDailyRss(report: any) {
  const sections: any[] = report.sections || [];

  // Flatten sections into feed items
  const items = sections.map((section: any) => ({
    title: section.name || '板块',
    link: `${SITE_URL}/report`,
    description: buildSectionDescription(section),
    pubDate: report.generated_at || report.report_date,
    guid: `daily-${report.report_date}-${section.id || section.name}`,
    category: section.id,
  }));

  // Add executive summary as first item
  if (report.executive_summary) {
    items.unshift({
      title: `📋 ${report.report_title || '今日日报摘要'}`,
      link: `${SITE_URL}/report`,
      description: report.executive_summary,
      pubDate: report.generated_at || report.report_date,
      guid: `daily-${report.report_date}-summary`,
      category: 'summary',
    });
  }

  const xml = buildRssFeed({
    title: `${SITE_NAME} - 日报`,
    link: `${SITE_URL}/report`,
    description: '保理行业每日日报 RSS',
    items,
  });

  return rssResponse(xml);
}

function buildSectionDescription(section: any): string {
  const articles: any[] = section.articles || [];
  if (articles.length === 0) return '暂无内容';

  return articles
    .slice(0, 10)
    .map((a: any, i: number) => `${i + 1}. ${a.title}${a.score ? ` (${a.score}分)` : ''}`)
    .join('\n');
}
