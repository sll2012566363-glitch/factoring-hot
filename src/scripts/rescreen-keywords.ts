import { createClient } from '@supabase/supabase-js';
import { editorialExclusionReason, matchesCandidateTopic } from '../lib/relevance';
import { keepProcessAlive } from '../lib/keep-process-alive';

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

export async function runRescreen() {
  const { data, error } = await supabase.from('articles')
    .select('id, title, link, excerpt, content')
    .eq('pre_filtered', true)
    .limit(5000);
  if (error) throw error;
  const rejected = (data || []).filter(a => {
    const text = `${a.title || ''} ${a.excerpt || ''} ${a.content || ''}`;
    return !!editorialExclusionReason(a.title || '', a.link || '') || !matchesCandidateTopic(text);
  });
  for (let i = 0; i < rejected.length; i += 100) {
    const ids = rejected.slice(i, i + 100).map(a => a.id);
    const result = await supabase.from('articles').update({ pre_filtered: false, status: 'rejected', is_selected: false }).in('id', ids);
    if (result.error) throw result.error;
  }
  console.log(`Editorial rescreen complete: checked=${(data || []).length}, rejected=${rejected.length}`);
  return { checked: data?.length || 0, rejected: rejected.length };
}

keepProcessAlive(runRescreen()).catch(error => { console.error(error); process.exitCode = 1; });
