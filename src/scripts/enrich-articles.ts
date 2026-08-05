import { createClient } from '@supabase/supabase-js';
import { fetchArticleContent } from '../lib/article-content';
import { contentQualityFields, hasFullContent } from '../lib/content-quality';
import { keepProcessAlive } from '../lib/keep-process-alive';
import { isScriptInvoked } from '../lib/script-entry';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

interface Article {
  id: string;
  title: string;
  link: string;
  content: string | null;
  content_html?: string | null;
  pub_date: string;
  status?: string | null;
  content_checked_at?: string | null;
}

async function enrichArticle(article: Article): Promise<{
  title: string | null;
  content: string;
  content_html: string;
  excerpt: string;
  pub_date: string | null;
  cover_image: string | null;
} | null> {
  const fetched = await fetchArticleContent(article.link);
  if (!fetched) return null;

  const content = fetched.text.length > 5000
    ? fetched.text.substring(0, fetched.text.lastIndexOf('。', 5000) + 1 || 5000)
    : fetched.text;
  return {
    title: fetched.title,
    content,
    content_html: fetched.html,
    excerpt: fetched.excerpt,
    pub_date: fetched.pubDate,
    cover_image: fetched.coverImage,
  };
}

export async function runEnrich() {
  console.log('📰 Starting article enrichment (with HTML preservation)...\n');
  const retryBefore = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  // Fetch articles with empty or null content, skipping pre-filtered-out articles
  const { data: nullArticles, error } = await supabase
    .from('articles')
    .select('id, title, link, content, content_html, content_checked_at, pub_date, status')
    .is('content', null)
    .eq('pre_filtered', true)
    .or(`content_checked_at.is.null,content_checked_at.lt.${retryBefore}`)
    .limit(500);

  if (error) {
    console.error('Failed to fetch articles:', error);
    throw error;
  }

  // Also fetch articles with empty string content
  const { data: emptyArticles } = await supabase
    .from('articles')
    .select('id, title, link, content, content_html, content_checked_at, pub_date, status')
    .eq('content', '')
    .eq('pre_filtered', true)
    .or(`content_checked_at.is.null,content_checked_at.lt.${retryBefore}`)
    .limit(500);

  // Also fetch articles that have plain text content but no content_html yet
  const { data: noHtmlArticles } = await supabase
    .from('articles')
    .select('id, title, link, content, content_html, content_checked_at, pub_date, status')
    .is('content_html', null)
    .not('content', 'is', null)
    .neq('content', '')
    .eq('pre_filtered', true)
    .or(`content_checked_at.is.null,content_checked_at.lt.${retryBefore}`)
    .limit(200);

  // Combine and deduplicate
  const allArticles: Article[] = [];
  const seenIds = new Set<string>();

  for (const a of [...(nullArticles || []), ...(emptyArticles || []), ...(noHtmlArticles || [])]) {
    if (!seenIds.has(a.id) && a.link) {
      seenIds.add(a.id);
      allArticles.push(a);
    }
  }

  // Cap at 500
  const toProcess = allArticles.slice(0, 500);

  console.log(`Found ${toProcess.length} articles to enrich\n`);

  let enriched = 0;
  let failed = 0;

  for (let i = 0; i < toProcess.length; i++) {
    const article = toProcess[i];
    const progress = `[${i + 1}/${toProcess.length}]`;
    console.log(`${progress} ${article.title.substring(0, 50)}...`);

    const result = await enrichArticle(article);

    if (!result) {
      failed++;
      await supabase.from('articles').update(
        contentQualityFields({ content: article.content, content_html: article.content_html }),
      ).eq('id', article.id);
      console.log(`  ✗ Could not enrich\n`);
    } else {
      const updatePayload: Record<string, any> = {
        content: result.content,
        content_html: result.content_html,
        excerpt: result.excerpt,
        ...contentQualityFields({ content: result.content, content_html: result.content_html }),
      };

      if (
        result.title
        && /(?:\.{3}|…)$/.test(article.title)
        && result.title.length > article.title.replace(/(?:\.{3}|…)$/, '').length
      ) {
        updatePayload.title = result.title;
      }

      // A source adapter can recover a body after a prior contentless pass.
      // Reopen only those terminal no-content records for LLM scoring.
      if (article.status === 'rejected' && hasFullContent({
        content: result.content,
        content_html: result.content_html,
      })) {
        updatePayload.status = 'pending';
        updatePayload.scoring_method = null;
        updatePayload.scored_at = null;
        updatePayload.ai_reason = null;
      }

      if (result.cover_image) {
        updatePayload.cover_image = result.cover_image;
      }

      if (result.pub_date) {
        updatePayload.pub_date = result.pub_date;
      }

      const { error: updateError } = await supabase
        .from('articles')
        .update(updatePayload)
        .eq('id', article.id);

      if (updateError) {
        console.log(`  ✗ Update failed: ${updateError.message}`);
        failed++;
      } else {
        enriched++;
        const dateNote = result.pub_date ? ` +date` : '';
        const coverNote = result.cover_image ? ` +cover` : '';
        const imgCount = (result.content_html.match(/<img/g) || []).length;
        console.log(`  ✓ ${result.content.length} chars, ${imgCount} imgs${dateNote}${coverNote}\n`);
      }
    }

    // 0.8s delay between requests to be polite
    if (i < toProcess.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 800));
    }
  }

  console.log(`\n✅ Enrichment complete!`);
  console.log(`   Enriched: ${enriched}`);
  console.log(`   Failed:   ${failed}`);
  console.log(`   Total:    ${toProcess.length}`);
  return { enriched, failed, total: toProcess.length };
}

const isMain = isScriptInvoked(/enrich-articles/);
if (isMain) {
  keepProcessAlive(runEnrich()).catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
