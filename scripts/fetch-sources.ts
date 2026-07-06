import { createClient } from '@supabase/supabase-js';
import Parser from 'rss-parser';
import * as cheerio from 'cheerio';
import sourcesData from '../config/sources.json';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const parser = new Parser();

interface Source {
  id: string;
  name: string;
  url: string;
  type: string;
  category: string;
  priority: string;
  weight: number;
  rss: string | null;
  selector: string | null;
  active: boolean;
}

interface FetchedArticle {
  title: string;
  link: string;
  content: string;
  excerpt: string;
  pub_date: string;
  source_id: string;
  source_name: string;
  category: string;
  priority: string;
  weight: number;
}

function cleanText(text: string): string {
  return text.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

async function fetchRSS(source: Source): Promise<FetchedArticle[]> {
  if (!source.rss) return [];

  try {
    const feed = await parser.parseURL(source.rss);
    console.log(`  ✓ RSS: ${feed.items.length} items from ${source.name}`);
    return feed.items.slice(0, 20).map(item => ({
      title: item.title || 'No title',
      link: item.link || '',
      content: cleanText(item.contentSnippet || item.content || ''),
      excerpt: item.contentSnippet
        ? cleanText(item.contentSnippet).substring(0, 200)
        : '',
      pub_date: item.pubDate ? new Date(item.pubDate).toISOString() : new Date().toISOString(),
      source_id: source.id,
      source_name: source.name,
      category: source.category,
      priority: source.priority,
      weight: source.weight
    }));
  } catch (error) {
    console.error(`  ✗ RSS failed for ${source.name}:`, error instanceof Error ? error.message : error);
    return [];
  }
}

async function fetchHTML(source: Source): Promise<FetchedArticle[]> {
  if (!source.selector || !source.url) return [];

  try {
    const response = await fetch(source.url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; FactoringHot/1.0)',
        'Accept': 'text/html,application/xhtml+xml'
      },
      signal: AbortSignal.timeout(15000)
    });

    if (!response.ok) return [];

    const html = await response.text();
    const $ = cheerio.load(html);
    const items: FetchedArticle[] = [];

    $(source.selector).each((i, elem) => {
      if (i >= 20) return false;

      const $elem = $(elem);
      const title = cleanText($elem.text());
      const href = $elem.attr('href') || '';
      const link = href.startsWith('http') ? href : new URL(href, source.url).href;

      if (title.length > 10) {
        items.push({
          title,
          link,
          content: '',
          excerpt: '',
          pub_date: new Date().toISOString(),
          source_id: source.id,
          source_name: source.name,
          category: source.category,
          priority: source.priority,
          weight: source.weight
        });
      }
    });

    console.log(`  ✓ HTML: ${items.length} items from ${source.name}`);
    return items;
  } catch (error) {
    console.error(`  ✗ HTML failed for ${source.name}:`, error instanceof Error ? error.message : error);
    return [];
  }
}

async function main() {
  console.log('🚀 Starting factoring-hot fetch...\n');

  // Try to get sources from DB first, fall back to config file
  let sources: Source[];
  const { data: dbSources, error } = await supabase
    .from('sources')
    .select('*')
    .eq('active', true);

  if (error || !dbSources || dbSources.length === 0) {
    console.log('⚠️  No active sources in DB, using config file...\n');
    sources = sourcesData.sources.filter(s => s.active) as Source[];
  } else {
    sources = dbSources as Source[];
  }

  console.log(`📡 Fetching from ${sources.length} sources...\n`);

  let totalArticles = 0;

  for (const source of sources) {
    let articles: FetchedArticle[] = [];

    if (source.rss) {
      articles = await fetchRSS(source);
    } else {
      articles = await fetchHTML(source);
    }

    if (articles.length > 0) {
      const { error: insertError } = await supabase
        .from('articles')
        .upsert(articles, { onConflict: 'link' });

      if (insertError) {
        console.error(`  ✗ Insert failed for ${source.name}:`, insertError.message);
      } else {
        totalArticles += articles.length;
      }
    }

    // Rate limiting: 1s between sources
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  console.log(`\n✅ Fetch complete! Total new articles: ${totalArticles}`);
}

main().catch(console.error);
