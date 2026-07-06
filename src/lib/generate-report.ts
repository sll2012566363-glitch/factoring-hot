import { createClient } from '@supabase/supabase-js';
import { Article, DailyReport, ReportSection } from '@/types';
import scoringConfig from '../../config/scoring.json';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

interface SectionConfig {
  id: string;
  name: string;
  maxItems: number;
  sortBy?: 'score' | 'pub_date';
  filter: Record<string, any>;
}

/** Get today's date in Beijing timezone (UTC+8) */
function getBeijingToday(): string {
  const now = new Date();
  const beijingOffset = 8 * 60 * 60 * 1000;
  const beijingDate = new Date(now.getTime() + beijingOffset);
  return beijingDate.toISOString().split('T')[0];
}

export async function generateDailyReport(date?: string): Promise<DailyReport | null> {
  const reportDate = date || getBeijingToday();

  try {
    // Fetch articles for the day
    const { data: articles, error } = await supabase
      .from('articles')
      .select('*')
      .gte('pub_date', reportDate)
      .lte('pub_date', reportDate + 'T23:59:59')
      .order('score', { ascending: false });
    
    if (error || !articles || articles.length === 0) {
      console.log('No articles found for date:', reportDate);
      return null;
    }
    
    // Generate sections based on config
    const sections: ReportSection[] = [];
    const sectionConfigs = (scoringConfig as any).dailyReport.sections as SectionConfig[];
    const articlesBySection: Record<string, Article[]> = {};
    
    for (const sectionConfig of sectionConfigs) {
      let filtered = [...articles];
      
      // Apply filters
      if (sectionConfig.filter.category) {
        filtered = filtered.filter(a => a.category === sectionConfig.filter.category);
      }
      if (sectionConfig.filter.minScore) {
        filtered = filtered.filter(a => (a.score || 0) >= sectionConfig.filter.minScore);
      }
      
      // Sort
      if (sectionConfig.sortBy === 'score') {
        filtered.sort((a, b) => (b.score || 0) - (a.score || 0));
      } else if (sectionConfig.sortBy === 'pub_date') {
        filtered.sort((a, b) => new Date(b.pub_date).getTime() - new Date(a.pub_date).getTime());
      }
      
      // Limit
      filtered = filtered.slice(0, sectionConfig.maxItems);
      
      sections.push({
        id: sectionConfig.id,
        name: sectionConfig.name,
        articles: filtered,
        maxItems: sectionConfig.maxItems
      });
      
      articlesBySection[sectionConfig.id] = filtered;
    }
    
    // Generate summary
    const executive_summary = generateSummary(articles);
    
    const report: DailyReport = {
      id: `report-${reportDate}`,
      report_date: reportDate,
      report_title: `${reportDate} 保理行业日报`,
      sections,
      total_articles: articles.length,
      executive_summary,
      generated_at: new Date().toISOString()
    };
    
    // Save to database
    const { error: saveError } = await supabase
      .from('daily_reports')
      .upsert({
        id: report.id,
        report_date: report.report_date,
        report_title: report.report_title,
        sections: report.sections,
        total_articles: report.total_articles,
        executive_summary: report.executive_summary,
        generated_at: report.generated_at
      });
    
    if (saveError) {
      console.error('Failed to save report:', saveError);
      return null;
    }
    
    return report;
  } catch (error) {
    console.error('Report generation error:', error);
    return null;
  }
}

function generateSummary(articles: Article[]): string {
  const byCategory: Record<string, number> = {};
  articles.forEach(a => {
    byCategory[a.category] = (byCategory[a.category] || 0) + 1;
  });
  
  const parts = Object.entries(byCategory)
    .map(([cat, count]) => `${getCategoryName(cat)}${count}条`)
    .join('、');
  
  return `今日共收录${articles.length}篇文章，其中${parts}。`;
}

function getCategoryName(categoryId: string): string {
  const names: Record<string, string> = {
    frontier: '前沿解读',
    industry_model: '行业前沿模式',
    regulatory: '前沿监管新闻',
    dispute: '前沿争议解决',
    normative: '前沿规范文件'
  };
  return names[categoryId] || categoryId;
}
