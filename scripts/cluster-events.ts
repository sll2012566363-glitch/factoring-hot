import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/** Get today's date in Beijing timezone (UTC+8) */
function getBeijingToday(): string {
  const now = new Date();
  const beijingOffset = 8 * 60 * 60 * 1000;
  const beijingDate = new Date(now.getTime() + beijingOffset);
  return beijingDate.toISOString().split('T')[0];
}

/**
 * Simple Chinese-aware keyword clustering.
 * Uses Intl.Segmenter for CJK word segmentation when available,
 * falls back to character bigrams otherwise.
 */
function extractTokens(text: string): Set<string> {
  const tokens = new Set<string>();

  // Try Intl.Segmenter for word-level segmentation (Node 16+)
  if (typeof Intl !== 'undefined' && 'Segmenter' in Intl) {
    const segmenter = new (Intl as any).Segmenter('zh-CN', { granularity: 'word' });
    const segments = Array.from(segmenter.segment(text));
    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i] as any;
      if (seg.isWordLike && seg.segment.length >= 2) {
        tokens.add(seg.segment);
      }
    }
  } else {
    // Fallback: character bigrams for CJK
    const chars = text.split('');
    for (let i = 0; i < chars.length - 1; i++) {
      tokens.add(chars[i] + chars[i + 1]);
    }
  }

  return tokens;
}

function tokenOverlap(tokensA: Set<string>, tokensB: Set<string>): number {
  let count = 0;
  const arrA = Array.from(tokensA);
  for (let i = 0; i < arrA.length; i++) {
    if (tokensB.has(arrA[i])) count++;
  }
  return count;
}

async function main() {
  console.log('Starting event clustering...');

  const today = getBeijingToday();

  const { data: todayArticles, error } = await supabase
    .from('articles')
    .select('*')
    .gte('pub_date', today)
    .gte('score', 50)
    .order('score', { ascending: false });

  if (error || !todayArticles || todayArticles.length < 2) {
    console.log('Not enough articles to cluster.');
    return;
  }

  console.log(`Clustering ${todayArticles.length} articles...`);

  const clusters: any[] = [];
  const used = new Set<string>();

  // Pre-compute tokens
  const tokenMap = new Map<string, Set<string>>();
  for (const article of todayArticles) {
    tokenMap.set(article.id, extractTokens(article.title));
  }

  for (const article of todayArticles) {
    if (used.has(article.id)) continue;

    const related = todayArticles.filter(a => {
      if (used.has(a.id) || a.id === article.id) return false;
      if (a.category !== article.category) return false;

      const overlap = tokenOverlap(tokenMap.get(article.id)!, tokenMap.get(a.id)!);
      return overlap >= 3;
    });

    if (related.length >= 2) {
      const clusterArticles = [article, ...related];
      used.add(article.id);
      related.forEach(r => used.add(r.id));

      const now = new Date().toISOString();
      const dates = clusterArticles.map(a => a.pub_date).sort();

      clusters.push({
        id: `cluster-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        event_title: article.title.length > 30
          ? article.title.slice(0, 30) + '...'
          : article.title,
        summary: `${article.category}相关事件集群，共${clusterArticles.length}篇文章`,
        category: article.category,
        article_ids: clusterArticles.map(a => a.id),
        article_count: clusterArticles.length,
        first_seen_at: dates[0],
        last_seen_at: dates[dates.length - 1],
        created_at: now
      });
    }
  }

  if (clusters.length > 0) {
    const { error: insertError } = await supabase
      .from('events')
      .insert(clusters);

    if (insertError) {
      console.error('Insert error:', insertError);
    } else {
      console.log(`Created ${clusters.length} event clusters.`);
    }
  } else {
    console.log('No clusters found.');
  }
}

main().catch(console.error);
