import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/** Extract a clean article card for report JSONB sections */
function articleCard(a: any) {
  return {
    id: a.id,
    title: a.title,
    link: a.link,
    source_name: a.source_name,
    score: a.score,
    excerpt: a.excerpt || (a.content || '').substring(0, 200),
    pub_date: a.pub_date,
    category: a.category,
  };
}

async function generateWeeklyReport(year: number, week: number) {
  console.log(`📊 Generating weekly report for ${year} week ${week}...`);

  const startDate = getWeekStartDate(year, week);
  const endDate = new Date(startDate);
  endDate.setDate(endDate.getDate() + 6);

  const { data: articles, error } = await supabase
    .from('articles')
    .select('*')
    .gte('pub_date', startDate.toISOString().split('T')[0])
    .lte('pub_date', endDate.toISOString().split('T')[0])
    .not('score', 'is', null)
    .order('score', { ascending: false });

  if (error || !articles) {
    console.error('Failed to fetch articles:', error);
    return;
  }

  console.log(`Found ${articles.length} articles for this week`);

  // Section assignments: articles are already classified by the classifier
  const frontierArticles = articles.filter(a => a.category === 'frontier');
  const industryArticles = articles.filter(a => a.category === 'industry_model');
  const regulatoryArticles = articles.filter(a => a.category === 'regulatory');
  const disputeArticles = articles.filter(a => a.category === 'dispute');
  const normativeArticles = articles.filter(a => a.category === 'normative');

  const report = {
    id: `weekly-${year}-W${week}`,
    year,
    week_number: week,
    report_title: `${year}年第${week}周 保理与供应链金融行业周报`,
    report_date_range: {
      start: startDate.toISOString().split('T')[0],
      end: endDate.toISOString().split('T')[0]
    },
    section_frontier_interpretation: {
      title: '前沿解读',
      articles: frontierArticles.slice(0, 5).map(articleCard),
    },
    section_industry_model: {
      title: '行业前沿模式',
      articles: industryArticles.slice(0, 5).map(articleCard),
    },
    section_regulatory_news: {
      title: '前沿监管新闻',
      articles: regulatoryArticles.slice(0, 5).map(articleCard),
    },
    section_dispute_resolution: {
      title: '前沿争议解决',
      articles: disputeArticles.slice(0, 5).map(articleCard),
    },
    section_normative_documents: {
      title: '前沿规范文件',
      articles: normativeArticles.slice(0, 5).map(articleCard),
    },
    executive_summary: `本周共收录${articles.length}篇文章，其中前沿解读${frontierArticles.length}篇，行业前沿模式${industryArticles.length}篇，前沿监管新闻${regulatoryArticles.length}篇，前沿争议解决${disputeArticles.length}篇，前沿规范文件${normativeArticles.length}篇。`,
    key_insights: generateKeyInsights(articles),
    trend_analysis: {
      category_distribution: {
        frontier: frontierArticles.length,
        industry_model: industryArticles.length,
        regulatory: regulatoryArticles.length,
        dispute: disputeArticles.length,
        normative: normativeArticles.length,
      },
      top_sources: getTopSources(articles, 5),
    },
    total_articles: articles.length,
    generated_at: new Date().toISOString()
  };

  const { error: insertError } = await supabase
    .from('weekly_reports')
    .upsert(report);

  if (insertError) {
    console.error('Failed to save weekly report:', insertError);
  } else {
    console.log('✅ Weekly report generated successfully!');
  }
}

async function generateMonthlyReport(year: number, month: number) {
  console.log(`📊 Generating monthly report for ${year}-${month}...`);

  const startDate = new Date(year, month - 1, 1);
  const endDate = new Date(year, month, 0); // last day of month

  const { data: articles, error } = await supabase
    .from('articles')
    .select('*')
    .gte('pub_date', startDate.toISOString().split('T')[0])
    .lte('pub_date', endDate.toISOString().split('T')[0])
    .not('score', 'is', null)
    .order('score', { ascending: false });

  if (error || !articles) {
    console.error('Failed to fetch articles:', error);
    return;
  }

  console.log(`Found ${articles.length} scored articles for ${year}年${month}月`);

  // Group by section (articles already classified by classifier)
  const frontierArticles = articles.filter(a => a.category === 'frontier');
  const industryArticles = articles.filter(a => a.category === 'industry_model');
  const regulatoryArticles = articles.filter(a => a.category === 'regulatory');
  const disputeArticles = articles.filter(a => a.category === 'dispute');
  const normativeArticles = articles.filter(a => a.category === 'normative');

  // Split regulatory into national vs regional for sub-sections
  const regionalKeywords = ['省', '市', '区', '自治区', '天津', '广东', '浙江', '山东', '江苏', '上海', '四川', '陕西', '深圳', '重庆', '北京', '福建', '湖北', '湖南', '河南', '安徽', '河北', '辽宁', '吉林', '黑龙江', '江西', '广西', '云南', '贵州', '甘肃', '海南'];
  const nationalRegulatory = regulatoryArticles.filter(a =>
    !regionalKeywords.some(kw => (a.title || '').includes(kw))
  );
  const regionalRegulatory = regulatoryArticles.filter(a =>
    regionalKeywords.some(kw => (a.title || '').includes(kw))
  );

  // Build 5 sections matching the DOCX structure
  const frontierCards = frontierArticles.slice(0, 5).map(articleCard);
  const industryCards = industryArticles.slice(0, 5).map(articleCard);
  const regulatoryNational = nationalRegulatory.slice(0, 5).map(articleCard);
  const regulatoryRegional = regionalRegulatory.slice(0, 5).map(articleCard);
  const disputeCards = disputeArticles.slice(0, 5).map(articleCard);
  const normativeCards = normativeArticles.slice(0, 10).map(articleCard);

  // Generate executive summary
  const avgScore = articles.length > 0
    ? (articles.reduce((s, a) => s + (a.score || 0), 0) / articles.length).toFixed(1)
    : '0';

  const executiveSummary = [
    `${year}年${month}月，保理与供应链金融研究中心共收录${articles.length}篇行业资讯。`,
    `其中前沿解读${frontierArticles.length}篇，行业前沿模式${industryArticles.length}篇，前沿监管新闻${regulatoryArticles.length}篇，前沿争议解决${disputeArticles.length}篇，前沿规范文件${normativeArticles.length}篇。`,
    `本月文章平均评分${avgScore}分。`,
  ].join('');

  // Trend analysis
  const trendAnalysis = {
    category_distribution: {
      frontier: frontierArticles.length,
      industry_model: industryArticles.length,
      regulatory: regulatoryArticles.length,
      dispute: disputeArticles.length,
      normative: normativeArticles.length,
    },
    avg_score: Number(avgScore),
    top_sources: getTopSources(articles, 8),
    weekly_breakdown: getWeeklyBreakdown(articles, year, month),
  };

  // Expert opinions — top 3 articles with excerpts as "expert picks"
  const expertOpinions = articles.slice(0, 3).map(a => ({
    title: a.title,
    source: a.source_name,
    score: a.score,
    opinion: a.excerpt || `本文评分${a.score}分，为本月重要文章。`,
  }));

  const report = {
    id: `monthly-${year}-${month}`,
    year,
    month,
    report_title: `供应链和供应链金融前沿${year}年${monthName(month)}刊`,
    report_date_range: {
      start: startDate.toISOString().split('T')[0],
      end: endDate.toISOString().split('T')[0]
    },
    section_frontier_interpretation: {
      title: '前沿解读',
      articles: frontierCards,
    },
    section_industry_model: {
      title: '行业前沿模式',
      articles: industryCards,
    },
    section_regulatory_news: {
      title: '前沿监管新闻',
      subsections: [
        { title: '监管速递', articles: regulatoryNational },
        { title: '区域监管新闻', articles: regulatoryRegional },
      ],
    },
    section_dispute_resolution: {
      title: '前沿争议解决',
      articles: disputeCards,
    },
    section_normative_documents: {
      title: '前沿规范文件',
      articles: normativeCards,
    },
    editorial_board: {
      chief_editor: '田江涛',
      chief_editor_title: '北京德和衡（上海）律师事务所 金融业务中心 供应链研究中心 主任律师',
      chief_editor_phone: '18516208227',
      deputy_editors: ['万典', '程冰露', '杨杰', '朱嘉程'],
      editorial_members: ['陈怡然', '杨梦婷', '洪健', '刘雷'],
    },
    executive_summary: executiveSummary,
    monthly_overview: {
      total_articles: articles.length,
      by_category: {
        frontier: frontierArticles.length,
        industry_model: industryArticles.length,
        regulatory: regulatoryArticles.length,
        dispute: disputeArticles.length,
        normative: normativeArticles.length,
      },
      avg_score: Number(avgScore),
    },
    trend_charts: trendAnalysis,
    expert_opinions: expertOpinions,
    total_articles: articles.length,
    generated_at: new Date().toISOString()
  };

  const { error: insertError } = await supabase
    .from('monthly_reports')
    .upsert(report);

  if (insertError) {
    console.error('Failed to save monthly report:', insertError);
  } else {
    console.log(`✅ Monthly report generated: ${report.report_title}`);
    console.log(`   - 前沿解读: ${frontierArticles.length} 篇`);
    console.log(`   - 行业前沿模式: ${industryArticles.length} 篇`);
    console.log(`   - 监管速递: ${regulatoryNational.length} 篇`);
    console.log(`   - 区域监管新闻: ${regulatoryRegional.length} 篇`);
    console.log(`   - 前沿争议解决: ${disputeArticles.length} 篇`);
    console.log(`   - 前沿规范文件: ${normativeArticles.length} 篇`);
  }
}

// ── Helpers ──────────────────────────────────────────

function monthName(m: number): string {
  const names: Record<number, string> = {
    1: '一', 2: '二', 3: '三', 4: '四', 5: '五', 6: '六',
    7: '七', 8: '八', 9: '九', 10: '十', 11: '十一', 12: '十二',
  };
  return names[m] || String(m);
}

function categoryLabel(cat: string): string {
  const labels: Record<string, string> = {
    frontier: '前沿解读', industry_model: '行业前沿模式',
    regulatory: '前沿监管新闻', dispute: '前沿争议解决', normative: '前沿规范文件',
  };
  return labels[cat] || cat;
}

function getTopSources(articles: any[], limit: number): { name: string; count: number }[] {
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

function generateKeyInsights(articles: any[]): string[] {
  const insights: string[] = [];
  const regulatory = articles.filter(a => a.category === 'regulatory');
  const dispute = articles.filter(a => a.category === 'dispute');
  if (regulatory.length > 0) insights.push(`本周前沿监管新闻${regulatory.length}篇，${regulatory[0].title}值得重点关注。`);
  if (dispute.length > 0) insights.push(`前沿争议解决类资讯${dispute.length}篇，${dispute[0].title}需引起注意。`);
  if (articles.length > 0) insights.push(`评分最高文章：${articles[0].title}（${articles[0].score}分）`);
  return insights;
}

function getWeeklyBreakdown(articles: any[], year: number, month: number) {
  const weeks: Record<string, { start: string; end: string; count: number }> = {};
  for (const a of articles) {
    const d = new Date(a.pub_date);
    const weekNum = Math.ceil(d.getDate() / 7);
    const key = `W${weekNum}`;
    if (!weeks[key]) {
      const wStart = new Date(year, month - 1, (weekNum - 1) * 7 + 1);
      const wEnd = new Date(year, month - 1, Math.min(weekNum * 7, new Date(year, month, 0).getDate()));
      weeks[key] = {
        start: wStart.toISOString().split('T')[0],
        end: wEnd.toISOString().split('T')[0],
        count: 0,
      };
    }
    weeks[key].count++;
  }
  return weeks;
}

/** ISO 8601 week start: Monday of the given ISO week */
function getWeekStartDate(year: number, week: number): Date {
  const jan4 = new Date(year, 0, 4);
  const dayOfWeek = jan4.getDay() || 7;
  const mondayOfWeek1 = new Date(jan4);
  mondayOfWeek1.setDate(jan4.getDate() - dayOfWeek + 1);
  const result = new Date(mondayOfWeek1);
  result.setDate(mondayOfWeek1.getDate() + (week - 1) * 7);
  return result;
}

/** ISO 8601 week number */
function getISOWeekNumber(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
}

// ── CLI ──────────────────────────────────────────────

const args = process.argv.slice(2);
const command = args[0];

if (command === 'weekly') {
  const year = parseInt(args[1]) || new Date().getFullYear();
  const week = parseInt(args[2]) || getISOWeekNumber(new Date());
  generateWeeklyReport(year, week);
} else if (command === 'monthly') {
  const year = parseInt(args[1]) || new Date().getFullYear();
  const month = parseInt(args[2]) || new Date().getMonth() + 1;
  generateMonthlyReport(year, month);
} else {
  console.log('Usage: npm run report:weekly -- [year] [week]');
  console.log('       npm run report:monthly -- [year] [month]');
}
