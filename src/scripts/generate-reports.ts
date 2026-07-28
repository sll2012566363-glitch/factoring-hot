import { createClient } from '@supabase/supabase-js';
import { hasFullContent } from '@/lib/content-quality';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// ── Shared ─────────────────────────────────────────────

const CATEGORIES = ['frontier', 'industry_model', 'regulatory', 'dispute', 'normative'] as const;

const DAILY_LIMITS = {
  mustRead: 3,
  industryUpdates: 15,
  sourceSignals: 8,
};

function articleCard(a: any) {
  return {
    id: a.id,
    title: a.title,
    link: a.link,
    source_name: a.source_name,
    score: a.score,
    ai_reason: a.ai_reason,
    excerpt: a.excerpt || (a.content || '').substring(0, 200),
    pub_date: a.pub_date,
    category: a.category,
  };
}

function getBeijingDate(): Date {
  const now = new Date();
  return new Date(now.getTime() + 8 * 60 * 60 * 1000);
}

function getISOWeekNumber(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
}

function getWeekStartDate(year: number, week: number): Date {
  const jan4 = new Date(year, 0, 4);
  const dayOfWeek = jan4.getDay() || 7;
  const mondayOfWeek1 = new Date(jan4);
  mondayOfWeek1.setDate(jan4.getDate() - dayOfWeek + 1);
  const result = new Date(mondayOfWeek1);
  result.setDate(mondayOfWeek1.getDate() + (week - 1) * 7);
  return result;
}

function monthName(m: number): string {
  const names: Record<number, string> = {
    1: '一', 2: '二', 3: '三', 4: '四', 5: '五', 6: '六',
    7: '七', 8: '八', 9: '九', 10: '十', 11: '十一', 12: '十二',
  };
  return names[m] || String(m);
}

function getTopSources(articles: any[], limit: number) {
  const counts = new Map<string, number>();
  for (const a of articles) {
    const name = a.source_name || '未知来源';
    counts.set(name, (counts.get(name) || 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}

// ── Daily Report ──────────────────────────────────────

export async function generateDailyReport(dateStr?: string) {
  const bj = getBeijingDate();
  const date = dateStr || bj.toISOString().split('T')[0];

  console.log(` Generating daily report for ${date}...`);

  const startOfDay = `${date}T00:00:00+08:00`;
  const endOfDay = `${date}T23:59:59+08:00`;

  const priorDate = new Date(`${date}T00:00:00+08:00`);
  priorDate.setUTCDate(priorDate.getUTCDate() - 7);
  const recentStart = `${priorDate.toISOString().slice(0, 10)}T00:00:00+08:00`;
  const [{ data: selectedRows, error }, { data: pendingRows, error: pendingError }, { data: recentRows, error: recentError }] = await Promise.all([
    supabase.from('articles').select('*').gte('pub_date', startOfDay).lte('pub_date', endOfDay)
      .eq('pre_filtered', true).eq('status', 'selected').eq('is_selected', true).order('score', { ascending: false }),
    supabase.from('articles').select('*').gte('pub_date', startOfDay).lte('pub_date', endOfDay)
      .eq('pre_filtered', true).eq('status', 'pending').order('pub_date', { ascending: false }),
    supabase.from('articles').select('*').gte('pub_date', recentStart).lt('pub_date', startOfDay)
      .eq('pre_filtered', true).eq('status', 'selected').eq('is_selected', true).order('score', { ascending: false }).limit(5),
  ]);

  if (error || pendingError || recentError || !selectedRows || !pendingRows || !recentRows) {
    console.error('Failed to fetch articles:', error || pendingError || recentError);
    throw error || pendingError || recentError || new Error('Failed to fetch daily report articles');
  }

  // 三层日报：全文强相关精选、已终审动态、待终审原文线索。
  const selected = selectedRows.filter((a) => (a.score || 0) >= 35);
  const mustRead = selected.filter((a) => (a.score || 0) >= 65 && hasFullContent(a)).slice(0, DAILY_LIMITS.mustRead);
  const mustReadIds = new Set(mustRead.map((a) => a.id));
  const industryUpdates = selected.filter((a) => !mustReadIds.has(a.id)).slice(0, DAILY_LIMITS.industryUpdates);
  const sourceSignals = pendingRows.slice(0, DAILY_LIMITS.sourceSignals);
  const recentHighlights = recentRows.filter((a) => (a.score || 0) >= 35 && hasFullContent(a));
  const articles = [...mustRead, ...industryUpdates];
  console.log(`Found ${mustRead.length} must-read, ${industryUpdates.length} industry updates and ${sourceSignals.length} pending signals for ${date}`);

  const categories = new Map<string, number>();
  for (const article of articles) categories.set(article.category, (categories.get(article.category) || 0) + 1);
  const categoryNames: Record<string, string> = {
    frontier: '前沿解读', industry_model: '业务与市场', regulatory: '监管政策', dispute: '风险与争议', normative: '规范文件',
  };
  const signals = Array.from(categories.entries()).sort((a, b) => b[1] - a[1]).slice(0, 3)
    .map(([category, count]) => `${categoryNames[category] || '行业动态'} ${count} 篇`);
  const sections = [
    { id: 'must_read', name: '今日必读', maxItems: DAILY_LIMITS.mustRead, tier: 'must_read', articles: mustRead.map(articleCard) },
    { id: 'industry_updates', name: '行业动态', maxItems: DAILY_LIMITS.industryUpdates, tier: 'industry_updates', articles: industryUpdates.map(articleCard) },
    { id: 'source_signals', name: '原文线索', maxItems: DAILY_LIMITS.sourceSignals, tier: 'source_signals', articles: sourceSignals.map(articleCard) },
    ...(articles.length === 0 && recentHighlights.length > 0 ? [{ id: 'recent_highlights', name: '近 7 日精选', maxItems: 5, tier: 'recent_highlights', articles: recentHighlights.map(articleCard) }] : []),
    { id: 'today_signals', name: '今日信号', tier: 'today_signals', signals, articles: [] },
  ];

  const avgScore = articles.length > 0
    ? (articles.reduce((s, a) => s + (a.score || 0), 0) / articles.length).toFixed(1)
    : '0';

  const report = {
    id: `daily-${date}`,
    report_date: date,
    report_title: `${date} 保理日报`,
    sections,
    total_articles: articles.length,
    executive_summary: articles.length > 0
      ? `${date}终审收录${articles.length}篇行业资讯，其中今日必读${mustRead.length}篇；另有${sourceSignals.length}条原文线索待终审。`
      : `${date}暂无新增终审行业资讯；系统仍在持续抓取、评分与核验。${recentHighlights.length ? `下方保留近7日${recentHighlights.length}篇可读精选。` : ''}`,
    generated_at: new Date().toISOString(),
  };

  const { error: insertError } = await supabase
    .from('daily_reports')
    .upsert(report, { onConflict: 'report_date' });

  if (insertError) {
    console.error('Failed to save daily report:', insertError);
    throw insertError;
  } else {
    console.log(`✅ Daily report generated: ${report.report_title}`);
    console.log(`   Total: ${articles.length} articles, avg score: ${avgScore}`);
  }
  return report;
}

// ── Weekly Report ──────────────────────────────────────

export async function generateWeeklyReport(year: number, week: number) {
  console.log(` Generating weekly report for ${year} week ${week}...`);

  const startDate = getWeekStartDate(year, week);
  const endDate = new Date(startDate);
  endDate.setDate(endDate.getDate() + 7);

  const { data: rows, error } = await supabase
    .from('articles')
    .select('*')
    .gte('pub_date', `${startDate.toISOString().split('T')[0]}T00:00:00+08:00`)
    .lt('pub_date', `${endDate.toISOString().split('T')[0]}T00:00:00+08:00`)
    .eq('pre_filtered', true)
    .eq('status', 'selected')
    .eq('is_selected', true)
    .order('score', { ascending: false });

  if (error || !rows) {
    console.error('Failed to fetch articles:', error);
    throw error || new Error('Failed to fetch weekly report articles');
  }

  const articles = rows.filter(hasFullContent);
  console.log(`Found ${articles.length} full-text articles for this week`);

  const byCategory = (cat: string) => articles.filter(a => a.category === cat);

  const insights: string[] = [];
  const regulatory = byCategory('regulatory');
  const dispute = byCategory('dispute');
  if (regulatory.length > 0) insights.push(`本周前沿监管新闻${regulatory.length}篇，${regulatory[0].title}值得重点关注。`);
  if (dispute.length > 0) insights.push(`前沿争议解决类资讯${dispute.length}篇，${dispute[0].title}需引起注意。`);
  if (articles[0]) insights.push(`评分最高文章：${articles[0].title}（${articles[0].score}分）`);
  if (articles.length === 0) insights.push('本周暂无已完成评分的新增行业资讯。');

  const report = {
    id: `weekly-${year}-W${week}`,
    year,
    week_number: week,
    report_title: `${year}年第${week}周 保理与供应链金融行业周报`,
    report_date_range: {
      start: startDate.toISOString().split('T')[0],
      end: new Date(endDate.getTime() - 86400000).toISOString().split('T')[0],
    },
    section_frontier_interpretation: {
      title: '前沿解读',
      articles: byCategory('frontier').slice(0, 5).map(articleCard),
    },
    section_industry_model: {
      title: '行业前沿模式',
      articles: byCategory('industry_model').slice(0, 5).map(articleCard),
    },
    section_regulatory_news: {
      title: '前沿监管新闻',
      articles: regulatory.slice(0, 5).map(articleCard),
    },
    section_dispute_resolution: {
      title: '前沿争议解决',
      articles: dispute.slice(0, 5).map(articleCard),
    },
    section_normative_documents: {
      title: '前沿规范文件',
      articles: byCategory('normative').slice(0, 5).map(articleCard),
    },
    executive_summary: `本周共收录${articles.length}篇文章，其中前沿解读${byCategory('frontier').length}篇，行业前沿模式${byCategory('industry_model').length}篇，前沿监管新闻${regulatory.length}篇，前沿争议解决${dispute.length}篇，前沿规范文件${byCategory('normative').length}篇。`,
    key_insights: insights,
    trend_analysis: {
      category_distribution: {
        frontier: byCategory('frontier').length,
        industry_model: byCategory('industry_model').length,
        regulatory: regulatory.length,
        dispute: dispute.length,
        normative: byCategory('normative').length,
      },
      top_sources: getTopSources(articles, 5),
    },
    total_articles: articles.length,
    generated_at: new Date().toISOString(),
  };

  const { error: insertError } = await supabase
    .from('weekly_reports')
    .upsert(report, { onConflict: 'year,week_number' });

  if (insertError) {
    console.error('Failed to save weekly report:', insertError);
    throw insertError;
  } else {
    console.log('✅ Weekly report generated successfully!');
  }
  return report;
}

// ── Monthly Report ─────────────────────────────────────

async function generateMonthlyReport(year: number, month: number) {
  console.log(`📊 Generating monthly report for ${year}-${month}...`);

  const startDate = new Date(year, month - 1, 1);
  const endDate = new Date(year, month, 1);

  const { data: rows, error } = await supabase
    .from('articles')
    .select('*')
    .gte('pub_date', `${startDate.toISOString().split('T')[0]}T00:00:00+08:00`)
    .lt('pub_date', `${endDate.toISOString().split('T')[0]}T00:00:00+08:00`)
    .eq('pre_filtered', true)
    .eq('status', 'selected')
    .eq('is_selected', true)
    .order('score', { ascending: false });

  if (error || !rows) {
    console.error('Failed to fetch articles:', error);
    return;
  }

  const articles = rows.filter(hasFullContent);
  console.log(`Found ${articles.length} full-text scored articles for ${year}年${month}月`);

  if (articles.length === 0) {
    console.log('No articles for this month, skipping.');
    return;
  }

  const byCategory = (cat: string) => articles.filter(a => a.category === cat);

  const regionalKeywords = ['省', '市', '区', '自治区', '天津', '广东', '浙江', '山东', '江苏', '上海', '四川', '陕西', '深圳', '重庆', '北京', '福建', '湖北', '湖南', '河南', '安徽', '河北', '辽宁', '吉林', '黑龙江', '江西', '广西', '云南', '贵州', '甘肃', '海南'];
  const nationalRegulatory = byCategory('regulatory').filter(a =>
    !regionalKeywords.some(kw => (a.title || '').includes(kw))
  );
  const regionalRegulatory = byCategory('regulatory').filter(a =>
    regionalKeywords.some(kw => (a.title || '').includes(kw))
  );

  const avgScore = articles.length > 0
    ? (articles.reduce((s, a) => s + (a.score || 0), 0) / articles.length).toFixed(1)
    : '0';

  const executiveSummary = [
    `${year}年${month}月，保理与供应链金融研究中心共收录${articles.length}篇行业资讯。`,
    `其中前沿解读${byCategory('frontier').length}篇，行业前沿模式${byCategory('industry_model').length}篇，前沿监管新闻${byCategory('regulatory').length}篇，前沿争议解决${byCategory('dispute').length}篇，前沿规范文件${byCategory('normative').length}篇。`,
    `本月文章平均评分${avgScore}分。`,
  ].join('');

  const report = {
    id: `monthly-${year}-${month}`,
    year,
    month,
    report_title: `供应链和供应链金融前沿${year}年${monthName(month)}月刊`,
    report_date_range: {
      start: startDate.toISOString().split('T')[0],
      end: endDate.toISOString().split('T')[0],
    },
    section_frontier_interpretation: {
      title: '前沿解读',
      articles: byCategory('frontier').slice(0, 5).map(articleCard),
    },
    section_industry_model: {
      title: '行业前沿模式',
      articles: byCategory('industry_model').slice(0, 5).map(articleCard),
    },
    section_regulatory_news: {
      title: '前沿监管新闻',
      subsections: [
        { title: '监管速递', articles: nationalRegulatory.slice(0, 5).map(articleCard) },
        { title: '区域监管新闻', articles: regionalRegulatory.slice(0, 5).map(articleCard) },
      ],
    },
    section_dispute_resolution: {
      title: '前沿争议解决',
      articles: byCategory('dispute').slice(0, 5).map(articleCard),
    },
    section_normative_documents: {
      title: '前沿规范文件',
      articles: byCategory('normative').slice(0, 10).map(articleCard),
    },
    executive_summary: executiveSummary,
    monthly_overview: {
      total_articles: articles.length,
      by_category: {
        frontier: byCategory('frontier').length,
        industry_model: byCategory('industry_model').length,
        regulatory: byCategory('regulatory').length,
        dispute: byCategory('dispute').length,
        normative: byCategory('normative').length,
      },
      avg_score: Number(avgScore),
    },
    trend_charts: {
      category_distribution: {
        frontier: byCategory('frontier').length,
        industry_model: byCategory('industry_model').length,
        regulatory: byCategory('regulatory').length,
        dispute: byCategory('dispute').length,
        normative: byCategory('normative').length,
      },
      avg_score: Number(avgScore),
      top_sources: getTopSources(articles, 8),
    },
    total_articles: articles.length,
    generated_at: new Date().toISOString(),
  };

  const { error: insertError } = await supabase
    .from('monthly_reports')
    .upsert(report, { onConflict: 'year,month' });

  if (insertError) {
    console.error('Failed to save monthly report:', insertError);
  } else {
    console.log(`✅ Monthly report generated: ${report.report_title}`);
  }
}

// ── CLI ────────────────────────────────────────────────

const args = process.argv.slice(2);
const command = args[0];

if (command === 'daily') {
  const date = args[1] || getBeijingDate().toISOString().split('T')[0];
  generateDailyReport(date);
} else if (command === 'weekly') {
  const year = parseInt(args[1]) || getBeijingDate().getFullYear();
  const week = parseInt(args[2]) || getISOWeekNumber(getBeijingDate());
  generateWeeklyReport(year, week);
} else if (command === 'monthly') {
  const year = parseInt(args[1]) || getBeijingDate().getFullYear();
  const month = parseInt(args[2]) || (getBeijingDate().getMonth() + 1);
  generateMonthlyReport(year, month);
} else if (command === 'all') {
  // Generate all reports for current period
  const bj = getBeijingDate();
  const dateStr = bj.toISOString().split('T')[0];
  const year = bj.getFullYear();
  const month = bj.getMonth() + 1;
  const week = getISOWeekNumber(bj);

  console.log('🚀 Generating all reports...\n');
  generateDailyReport(dateStr).then(() => {
    return generateWeeklyReport(year, week);
  }).then(() => {
    return generateMonthlyReport(year, month);
  }).then(() => {
    console.log('\n✅ All reports generated!');
  });
} else {
  console.log('Usage:');
  console.log('  npm run report:daily -- [date]          # e.g. 2026-07-07');
  console.log('  npm run report:weekly -- [year] [week]  # e.g. 2026 28');
  console.log('  npm run report:monthly -- [year] [month] # e.g. 2026 7');
  console.log('  npm run report:all                       # Generate all current reports');
}
