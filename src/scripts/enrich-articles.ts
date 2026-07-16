import { createClient } from '@supabase/supabase-js';
import { fetch as undiciFetch } from 'undici';
import * as cheerio from 'cheerio';
import { extractContentHtml, extractPlainText, extractMetaDescription } from '../lib/extract-content';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

interface Article {
  id: string;
  title: string;
  link: string;
  content: string;
  pub_date: string;
}

/**
 * Extract pub date from page.
 */
function extractPubDate($: cheerio.CheerioAPI): string | null {
  const metaSelectors = [
    'meta[name="publishdate"]', 'meta[name="pubdate"]', 'meta[name="publish_date"]',
    'meta[name="publishDate"]', 'meta[name="article:published_time"]',
    'meta[property="article:published_time"]', 'meta[property="og:article:published_time"]',
    'meta[name="Date"]', 'meta[name="pub_date"]', 'meta[name="createtime"]',
  ];
  for (const sel of metaSelectors) {
    const val = $(sel).attr('content');
    if (val) {
      const d = new Date(val);
      if (!isNaN(d.getTime()) && isWithinSixMonths(d)) return d.toISOString();
    }
  }
  const timeEl = $('time').first();
  if (timeEl.length) {
    const datetime = timeEl.attr('datetime') || timeEl.text().trim();
    if (datetime) {
      const d = new Date(datetime);
      if (!isNaN(d.getTime()) && isWithinSixMonths(d)) return d.toISOString();
    }
  }
  const bodyText = $('body').text();
  const dateMatch = bodyText.match(/(\d{4})[-/.年](\d{1,2})[-/.月](\d{1,2})[日]?/);
  if (dateMatch) {
    const year = parseInt(dateMatch[1]);
    const month = parseInt(dateMatch[2]) - 1;
    const day = parseInt(dateMatch[3]);
    const d = new Date(year, month, day);
    if (!isNaN(d.getTime()) && isWithinSixMonths(d)) return d.toISOString();
  }
  return null;
}

function isWithinSixMonths(date: Date): boolean {
  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
  return date >= sixMonthsAgo && date <= new Date();
}

async function enrichArticle(article: Article): Promise<{
  content: string;
  content_html: string;
  excerpt: string;
  pub_date: string | null;
  cover_image: string | null;
} | null> {
  try {
    const response = await undiciFetch(article.link, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
      },
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) {
      console.log(`  HTTP ${response.status} for ${article.link}`);
      return null;
    }

    // ── 防止 PDF / 二进制内容污染正文 ──
    const ct = (response.headers.get('content-type') || '').toLowerCase();
    if (
      ct.includes('application/pdf')
      || ct.includes('application/octet-stream')
      || ct.startsWith('image/')
      || ct.startsWith('video/')
      || (!ct.includes('text/') && !ct.includes('html') && !ct.includes('xml'))
    ) {
      console.log(`  ⏩ 跳过非HTML: ${ct} for ${article.title.substring(0, 30)}`);
      return null;
    }

    const html = await response.text();

    // 二次保险：即使 Content-Type 蒙混，%PDF 开头一律拦截
    if (html.trimStart().startsWith('%PDF')) return null;
    const $ = cheerio.load(html);

    // Extract HTML content (preserving structure + images)
    const { html: contentHtml, coverImage } = extractContentHtml($, article.link);

    if (!contentHtml || contentHtml.length < 50) {
      // 正文提取失败（JS 渲染站等）：用页面 meta description 兜底当摘要，
      // 详情页至少显示一句官方摘要而不是"暂无正文内容"
      const metaDesc = extractMetaDescription($);
      if (metaDesc) {
        console.log(`  正文不可得，meta description 兜底 (${metaDesc.length} 字) for ${article.title.substring(0, 30)}`);
        return {
          content: metaDesc,
          content_html: '',
          excerpt: metaDesc,
          pub_date: extractPubDate($),
          cover_image: coverImage,
        };
      }
      console.log(`  Content too short for ${article.title.substring(0, 30)}`);
      return null;
    }

    // Extract plain text for search/indexing
    const plainText = extractPlainText(contentHtml);

    // Cap plain text at 5000 chars, breaking at sentence boundary
    const content = plainText.length > 5000
      ? plainText.substring(0, plainText.lastIndexOf('。', 5000) + 1 || 5000)
      : plainText;

    // Generate excerpt from plain text
    const excerptRaw = plainText.substring(0, 300);
    const excerptEnd = Math.max(
      excerptRaw.lastIndexOf('。'),
      excerptRaw.lastIndexOf('！'),
      excerptRaw.lastIndexOf('？'),
    );
    const excerpt = excerptEnd > 100 ? excerptRaw.substring(0, excerptEnd + 1) : excerptRaw;

    const pubDate = extractPubDate($);

    return { content, content_html: contentHtml, excerpt, pub_date: pubDate, cover_image: coverImage };
  } catch (error) {
    const msg = (error as Error).message;
    console.log(`  Fetch error: ${msg.substring(0, 60)}`);
    return null;
  }
}

export async function runEnrich() {
  console.log('📰 Starting article enrichment (with HTML preservation)...\n');

  // Fetch articles with empty or null content, skipping pre-filtered-out articles
  const { data: nullArticles, error } = await supabase
    .from('articles')
    .select('id, title, link, content, pub_date')
    .is('content', null)
    .or('pre_filtered.eq.true,pre_filtered.is.null')
    .limit(500);

  if (error) {
    console.error('Failed to fetch articles:', error);
    throw error;
  }

  // Also fetch articles with empty string content
  const { data: emptyArticles } = await supabase
    .from('articles')
    .select('id, title, link, content, pub_date')
    .eq('content', '')
    .or('pre_filtered.eq.true,pre_filtered.is.null')
    .limit(500);

  // Also fetch articles that have plain text content but no content_html yet
  const { data: noHtmlArticles } = await supabase
    .from('articles')
    .select('id, title, link, content, pub_date')
    .is('content_html', null)
    .not('content', 'is', null)
    .neq('content', '')
    .or('pre_filtered.eq.true,pre_filtered.is.null')
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
      console.log(`  ✗ Could not enrich\n`);
    } else {
      const updatePayload: Record<string, any> = {
        content: result.content,
        content_html: result.content_html,
        excerpt: result.excerpt,
      };

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

const isMain = typeof process !== 'undefined' &&
  process.argv[1] && /enrich-articles/.test(process.argv[1]);
if (isMain) {
  runEnrich().catch(console.error);
}
