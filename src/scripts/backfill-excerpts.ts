/**
 * 刷新所有文章的摘要：
 * - LLM评分的文章：保留已有摘要（DeepSeek生成的最好）
 * - 其他文章：从正文取前2个完整句子作为摘要
 * - 没有正文的：从标题生成简单摘要
 */
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

function extractExcerptFromContent(content: string): string {
  if (!content) return '';
  const sentences: string[] = [];
  const parts = content.split(/(?<=[。！？])/);
  let total = 0;
  for (const part of parts) {
    const s = part.trim();
    if (s.length < 3) continue;
    sentences.push(s);
    total += s.length;
    if (sentences.length >= 2 && total >= 40) break;
    if (total >= 300) break;
  }
  return sentences.length > 0 ? sentences.join('') : content.substring(0, 200);
}

async function main() {
  console.log('📝 Refreshing article excerpts...\n');

  // Only update articles NOT scored by LLM (LLM excerpts are kept)
  const { data: articles, error } = await supabase
    .from('articles')
    .select('id, title, content, excerpt, scoring_method')
    .or('scoring_method.neq.llm,scoring_method.is.null')
    .limit(1000);

  if (error || !articles) {
    console.error('Failed to fetch articles:', error);
    return;
  }

  console.log(`Found ${articles.length} non-LLM articles to update\n`);

  let updated = 0;
  let skipped = 0;

  for (const article of articles) {
    const { id, title, content, excerpt, scoring_method } = article as any;

    // Skip if already has a good LLM excerpt (shouldn't be here but just in case)
    if (scoring_method === 'llm' && excerpt && excerpt.length > 10) {
      skipped++;
      continue;
    }

    // Generate new excerpt from content
    let newExcerpt = '';
    if (content && content.length > 30) {
      newExcerpt = extractExcerptFromContent(content);
    }

    // Skip if new excerpt is same as old one
    if (!newExcerpt || newExcerpt === excerpt) {
      skipped++;
      continue;
    }

    const { error: updateError } = await supabase
      .from('articles')
      .update({ excerpt: newExcerpt })
      .eq('id', id);

    if (updateError) {
      console.log(`  ✗ ${title.substring(0, 30)}: ${updateError.message}`);
    } else {
      updated++;
      if (updated <= 10) {
        console.log(`  ✓ ${title.substring(0, 40)}...`);
        console.log(`    "${newExcerpt.substring(0, 60)}..."\n`);
      }
    }
  }

  console.log(`\n✅ Backfill complete!`);
  console.log(`   Updated: ${updated}`);
  console.log(`   Skipped: ${skipped}`);
  console.log(`   Total:   ${articles.length}`);
}

main().catch(console.error);
