import { createClient } from '@supabase/supabase-js';
import Parser from 'rss-parser';
import { fetch as fetchHtml } from 'undici';
import * as cheerio from 'cheerio';
import { classifyArticle } from '../lib/classifier';
import { isRelevant } from '../lib/relevance';
import { sanitizePubDate } from '../lib/date-utils';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const parser = new Parser();

interface Source {
  id: string;
  name: string;
  url: string;
  rss: string | null;
  type: string;
  category: string;
  priority: string;
  weight: number;
  selector: string | null;
  active: boolean;
}

interface Article {
  title: string;
  link: string;
  content: string;
  excerpt: string;
  pub_date: Date;
  source_id: string;
  source_name: string;
  category: string;
  priority: string;
  weight: number;
}

function resolveUrl(base: string, href: string): string {
  try {
    return new URL(href, base).href;
  } catch {
    return '';
  }
}

function extractDate($: cheerio.CheerioAPI, el: any): Date {
  // Try to find a date in nearby sibling or parent elements
  const parent = $(el).parent();
  const text = parent.text() + ' ' + $(el).closest('li').text();
  // Match common Chinese date formats with optional time: 2026-07-06 14:30, 2026年07月06日 14:30
  const dateMatch = text.match(/(\d{4})[-/.年](\d{1,2})[-/.月](\d{1,2})[日]?\s*(?:(\d{1,2}):(\d{2}))?/);
  if (dateMatch) {
    const y = parseInt(dateMatch[1]);
    const m = parseInt(dateMatch[2]) - 1;
    const d = parseInt(dateMatch[3]);
    const h = dateMatch[4] ? parseInt(dateMatch[4]) : 0;
    const min = dateMatch[5] ? parseInt(dateMatch[5]) : 0;
    const result = new Date(y, m, d, h, min);
    if (!isNaN(result.getTime())) return result;
  }
  // Fallback: use midnight today in UTC so the date portion is still meaningful
  // instead of "right now" which would make every article look like it was just published
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

async function fetchRSS(source: Source): Promise<Article[]> {
  if (!source.rss) {
    return [];
  }

  try {
    const feed = await parser.parseURL(source.rss);
    console.log(`✓ RSS: ${feed.items.length} items from ${source.name}`);

    return feed.items
      .filter(item => item.title && item.link)
      .map(item => {
        const title = (item.title || '').trim();
        const classification = classifyArticle(title, item.content || item.description || '');
        return {
          title,
          link: item.link || '',
          content: item.content || item.description || '',
          excerpt: item.description
            ? item.description.replace(/<[^>]*>/g, '').substring(0, 200)
            : '',
          pub_date: item.pubDate ? new Date(item.pubDate) : new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate()),
          source_id: source.id,
          source_name: source.name,
          category: classification.section,
          priority: source.priority,
          weight: source.weight,
        };
      });
  } catch (error) {
    console.error(`✗ RSS failed for ${source.name}:`, (error as Error).message);
    return [];
  }
}

// Override selectors for sources where the default selector doesn't work
const SELECTOR_OVERRIDES: Record<string, string> = {
  'pbc': 'ul > li',
  'mofcom': 'ul > li',
  'ndrc': 'ul > li',
  'supcourt': 'ul > li',
  'yicai': 'm-content m-scrollcontent m-content-4 > m-con',
  'caixin': 'dd > p',
  'cs': 'ch_typewd_list > li',
  '21jingji': 'a[href*="/article/"]',
  'zhonghongwang': 'ul.eight_zones a',
};

// Custom API fetchers for SPA sources that can't be scraped via HTML
type ApiFetcher = (source: Source) => Promise<Article[]>;

async function fetchDahecube(source: Source): Promise<Article[]> {
  const articles: Article[] = [];
  try {
    const response = await fetchHtml('https://app.dahecube.com/napi/news/pc/list', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ channelid: 1, pno: 1, psize: 20 }),
      signal: AbortSignal.timeout(15000),
    });
    const data = await response.json() as any;
    if (data.code === 0 && data.data?.items) {
      for (const item of data.data.items) {
        if (!item.title) continue;
        const link = item.qtype === 1 && item.linkurl
          ? item.linkurl
          : `https://www.dahecube.com/article.html?artid=${item.recid}`;
        articles.push({
          title: item.title,
          link,
          content: '',
          excerpt: item.summary || '',
          pub_date: item.pubtime ? new Date(item.pubtime) : new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate()),
          source_id: source.id,
          source_name: source.name,
          category: classifyArticle(item.title, '').section,
          priority: source.priority,
          weight: source.weight,
        });
      }
    }
    console.log(`✓ API: ${articles.length} articles from ${source.name}`);
  } catch (error) {
    console.error(`✗ API failed for ${source.name}:`, (error as Error).message);
  }
  return articles;
}

async function fetch36kr(source: Source): Promise<Article[]> {
  const articles: Article[] = [];
  try {
    const response = await fetchHtml('https://gateway.36kr.com/api/mis/nav/home/nav/rank/hot', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        partner_id: 'wap',
        timestamp: '',
        param: { siteId: 1, pageSize: 50, platformId: 1 },
      }),
      signal: AbortSignal.timeout(15000),
    });
    const data = await response.json() as any;
    if (data.code === 0 && data.data?.hotRankList) {
      for (const item of data.data.hotRankList) {
        const m = item.templateMaterial;
        if (!m?.widgetTitle) continue;
        const link = m.mobileUrl || m.pcUrl || `https://www.36kr.com/p/${m.itemId}`;
        articles.push({
          title: m.widgetTitle,
          link: link.startsWith('http') ? link : `https://www.36kr.com/p/${m.itemId}`,
          content: '',
          excerpt: '',
          pub_date: m.publishTime ? new Date(m.publishTime) : new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate()),
          source_id: source.id,
          source_name: source.name,
          category: classifyArticle(m.widgetTitle, '').section,
          priority: source.priority,
          weight: source.weight,
        });
      }
    }
    console.log(`✓ API: ${articles.length} articles from ${source.name}`);
  } catch (error) {
    console.error(`✗ API failed for ${source.name}:`, (error as Error).message);
  }
  return articles;
}

async function fetchCcxi(source: Source): Promise<Article[]> {
  const articles: Article[] = [];
  try {
    const orderby = JSON.stringify({ chuangjianshijian: 'desc' });
    const url = `https://website-api.ccxi.com.cn/admin/content/wzgl/page?pageNo=1&pageSize=20&orderby=${encodeURIComponent(orderby)}`;
    const response = await fetchHtml(url, {
      headers: { 'Accept': 'application/json' },
      signal: AbortSignal.timeout(30000),
    });
    const data = await response.json() as any;
    if (data.data?.records) {
      for (const item of data.data.records) {
        if (!item.mingcheng) continue;
        articles.push({
          title: item.mingcheng,
          link: `https://www.ccxi.com.cn/news/detail/${item.id}`,
          content: '',
          excerpt: item.miaoshu && item.miaoshu !== '暂无' ? item.miaoshu : '',
          pub_date: item.chuangjianshijian ? new Date(item.chuangjianshijian) : new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate()),
          source_id: source.id,
          source_name: source.name,
          category: classifyArticle(item.mingcheng, '').section,
          priority: source.priority,
          weight: source.weight,
        });
      }
    }
    console.log(`✓ API: ${articles.length} articles from ${source.name}`);
  } catch (error) {
    console.error(`✗ API failed for ${source.name}:`, (error as Error).message);
  }
  return articles;
}

// Map of source IDs to custom API fetchers
const API_FETCHERS: Record<string, ApiFetcher> = {
  'dahecube': fetchDahecube,
  '36kr': fetch36kr,
  'ccxi': fetchCcxi,
};

// Minimum title length to consider as a real article
const MIN_TITLE_LEN = 6;
const MAX_TITLE_LEN = 200;
// Patterns that indicate non-article links
const NOISE_PATTERNS = [
  /登录|注册|首页|关于我们|联系我们|版权|隐私|免责|免责声明|网站地图|友情链接|返回顶部|more|更多|关于我们|加入我们|投稿/i,
  /javascript:void/,
  /^#$/,
  /\.(jpg|png|gif|css|js|pdf|zip)$/i,
];

function isNoiseLink(title: string, href: string): boolean {
  if (!title || title.length < MIN_TITLE_LEN || title.length > MAX_TITLE_LEN) return true;
  if (!href || href === '#') return true;
  return NOISE_PATTERNS.some(p => p.test(title) || p.test(href));
}

function genericExtract($: cheerio.CheerioAPI, source: Source, baseUrl: string): Article[] {
  const articles: Article[] = [];
  const seenLinks = new Set<string>();

  // Strategy 1: Try specific selector first
  const selector = SELECTOR_OVERRIDES[source.id] || source.selector;
  if (selector) {
    $(selector).each((_i, el) => {
      const $el = $(el);
      // For some selectors, the link is a child <a> tag
      const $link = $el.is('a') ? $el : $el.find('a').first();
      const href = $link.attr('href');
      const title = $link.text().trim().replace(/\s+/g, ' ');

      if (!href || isNoiseLink(title, href)) return;
      const link = resolveUrl(baseUrl, href);
      if (!link || seenLinks.has(link)) return;
      seenLinks.add(link);

      articles.push({
        title,
        link,
        content: '',
        excerpt: '',
        pub_date: extractDate($, el),
        source_id: source.id,
        source_name: source.name,
        category: classifyArticle(title, '').section,
        priority: source.priority,
        weight: source.weight,
      });
    });
  }

  // Strategy 2: Generic fallback - find all article-like links if selector didn't work
  if (articles.length === 0) {
    $('a').each((_i, el) => {
      const $el = $(el);
      const href = $el.attr('href');
      const title = $el.text().trim().replace(/\s+/g, ' ');

      if (!href || isNoiseLink(title, href)) return;

      const link = resolveUrl(baseUrl, href);
      if (!link || seenLinks.has(link)) return;

      // Filter: link should look like an article URL (has path depth or date pattern)
      try {
        const urlObj = new URL(link);
        const urlPath = urlObj.pathname;
        const hasArticlePath = urlPath.split('/').length >= 3 ||
          /\d{4}[-/]?\d{2}[-/]?\d{2}/.test(urlPath) ||
          /article|news|content|detail|info/i.test(urlPath);
        if (!hasArticlePath) return;
      } catch {
        return;
      }

      seenLinks.add(link);
      articles.push({
        title,
        link,
        content: '',
        excerpt: '',
        pub_date: extractDate($, el),
        source_id: source.id,
        source_name: source.name,
        category: classifyArticle(title, '').section,
        priority: source.priority,
        weight: source.weight,
      });
    });
  }

  return articles;
}

async function fetchHtmlContent(source: Source): Promise<Article[]> {
  if (!source.url) return [];

  try {
    const response = await fetchHtml(source.url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
      },
      signal: AbortSignal.timeout(15000),
    });
    const html = await response.text();
    const $ = cheerio.load(html);

    const articles = genericExtract($, source, source.url);

    // Limit to 20 articles per source to avoid noise
    const limited = articles.slice(0, 20);
    console.log(`✓ HTML: ${limited.length} articles from ${source.name}`);
    return limited;
  } catch (error) {
    console.error(`✗ HTML failed for ${source.name}:`, (error as Error).message);
    return [];
  }
}

export async function runFetch() {
  console.log('🚀 Starting factoring-hot fetch...\n');

  const { data: sources, error } = await supabase
    .from('sources')
    .select('*')
    .eq('active', true);

  if (error || !sources) {
    console.error('Failed to fetch sources:', error);
    throw error;
  }

  console.log(`📡 Fetching from ${sources.length} active sources...\n`);

  let totalArticles = 0;
  let sourcesWithArticles = 0;

  for (const source of sources as Source[]) {
    let articles: Article[] = [];

    if (API_FETCHERS[source.id]) {
      // Use custom API fetcher for SPA sources
      articles = await API_FETCHERS[source.id](source);
    } else if (source.rss) {
      articles = await fetchRSS(source);
    } else {
      articles = await fetchHtmlContent(source);
    }

    // 相关性闸门 + 未来日期拦截（治本：过滤不相关与未来日期文章）
    const passed: Article[] = [];
    for (const a of articles) {
      const rel = await isRelevant(a.title, a.content || a.excerpt || '');
      if (!rel.relevant) {
        console.log(`  ⏩ 跳过不相关: ${a.title.slice(0, 40)}`);
        continue;
      }
      const safe = sanitizePubDate(a.pub_date);
      // pub_date 列有 NOT NULL 约束：未来/非法日期统一回退为当前时间
      a.pub_date = safe ? new Date(safe) : new Date();
      passed.push(a);
    }
    articles = passed;

    if (articles.length > 0) {
      const { error: insertError } = await supabase
        .from('articles')
        .upsert(articles, { onConflict: 'link', ignoreDuplicates: true });

      if (insertError) {
        console.error(`✗ Insert failed for ${source.name}:`, insertError.message);
      } else {
        totalArticles += articles.length;
        sourcesWithArticles++;
      }
    }

    // Be polite: 800ms delay between sources
    await new Promise(resolve => setTimeout(resolve, 800));
  }

  console.log(`\n✅ Fetch complete!`);
  console.log(`   Sources with articles: ${sourcesWithArticles}/${sources.length}`);
  console.log(`   Total articles: ${totalArticles}`);
  return { sourcesWithArticles, totalArticles, totalSources: sources.length };
}

// Only run when executed directly (tsx), not when imported
const isMain = typeof process !== 'undefined' &&
  process.argv[1] && /fetch-sources/.test(process.argv[1]);
if (isMain) {
  runFetch().catch(console.error);
}
