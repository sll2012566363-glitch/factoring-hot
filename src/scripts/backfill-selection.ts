import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const MIN_SELECTED_SCORE = 55;

async function backfillSelection() {
  console.log('Loading historical candidates...');
  const { data, error } = await supabase
    .from('articles')
    .select('id, score, pre_filtered, status')
    .eq('pre_filtered', true)
    .limit(5000);
  if (error) throw error;

  let selected = 0;
  let rejected = 0;
  let pending = 0;
  const updates = (data || []).map((article) => {
    const hasScore = typeof article.score === 'number';
    const isSelected = hasScore && article.score >= MIN_SELECTED_SCORE;
    const status = !hasScore ? 'pending' : isSelected ? 'selected' : 'rejected';
    return supabase
      .from('articles')
      .update({ status, is_selected: isSelected })
      .eq('id', article.id);
  });
  const results = await Promise.all(updates);
  const failed = results.find(({ error }) => error);
  if (failed?.error) throw failed.error;
  for (const article of data || []) {
    const hasScore = typeof article.score === 'number';
    const status = !hasScore ? 'pending' : article.score >= MIN_SELECTED_SCORE ? 'selected' : 'rejected';
    if (status === 'selected') selected++;
    else if (status === 'rejected') rejected++;
    else pending++;
  }
  console.log(`Selection backfill complete: selected=${selected}, rejected=${rejected}, pending=${pending}`);
}

backfillSelection().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
