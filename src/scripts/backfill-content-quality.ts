import { createClient } from '@supabase/supabase-js';
import { contentQualityFields } from '@/lib/content-quality';
import { decideSelection } from '@/lib/content-policy';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

async function main() {
  const { data, error } = await supabase
    .from('articles')
    .select('id, content, content_html, score, scoring_method, pre_filtered, status, is_selected')
    .limit(1000);
  if (error) throw error;

  let changed = 0;
  for (const article of data || []) {
    const decision = decideSelection(article);
    const { error: updateError } = await supabase.from('articles').update({
      status: decision.status,
      is_selected: decision.isSelected,
      ...contentQualityFields(article),
    }).eq('id', article.id);
    if (updateError) throw updateError;
    changed++;
  }
  console.log(`Content-quality backfill updated ${changed} articles with the shared publication policy.`);
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
