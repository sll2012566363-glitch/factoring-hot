import { createClient } from '@supabase/supabase-js';
import { FACTORING_SOURCE_WHITELIST, matchesCandidateTopic } from '../lib/relevance';

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function update(ids: string[], payload: Record<string, unknown>) {
  for (let index = 0; index < ids.length; index += 100) {
    const { error } = await supabase.from('articles').update(payload).in('id', ids.slice(index, index + 100));
    if (error) throw error;
  }
}

async function run() {
  const data: Array<{ id: string; title: string | null; excerpt: string | null; content: string | null; source_id: string | null }> = [];
  for (let start = 0; ; start += 1000) {
    const { data: page, error } = await supabase.from('articles').select('id, title, excerpt, content, source_id').range(start, start + 999);
    if (error) throw error;
    data.push(...(page || []));
    if (!page || page.length < 1000) break;
  }

  const candidateIds: string[] = [];
  const rejectedIds: string[] = [];
  for (const article of data) {
    const text = `${article.title || ''} ${article.excerpt || ''} ${article.content || ''}`;
    const isVertical = FACTORING_SOURCE_WHITELIST.has(article.source_id || '');
    (matchesCandidateTopic(text) || isVertical ? candidateIds : rejectedIds).push(article.id);
  }

  await update(candidateIds, { pre_filtered: true, status: 'pending', is_selected: false, score: null, score_dimensions: null, scored_at: null });
  await update(rejectedIds, { pre_filtered: false, status: 'rejected', is_selected: false });
  console.log(`Final-pool rebuild complete: candidates=${candidateIds.length}, rejected=${rejectedIds.length}`);
}

run().catch(error => { console.error(error); process.exitCode = 1; });
