import { createClient } from '@supabase/supabase-js';
import { assessContentQuality } from '@/lib/content-quality';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

async function main() {
  const { data, error } = await supabase
    .from('articles')
    .select('source_name, content, content_html, pub_date')
    .or('pre_filtered.is.null,pre_filtered.eq.true')
    .order('pub_date', { ascending: false })
    .limit(500);
  if (error) throw error;

  const bySource = new Map<string, { full: number; summary: number; external: number }>();
  for (const article of data || []) {
    const quality = assessContentQuality(article);
    const row = bySource.get(article.source_name) || { full: 0, summary: 0, external: 0 };
    row[quality.tier]++;
    bySource.set(article.source_name, row);
  }

  const report = [...bySource.entries()].map(([source, counts]) => {
    const total = counts.full + counts.summary + counts.external;
    return { source, ...counts, total, fullRate: Number((counts.full / total).toFixed(2)) };
  }).sort((a, b) => a.fullRate - b.fullRate || b.total - a.total);
  console.table(report);
  const weak = report.filter(row => row.total >= 3 && row.fullRate < 0.6);
  if (weak.length) console.warn(`⚠ Full-text rate below 60%: ${weak.map(row => row.source).join('、')}`);
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
