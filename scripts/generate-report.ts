import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/** Get today's date in Beijing timezone (UTC+8) */
function getBeijingToday(): string {
  const now = new Date();
  const beijingOffset = 8 * 60 * 60 * 1000;
  const beijingDate = new Date(now.getTime() + beijingOffset);
  return beijingDate.toISOString().split('T')[0];
}

async function main() {
  console.log('Generating daily report...');

  const today = getBeijingToday();

  const { data: articles, error } = await supabase
    .from('articles')
    .select('*')
    .gte('pub_date', today)
    .lte('pub_date', today + 'T23:59:59')
    .order('score', { ascending: false });

  if (error || !articles || articles.length === 0) {
    console.log('No articles found for today.');
    return;
  }

  const sections = [
    {
      id: 'top_stories',
      name: '今日头条',
      articles: articles.filter(a => (a.score || 0) >= 60).slice(0, 5)
    },
    {
      id: 'policy',
      name: '政策监管',
      articles: articles.filter(a => a.category === 'policy').slice(0, 10)
    },
    {
      id: 'market',
      name: '市场信号',
      articles: articles.filter(a => a.category === 'market').slice(0, 10)
    },
    {
      id: 'risk',
      name: '风险预警',
      articles: articles.filter(a => a.category === 'risk').slice(0, 8)
    },
    {
      id: 'innovation',
      name: '创新实践',
      articles: articles.filter(a => a.category === 'innovation').slice(0, 8)
    }
  ];

  const byCategory: Record<string, number> = {};
  articles.forEach(a => {
    byCategory[a.category] = (byCategory[a.category] || 0) + 1;
  });
  const categoryNames: Record<string, string> = {
    policy: '政策监管', market: '市场信号', risk: '风险预警', innovation: '创新实践'
  };
  const parts = Object.entries(byCategory)
    .map(([cat, count]) => `${categoryNames[cat] || cat}${count}条`)
    .join('、');
  const executive_summary = `今日共收录${articles.length}篇文章，其中${parts}。`;

  const { error: reportError } = await supabase
    .from('daily_reports')
    .upsert({
      id: `report-${today}`,
      report_date: today,
      report_title: `${today} 保理行业日报`,
      sections,
      total_articles: articles.length,
      executive_summary,
      generated_at: new Date().toISOString()
    });

  if (reportError) {
    console.error('Report error:', reportError);
  } else {
    console.log(`✅ Report generated: ${today}`);
  }
}

main().catch(console.error);
