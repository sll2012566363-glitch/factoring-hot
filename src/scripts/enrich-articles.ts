import { createClient } from '@supabase/supabase-js';
import { fetch as undiciFetch } from 'undici';
import * as cheerio from 'cheerio';

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

const CONTENT_SELECTORS = [
  'article',
  '.article-content',
  '.content',
  '#content',
  '.post-body',
  '.entry-content',
  '.TRS_Editor',
  '.text',
  '.detail-content',
  '.news-content',
];

const REMOVE_SELECTORS = 'script, style, nav, header, footer, .ad, .sidebar, .comment, .comments';

function extractMainText($: cheerio.CheerioAPI): string {
  // Remove noise elements first
  $(REMOVE_SELECTORS).remove();

  // Try specific content selectors
  for (const sel of CONTENT_SELECTORS) {
    const $el = $(sel).first();
    if ($el.length) {
      const text = $el.text().replace(/\s+/g, ' ').trim();
      if (text.length > 80) {
        return text;
      }
    }
  }

  // Fallback: collect all <p> tags and find the largest text block
  const paragraphs: string[] = [];
  $('p').each((_i, el) => {
    const text = $(el).text().replace(/\s+/g, ' ').trim();
    if (text.length > 20) {
      paragraphs.push(text);
    }
  });

  if (paragraphs.length > 0) {
    // Sort by length descending, take the longest block(s)
    paragraphs.sort((a, b) => b.length - a.length);
    return paragraphs.slice(0, 10).join(' ');
  }

  // Last resort: body text
  return $('body').text().replace(/\s+/g, ' ').trim();
}

function extractPubDate($: cheerio.CheerioAPI): string | null {
  // Strategy 1: meta tags
  const metaSelectors = [
    'meta[name="publishdate"]',
    'meta[name="pubdate"]',
    'meta[name="publish_date"]',
    'meta[name="publishDate"]',
    'meta[name="article:published_time"]',
    'meta[property="article:published_time"]',
    'meta[property="og:article:published_time"]',
    'meta[name="Date"]',
    'meta[name="pub_date"]',
    'meta[name="createtime"]',
  ];

  for (const sel of metaSelectors) {
    const val = $(sel).attr('content');
    if (val) {
      const d = new Date(val);
      if (!isNaN(d.getTime()) && isWithinSixMonths(d)) {
        return d.toISOString();
      }
    }
  }

  // Strategy 2: <time> elements
  const timeEl = $('time').first();
  if (timeEl.length) {
    const datetime = timeEl.attr('datetime') || timeEl.text().trim();
    if (datetime) {
      const d = new Date(datetime);
      if (!isNaN(d.getTime()) && isWithinSixMonths(d)) {
        return d.toISOString();
      }
    }
  }

  // Strategy 3: date patterns in the page text
  const bodyText = $('body').text();
  const dateMatch = bodyText.match(/(\d{4})[-/.年](\d{1,2})[-/.月](\d{1,2})[日]?/);
  if (dateMatch) {
    const year = parseInt(dateMatch[1]);
    const month = parseInt(dateMatch[2]) - 1;
    const day = parseInt(dateMatch[3]);
    const d = new Date(year, month, day);
    if (!isNaN(d.getTime()) && isWithinSixMonths(d)) {
      return d.toISOString();
    }
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
  excerpt: string;
  pub_date: string | null;
} | null> {
  try {
    const response = await undiciFetch(article.link, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
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

    const mainText = extractMainText($);
    if (mainText.length < 50) {
      console.log(`  Content too short (${mainText.length} chars) for ${article.title.substring(0, 30)}`);
      return null;
    }

    const content = mainText.length > 5000
      ? mainText.substring(0, mainText.lastIndexOf('。', 5000) + 1 || 5000)
      : mainText;
    const excerptRaw = mainText.substring(0, 300);
    const excerptEnd = Math.max(
      excerptRaw.lastIndexOf('。'),
      excerptRaw.lastIndexOf('！'),
      excerptRaw.lastIndexOf('？'),
    );
    const excerpt = excerptEnd > 100 ? excerptRaw.substring(0, excerptEnd + 1) : excerptRaw;
    const pubDate = extractPubDate($);

    return { content, excerpt, pub_date: pubDate };
  } catch (error) {
    const msg = (error as Error).message;
    console.log(`  Fetch error: ${msg.substring(0, 60)}`);
    return null;
  }
}

export async function runEnrich() {
  console.log('📰 Starting article enrichment...\n');

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

  // Combine and deduplicate
  const allArticles: Article[] = [];
  const seenIds = new Set<string>();

  for (const a of [...(nullArticles || []), ...(emptyArticles || [])]) {
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
        excerpt: result.excerpt,
      };

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
        console.log(`  ✓ ${result.content.length} chars${dateNote}\n`);
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
