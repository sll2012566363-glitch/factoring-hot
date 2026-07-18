import { createClient } from '@supabase/supabase-js';
import { hasFullContent } from '@/lib/content-quality';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

async function main() {
  const { data, error } = await supabase
    .from('articles')
    .select('id, content, content_html, status, is_selected')
    .or('pre_filtered.is.null,pre_filtered.eq.true')
    .limit(1000);
  if (error) throw error;

  const sourceOnly = (data || []).filter(article => !hasFullContent(article));
  await Promise.all(sourceOnly.map(article => supabase.from('articles').update({
    status: 'rejected',
    is_selected: false,
    ai_reason: '正文未达到站内全文标准，仅作为原文线索展示。',
  }).eq('id', article.id)));
  console.log(`Content-quality backfill: ${sourceOnly.length} source-only articles marked; ${(data || []).length - sourceOnly.length} full-text articles retained.`);
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
