import Parser from 'rss-parser';
import * as cheerio from 'cheerio';
import { Source, Article } from '@/types';

const parser = new Parser();

export interface FetchResult {
  sourceId: string;
  sourceName: string;
  success: boolean;
  count: number;
  error?: string;
}

function cleanText(text: string): string {
  return text.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

export async function fetchFromSource(source: Source): Promise<FetchResult> {
  try {
    let articles: Partial<Article>[] = [];

    if (source.rss) {
      articles = await fetchRSS(source);
    } else if (source.selector) {
      articles = await fetchHTML(source);
    }

    return {
      sourceId: source.id,
      sourceName: source.name,
      success: true,
      count: articles.length
    };
  } catch (error) {
    return {
      sourceId: source.id,
      sourceName: source.name,
      success: false,
      count: 0,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

async function fetchRSS(source: Source): Promise<Partial<Article>[]> {
  if (!source.rss) return [];

  try {
    const feed = await parser.parseURL(source.rss);
    return feed.items.slice(0, 20).map(item => ({
      title: item.title || 'No title',
      link: item.link || '',
      content: cleanText(item.contentSnippet || item.content || ''),
      excerpt: item.contentSnippet
        ? item.contentSnippet.replace(/<[^>]*>/g, '').substring(0, 200)
        : '',
      pub_date: item.pubDate ? new Date(item.pubDate).toISOString() : new Date().toISOString(),
      source_id: source.id,
      source_name: source.name,
      category: source.category,
      priority: source.priority,
      weight: source.weight
    }));
  } catch (error) {
    console.error(`RSS fetch error for ${source.name}:`, error);
    return [];
  }
}

async function fetchHTML(source: Source): Promise<Partial<Article>[]> {
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
    const items: Partial<Article>[] = [];

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
          pub_date: new Date().toISOString(),
          source_id: source.id,
          source_name: source.name,
          category: source.category,
          priority: source.priority,
          weight: source.weight
        });
      }
    });

    return items;
  } catch (error) {
    console.error(`HTML fetch error for ${source.name}:`, error);
    return [];
  }
}
