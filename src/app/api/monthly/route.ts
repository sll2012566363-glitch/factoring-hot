import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * GET /api/monthly
 *
 * Query params:
 *   year  — filter by year (default: current year)
 *   month — specific month (1-12)
 *   limit — max results (default: 12)
 */
export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const now = new Date();
  const beijingOffset = 8 * 60 * 60 * 1000;
  const beijingDate = new Date(now.getTime() + beijingOffset);
  const currentYear = beijingDate.getFullYear();

  const year = parseInt(sp.get('year') || String(currentYear));
  const month = sp.get('month');
  const limit = Math.min(parseInt(sp.get('limit') || '12'), 24);

  if (month) {
    const { data, error } = await supabase
      .from('monthly_reports')
      .select('*')
      .eq('year', year)
      .eq('month', parseInt(month))
      .single();

    if (error || !data) {
      return NextResponse.json({ error: 'Monthly report not found' }, { status: 404 });
    }
    return NextResponse.json(data);
  }

  const { data, error } = await supabase
    .from('monthly_reports')
    .select('*')
    .eq('year', year)
    .order('month', { ascending: false })
    .limit(limit);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    reports: data || [],
    year,
    total: (data || []).length,
  });
}

/**
 * POST /api/monthly/generate
 *
 * Body: { year: number, month: number }
 *
 * Triggers monthly report generation for the given month.
 * Queries all scored articles, picks top-scoring per section, and upserts.
 */
export async function POST(request: NextRequest) {
  const body = await request.json();
  const year = parseInt(body.year) || new Date().getFullYear();
  const month = parseInt(body.month) || (new Date().getMonth() + 1);

  if (month < 1 || month > 12) {
    return NextResponse.json({ error: 'month must be 1-12' }, { status: 400 });
  }

  const startDate = new Date(year, month - 1, 1);
  const endDate = new Date(year, month, 0);

  const { data: articles, error } = await supabase
    .from('articles')
    .select('*')
    .gte('pub_date', startDate.toISOString().split('T')[0])
    .lte('pub_date', endDate.toISOString().split('T')[0])
    .not('score', 'is', null)
    .order('score', { ascending: false });

  if (error || !articles) {
    return NextResponse.json({ error: error?.message || 'No articles' }, { status: 500 });
  }

  const card = (a: any) => ({
    id: a.id, title: a.title, link: a.link,
    source_name: a.source_name, score: a.score,
    excerpt: a.excerpt || (a.content || '').substring(0, 200),
    pub_date: a.pub_date, category: a.category,
  });

  const regulatoryArticles = articles.filter((a: any) => a.category === 'policy');
  const industryModelArticles = articles.filter((a: any) => a.category === 'market' || a.category === 'innovation');
  const disputeArticles = articles.filter((a: any) => a.category === 'risk');
  const frontierArticles = articles.filter((a: any) => a.category === 'innovation');
  const normativeArticles = regulatoryArticles; // policy → regulatory + normative

  // National vs regional split for regulatory
  const regionalKw = ['省', '市', '自治区', '天津', '广东', '浙江', '山东', '江苏', '上海', '四川', '陕西', '深圳', '重庆', '北京', '福建', '湖北', '湖南', '河南'];
  const nationalPolicy = regulatoryArticles.filter((a: any) => !regionalKw.some(kw => (a.title || '').includes(kw)));
  const regionalPolicy = regulatoryArticles.filter((a: any) => regionalKw.some(kw => (a.title || '').includes(kw)));

  const monthNames: Record<number, string> = { 1:'一',2:'二',3:'三',4:'四',5:'五',6:'六',7:'七',8:'八',9:'九',10:'十',11:'十一',12:'十二' };
  const avgScore = articles.length > 0 ? +(articles.reduce((s: number, a: any) => s + (a.score || 0), 0) / articles.length).toFixed(1) : 0;

  const report = {
    id: `monthly-${year}-${month}`,
    year,
    month,
    report_title: `供应链和供应链金融前沿${year}年${monthNames[month]}月刊`,
    report_date_range: { start: startDate.toISOString().split('T')[0], end: endDate.toISOString().split('T')[0] },
    section_frontier_interpretation: { title: '前沿解读', articles: articles.slice(0, 3).map(card) },
    section_industry_model: {
      title: '行业前沿模式',
      articles: industryModelArticles.sort((a, b) => (b.score || 0) - (a.score || 0)).slice(0, 5).map(card),
    },
    section_regulatory_news: {
      title: '前沿监管新闻',
      subsections: [
        { title: '监管速递', articles: nationalPolicy.slice(0, 5).map(card) },
        { title: '区域监管新闻', articles: regionalPolicy.slice(0, 5).map(card) },
      ],
    },
    section_dispute_resolution: { title: '前沿争议解决', articles: disputeArticles.slice(0, 5).map(card) },
    section_normative_documents: { title: '前沿规范文件', articles: normativeArticles.slice(0, 10).map(card) },
    editorial_board: {
      chief_editor: '田江涛',
      chief_editor_title: '北京德和衡（上海）律师事务所 金融业务中心 供应链研究中心 主任律师',
      chief_editor_phone: '18516208227',
      deputy_editors: ['万典', '程冰露', '杨杰', '朱嘉程'],
      editorial_members: ['陈怡然', '杨梦婷', '洪健', '刘雷'],
    },
    center_intro: {
      name: '德和衡供应链研究中心',
      description: '德和衡保理与供应链律师团队，由田江涛律师主持，专注于保理法律服务，首创"保理+供应链"综合法律服务产品，累计服务超100家保理、融资租赁、供应链公司。',
      service_model: '1+2法律服务模式："保理+供应链（管理+金融）"',
    },
    executive_summary: `${year}年${month}月，共收录${articles.length}篇行业资讯。监管类${regulatoryArticles.length}篇，行业模式类${industryModelArticles.length}篇，争议解决类${disputeArticles.length}篇，前沿解读类${frontierArticles.length}篇，规范文件类${normativeArticles.length}篇。平均评分${avgScore}分。`,
    monthly_overview: {
      total_articles: articles.length,
      by_category: { regulatory: regulatoryArticles.length, industry_model: industryModelArticles.length, dispute: disputeArticles.length, frontier: frontierArticles.length, normative: normativeArticles.length },
      avg_score: avgScore,
    },
    trend_charts: {
      category_distribution: { regulatory: regulatoryArticles.length, industry_model: industryModelArticles.length, dispute: disputeArticles.length, frontier: frontierArticles.length, normative: normativeArticles.length },
      avg_score: avgScore,
    },
    expert_opinions: articles.slice(0, 3).map((a: any) => ({
      title: a.title, source: a.source_name, score: a.score,
      opinion: a.excerpt || `本文评分${a.score}分，为本月重要文章。`,
    })),
    total_articles: articles.length,
    generated_at: new Date().toISOString(),
  };

  const { error: insertError } = await supabase.from('monthly_reports').upsert(report);
  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, report });
}
