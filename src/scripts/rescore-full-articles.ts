import { createClient } from '@supabase/supabase-js';
import { hasFullContent } from '@/lib/content-quality';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

async function main() {
  const { data, error } = await supabase
    .from('articles')
    .select('id, content, content_html, scoring_method')
    .eq('scoring_method', 'llm')
    .not('score', 'is', null)
    .or('pre_filtered.is.null,pre_filtered.eq.true')
    .limit(1000);
  if (error) throw error;

  const eligible = (data || []).filter(hasFullContent);
  const { error: updateError } = eligible.length
    ? await supabase.from('articles').update({
      score: null,
      score_dimensions: null,
      scored_at: null,
      scoring_method: null,
      ai_reason: null,
    }).in('id', eligible.map(article => article.id))
    : { error: null };
  if (updateError) throw updateError;
  console.log(`Reset ${eligible.length} full-text LLM scores for calibrated re-scoring.`);
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
