import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import rssParser from 'rss-parser';
import * as cheerio from 'cheerio';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const parser = new rssParser();

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

function cleanText(text: string): string {
  return text
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

async function fetchRSS(source: Source) {
  if (!source.rss) return [];
  
  try {
    const feed = await parser.parseURL(source.rss);
    return feed.items.slice(0, 20).map(item => ({
      title: item.title || '',
      link: item.link || '',
      content: cleanText(item.contentSnippet || item.content || ''),
      pubDate: item.pubDate || new Date().toISOString(),
      sourceId: source.id,
      sourceName: source.name,
      category: source.category,
      priority: source.priority,
      weight: source.weight
    }));
  } catch (error) {
    console.error(`RSS fetch error for ${source.name}:`, error);
    return [];
  }
}

async function fetchHTML(source: Source) {
  if (!source.selector) return [];
  
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
    const items: any[] = [];
    
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
          pubDate: new Date().toISOString(),
          sourceId: source.id,
          sourceName: source.name,
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

export async function POST(request: NextRequest) {
  // Auth check
  const apiKey = process.env.API_KEY;
  if (apiKey) {
    const headerKey = request.headers.get('authorization')?.replace('Bearer ', '');
    const queryKey = request.nextUrl.searchParams.get('api_key');
    if (headerKey !== apiKey && queryKey !== apiKey) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  try {
    const { data: sources, error } = await supabase
      .from('sources')
      .select('*')
      .eq('active', true);
    
    if (error || !sources) {
      return NextResponse.json({ error: 'Failed to fetch sources' }, { status: 500 });
    }
    
    const allArticles: any[] = [];
    
    for (const source of sources) {
      const articles = source.rss 
        ? await fetchRSS(source as Source)
        : await fetchHTML(source as Source);
      
      allArticles.push(...articles);
    }
    
    // Deduplicate by link
    const uniqueArticles = allArticles.filter((article, index, self) =>
      index === self.findIndex(a => a.link === article.link)
    );
    
    if (uniqueArticles.length > 0) {
      const { error: insertError } = await supabase
        .from('articles')
        .insert(uniqueArticles);
      
      if (insertError) {
        console.error('Insert error:', insertError);
      }
    }
    
    return NextResponse.json({
      success: true,
      fetched: allArticles.length,
      unique: uniqueArticles.length
    });
    
  } catch (error) {
    console.error('Fetch error:', error);
    return NextResponse.json({ error: 'Fetch failed' }, { status: 500 });
  }
}
