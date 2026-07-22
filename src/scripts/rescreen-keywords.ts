import { createClient } from '@supabase/supabase-js';
import { CORE_TOPIC_KEYWORDS } from '../lib/relevance';

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function run() {
  const { data, error } = await supabase.from('articles')
    .select('id, title, excerpt, content')
    .eq('pre_filtered', true)
    .limit(5000);
  if (error) throw error;
  const rejected = (data || []).filter(a => {
    const text = `${a.title || ''} ${a.excerpt || ''} ${a.content || ''}`;
    return !CORE_TOPIC_KEYWORDS.some(keyword => text.includes(keyword));
  });
  for (let i = 0; i < rejected.length; i += 100) {
    const ids = rejected.slice(i, i + 100).map(a => a.id);
    const result = await supabase.from('articles').update({ pre_filtered: false, status: 'rejected', is_selected: false }).in('id', ids);
    if (result.error) throw result.error;
  }
  console.log(`Keyword rescreen complete: checked=${(data || []).length}, rejected=${rejected.length}`);
}

run().catch(error => { console.error(error); process.exitCode = 1; });
