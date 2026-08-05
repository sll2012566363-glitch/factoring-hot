import { createClient } from '@supabase/supabase-js';
import { contentQualityFields } from '@/lib/content-quality';
import {
  applyObjectiveNewsFloor,
  decideSelection,
  normalizeSelectionReason,
  type ScoreDimensions,
} from '@/lib/content-policy';
import { isScriptInvoked } from '@/lib/script-entry';
import { keepProcessAlive } from '@/lib/keep-process-alive';
import { titleSimilarity } from '@/lib/title-similarity';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export async function reconcileSelection() {
  const { data, error } = await supabase
    .from('articles')
    .select('id, title, score, score_dimensions, pre_filtered, scoring_method, content, content_html, excerpt, ai_reason, status, is_selected, content_quality, content_word_count, pub_date')
    .eq('scoring_method', 'llm')
    .not('score', 'is', null)
    .limit(5000);
  if (error) throw error;

  let changed = 0;
  const counts = { selected: 0, pending: 0, rejected: 0 };
  for (const article of data || []) {
    const rawDimensions = article.score_dimensions as Partial<ScoreDimensions> | null;
    const dimensions: ScoreDimensions = {
      frontier: Number(rawDimensions?.frontier) || 0,
      industry_model: Number(rawDimensions?.industry_model) || 0,
      regulatory: Number(rawDimensions?.regulatory) || 0,
      dispute: Number(rawDimensions?.dispute) || 0,
      normative: Number(rawDimensions?.normative) || 0,
    };
    const objective = applyObjectiveNewsFloor(article, Number(article.score), dimensions);
    const decision = decideSelection({ ...article, score: objective.score });
    counts[decision.status]++;
    const fields = contentQualityFields(article);
    const normalizedReason = normalizeSelectionReason(objective.score, article.ai_reason, article.excerpt);
    const needsUpdate = article.status !== decision.status
      || article.is_selected !== decision.isSelected
      || article.score !== objective.score
      || article.content_quality !== fields.content_quality
      || article.content_word_count !== fields.content_word_count
      || article.ai_reason !== normalizedReason;
    if (!needsUpdate) continue;
    const { error: updateError } = await supabase
      .from('articles')
      .update({
        status: decision.status,
        is_selected: decision.isSelected,
        score: objective.score,
        score_dimensions: objective.dimensions,
        ai_reason: normalizedReason,
        ...fields,
      })
      .eq('id', article.id);
    if (updateError) throw updateError;
    changed++;
  }

  const candidates = (data || [])
    .filter(article => decideSelection(article).isSelected)
    .sort((left, right) =>
      Number(right.score) - Number(left.score)
      || Number(right.content_word_count) - Number(left.content_word_count)
      || String(right.pub_date).localeCompare(String(left.pub_date)),
    );
  const primaryArticles: typeof candidates = [];
  for (const article of candidates) {
    const duplicateOf = primaryArticles.find(primary => {
      const days = Math.abs(new Date(primary.pub_date).getTime() - new Date(article.pub_date).getTime()) / 86_400_000;
      return days <= 14 && titleSimilarity(primary.title, article.title) >= 0.4;
    });
    if (!duplicateOf) {
      primaryArticles.push(article);
      continue;
    }
    const { error: duplicateError } = await supabase
      .from('articles')
      .update({
        status: 'pending',
        is_selected: false,
        ai_reason: `重复事件：已保留信息更完整的《${duplicateOf.title}》。`,
      })
      .eq('id', article.id);
    if (duplicateError) throw duplicateError;
    counts.selected--;
    counts.pending++;
    changed++;
  }

  console.log(`Selection reconciled: changed=${changed}, selected=${counts.selected}, pending=${counts.pending}, rejected=${counts.rejected}`);
  return { changed, ...counts, total: data?.length || 0 };
}

const isMain = isScriptInvoked(/reconcile-selection/);
if (isMain) {
  keepProcessAlive(reconcileSelection()).catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
