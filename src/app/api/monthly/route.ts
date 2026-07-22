import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { requireInternalApiKey } from '@/lib/api-auth';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

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

export async function POST(request: NextRequest) {
  const authError = requireInternalApiKey(request);
  if (authError) return authError;

  const body = await request.json();
  const year = Number.isNaN(parseInt(body.year)) ? new Date().getFullYear() : parseInt(body.year);
  const month = Number.isNaN(parseInt(body.month)) ? (new Date().getMonth() + 1) : parseInt(body.month);

  if (month < 1 || month > 12) {
    return NextResponse.json({ error: 'month must be 1-12' }, { status: 400 });
  }

  const startDate = new Date(year, month - 1, 1);
  const endDate = new Date(year, month, 1);

  const { data: articles, error } = await supabase
    .from('articles')
    .select('*')
    .gte('pub_date', `${startDate.toISOString().split('T')[0]}T00:00:00+08:00`)
    .lt('pub_date', `${endDate.toISOString().split('T')[0]}T00:00:00+08:00`)
    .not('score', 'is', null)
    .eq('pre_filtered', true)
    .in('status', ['selected', 'pending'])
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

  const byCategory = (cat: string) => articles.filter((a: any) => a.category === cat);

  const regionalKw = ['省', '市', '自治区', '天津', '广东', '浙江', '山东', '江苏', '上海', '四川', '陕西', '深圳', '重庆', '北京', '福建', '湖北', '湖南', '河南'];
  const nationalPolicy = byCategory('regulatory').filter((a: any) => !regionalKw.some(kw => (a.title || '').includes(kw)));
  const regionalPolicy = byCategory('regulatory').filter((a: any) => regionalKw.some(kw => (a.title || '').includes(kw)));

  const monthNames: Record<number, string> = { 1:'一',2:'二',3:'三',4:'四',5:'五',6:'六',7:'七',8:'八',9:'九',10:'十',11:'十一',12:'十二' };
  const avgScore = articles.length > 0 ? +(articles.reduce((s: number, a: any) => s + (a.score || 0), 0) / articles.length).toFixed(1) : 0;

  const report = {
    id: `monthly-${year}-${month}`,
    year,
    month,
    report_title: `供应链和供应链金融前沿${year}年${monthNames[month]}月刊`,
    report_date_range: { start: startDate.toISOString().split('T')[0], end: endDate.toISOString().split('T')[0] },
    section_frontier_interpretation: { title: '前沿解读', articles: byCategory('frontier').slice(0, 5).map(card) },
    section_industry_model: { title: '行业前沿模式', articles: byCategory('industry_model').slice(0, 5).map(card) },
    section_regulatory_news: {
      title: '前沿监管新闻',
      subsections: [
        { title: '监管速递', articles: nationalPolicy.slice(0, 5).map(card) },
        { title: '区域监管新闻', articles: regionalPolicy.slice(0, 5).map(card) },
      ],
    },
    section_dispute_resolution: { title: '前沿争议解决', articles: byCategory('dispute').slice(0, 5).map(card) },
    section_normative_documents: { title: '前沿规范文件', articles: byCategory('normative').slice(0, 10).map(card) },
    executive_summary: `${year}年${month}月，共收录${articles.length}篇行业资讯。前沿解读${byCategory('frontier').length}篇，行业前沿模式${byCategory('industry_model').length}篇，前沿监管新闻${byCategory('regulatory').length}篇，前沿争议解决${byCategory('dispute').length}篇，前沿规范文件${byCategory('normative').length}篇。平均评分${avgScore}分。`,
    monthly_overview: {
      total_articles: articles.length,
      by_category: {
        frontier: byCategory('frontier').length,
        industry_model: byCategory('industry_model').length,
        regulatory: byCategory('regulatory').length,
        dispute: byCategory('dispute').length,
        normative: byCategory('normative').length,
      },
      avg_score: avgScore,
    },
    trend_charts: {
      category_distribution: {
        frontier: byCategory('frontier').length,
        industry_model: byCategory('industry_model').length,
        regulatory: byCategory('regulatory').length,
        dispute: byCategory('dispute').length,
        normative: byCategory('normative').length,
      },
      avg_score: avgScore,
    },
    total_articles: articles.length,
    generated_at: new Date().toISOString(),
  };

  const { error: insertError } = await supabase.from('monthly_reports').upsert(report, { onConflict: 'year,month' });
  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, report });
}
