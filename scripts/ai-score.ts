import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function main() {
  console.log('Starting AI scoring...');

  const { data: unscoredArticles, error } = await supabase
    .from('articles')
    .select('*')
    .is('score', null)
    .limit(100);

  if (error || !unscoredArticles || unscoredArticles.length === 0) {
    console.log('No unscored articles found.');
    return;
  }

  console.log(`Scoring ${unscoredArticles.length} articles...`);

  // Simple rule-based scoring (fallback when OpenAI is unavailable)
  const scored = unscoredArticles.map(article => {
    let score = 30; // Base score

    // Boost for high-priority sources
    if (article.priority === 'T1') score += 25;
    else if (article.priority === 'T1.5') score += 15;
    else score += 5;

    // Boost for recent articles
    const pubDate = new Date(article.pub_date);
    const hoursSince = (Date.now() - pubDate.getTime()) / (1000 * 60 * 60);
    if (hoursSince < 6) score += 20;
    else if (hoursSince < 24) score += 10;

    // Boost for content length
    if (article.content && article.content.length > 500) score += 10;
    if (article.content && article.content.length > 1000) score += 10;

    // Category-specific boost
    if (article.category === 'policy') score += 10;
    if (article.category === 'risk') score += 5;

    return { ...article, score: Math.min(score, 100) };
  });

  // Batch update
  const updates = scored.map(article => ({
    id: article.id,
    score: article.score
  }));

  const { error: updateError } = await supabase
    .from('articles')
    .upsert(updates);

  if (updateError) {
    console.error('Update error:', updateError);
  } else {
    console.log(`Scored ${updates.length} articles.`);
  }
}

main().catch(console.error);
