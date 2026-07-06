import { createClient } from '@supabase/supabase-js';
import { classifyArticle } from '../lib/classifier.js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function main() {
  console.log('🔄 Reclassifying all articles...\n');

  const { data: articles, error } = await supabase
    .from('articles')
    .select('*');

  if (error || !articles) {
    console.error('Failed to fetch articles:', error);
    process.exit(1);
  }

  console.log(`Found ${articles.length} articles to reclassify\n`);

  const stats: Record<string, number> = {};
  let updated = 0;

  for (const article of articles) {
    const result = classifyArticle(article.title, article.content || '');
    stats[result.section] = (stats[result.section] || 0) + 1;

    // Update the article's category to the new section
    const { error: updateError } = await supabase
      .from('articles')
      .update({ category: result.section })
      .eq('id', article.id);

    if (updateError) {
      console.error(`✗ Failed to update ${article.id}: ${updateError.message}`);
    } else {
      updated++;
      if (updated % 50 === 0) {
        console.log(`  Progress: ${updated}/${articles.length}`);
      }
    }
  }

  console.log(`\n✅ Reclassification complete!`);
  console.log(`   Updated: ${updated}/${articles.length} articles`);
  console.log('\nDistribution:');
  const names: Record<string, string> = {
    frontier: '🔍 前沿解读',
    industry_model: '🏭 行业前沿模式',
    regulatory: '📋 前沿监管新闻',
    dispute: '⚖️ 前沿争议解决',
    normative: '📄 前沿规范文件',
  };
  for (const [section, count] of Object.entries(stats).sort((a, b) => b[1] - a[1])) {
    console.log(`   ${names[section] || section}: ${count}篇`);
  }
}

main().catch(console.error);
