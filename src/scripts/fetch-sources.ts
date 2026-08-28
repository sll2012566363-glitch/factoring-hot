import { createClient } from '@supabase/supabase-js';
import Parser from 'rss-parser';
import { fetch as fetchHtml } from 'undici';
import * as cheerio from 'cheerio';
import { classifyArticle } from '../lib/classifier';
import { editorialExclusionReason, isRelevant } from '../lib/relevance';
import { sanitizePubDate, nowToMinute } from '../lib/date-utils';
import { keepProcessAlive } from '../lib/keep-process-alive';
import { readHtmlResponse } from '../lib/http-text';
import { isScriptInvoked } from '../lib/script-entry';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const parser = new Parser();
let extendedHealthColumnsAvailable: boolean | null = null;
const SOURCE_PAGE_TIMEOUT_MS = 8_000;
const MAX_AMBIGUOUS_CANDIDATES_PER_SOURCE = 40;
const MAX_ARTICLES_PER_SOURCE = 50;
const MAX_HTML_PAGES_PER_SOURCE = 4;
const HISTORICAL_LOOKBACK_DAYS = 60;
const SOURCE_FAILURE_ALERT_THRESHOLD = 3;
const SOURCE_FAILURE_HARD_THRESHOLD = 12;

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
  consecutive_failures?: number | null;
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
  // Fallback: 抓不到日期时，回退为真实的抓取时刻（精确到分钟），不再伪造“今日 00:00”
  return nowToMinute();
}

function isRecentCandidate(date: Date): boolean {
  const timestamp = date.getTime();
  if (!Number.isFinite(timestamp)) return false;
  const ageDays = (Date.now() - timestamp) / 86_400_000;
  return ageDays >= -1 && ageDays <= HISTORICAL_LOOKBACK_DAYS;
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
          pub_date: item.pubDate ? new Date(item.pubDate) : nowToMinute(),
          source_id: source.id,
          source_name: source.name,
          category: classification.section,
          priority: source.priority,
          weight: source.weight,
        };
      });
  } catch (error) {
    throw new Error(`RSS failed: ${(error as Error).message}`);
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
    for (let pno = 1; pno <= MAX_HTML_PAGES_PER_SOURCE && articles.length < MAX_ARTICLES_PER_SOURCE; pno++) {
      const response = await fetchHtml('https://app.dahecube.com/napi/news/pc/list', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channelid: 1, pno, psize: MAX_ARTICLES_PER_SOURCE }),
        signal: AbortSignal.timeout(SOURCE_PAGE_TIMEOUT_MS),
      });
      const data = await response.json() as any;
      const items = data.code === 0 ? data.data?.items || [] : [];
      if (items.length === 0) break;
      for (const item of items) {
        if (!item.title) continue;
        const link = item.qtype === 1 && item.linkurl
          ? item.linkurl
          : `https://www.dahecube.com/article.html?artid=${item.recid}`;
        articles.push({
          title: item.title,
          link,
          content: '',
          excerpt: item.summary || '',
          pub_date: item.pubtime ? new Date(item.pubtime) : nowToMinute(),
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
    throw new Error(`API failed: ${(error as Error).message}`);
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
      signal: AbortSignal.timeout(SOURCE_PAGE_TIMEOUT_MS),
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
          pub_date: m.publishTime ? new Date(m.publishTime) : nowToMinute(),
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
    throw new Error(`API failed: ${(error as Error).message}`);
  }
  return articles;
}

async function fetchCcxi(source: Source): Promise<Article[]> {
  const articles: Article[] = [];
  try {
    const orderby = JSON.stringify({ chuangjianshijian: 'desc' });
    for (let pageNo = 1; pageNo <= MAX_HTML_PAGES_PER_SOURCE && articles.length < MAX_ARTICLES_PER_SOURCE; pageNo++) {
      const url = `https://website-api.ccxi.com.cn/admin/content/wzgl/page?pageNo=${pageNo}&pageSize=${MAX_ARTICLES_PER_SOURCE}&orderby=${encodeURIComponent(orderby)}`;
      const response = await fetchHtml(url, {
        headers: { 'Accept': 'application/json' },
        signal: AbortSignal.timeout(30000),
      });
      const data = await response.json() as any;
      const records = data.data?.records || [];
      if (records.length === 0) break;
      for (const item of records) {
        if (!item.mingcheng) continue;
        articles.push({
          title: item.mingcheng,
          link: `https://www.ccxi.com.cn/news/detail/${item.id}`,
          content: '',
          excerpt: item.miaoshu && item.miaoshu !== '暂无' ? item.miaoshu : '',
          pub_date: item.chuangjianshijian ? new Date(item.chuangjianshijian) : nowToMinute(),
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
    throw new Error(`API failed: ${(error as Error).message}`);
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
  if (editorialExclusionReason(title, href)) return true;
  return NOISE_PATTERNS.some(p => p.test(title) || p.test(href));
}

// 政务网站（如天津市地方金融管理局）用 onclick="isDownLoad(this,'url')" 打开文章页，
// <a> 没有 href——从 onclick 里解析出真实链接
function extractLinkUrl($link: cheerio.Cheerio<any>): string | undefined {
  const href = $link.attr('href');
  if (href && href !== '#' && !/^javascript:/i.test(href)) return href;
  const onclick = $link.attr('onclick');
  if (!onclick) return undefined;
  const m = onclick.match(/['"]([^'"]*\/[^'"]*\.(?:html?|shtml)|https?:\/\/[^'"]+)['"]/i);
  return m ? m[1] : undefined;
}

// 部分站点（如德和衡官网）把日期前缀和"查看详细内容"后缀拼进链接文本，清掉再入库
function cleanLinkTitle(title: string): string {
  return title
    .replace(/^\s*(\d{4}[-/.年]\d{1,2}[-/.月]\d{1,2}[日]?)\s*/, '')
    .replace(/\s*(查看详细内容|查看详情|阅读全文|更多\s*>>*)\s*$/i, '')
    .trim();
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
      const href = extractLinkUrl($link);
      const textTitle = $link.text().trim().replace(/\s+/g, ' ');
      const attributeTitle = ($link.attr('title') || '').trim().replace(/\s+/g, ' ');
      const title = cleanLinkTitle(attributeTitle.length > textTitle.length ? attributeTitle : textTitle);

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
      const href = extractLinkUrl($el);
      const textTitle = $el.text().trim().replace(/\s+/g, ' ');
      const attributeTitle = ($el.attr('title') || '').trim().replace(/\s+/g, ' ');
      const title = cleanLinkTitle(attributeTitle.length > textTitle.length ? attributeTitle : textTitle);

      if (!href || isNoiseLink(title, href)) return;

      const link = resolveUrl(baseUrl, href);
      if (!link || seenLinks.has(link)) return;

      // Filter: link should look like an article URL (has path depth or date pattern)
      try {
        const urlObj = new URL(link);
        const urlPath = urlObj.pathname;
        // 栏目/频道首页（以 / 结尾且路径无日期，如 /GB/Treasury/CFO/）不是文章，
        // 但会通过下面的 path-depth 判断混进来——先行拦截
        if (urlPath.endsWith('/') && !/\d{4}/.test(urlPath)) return;
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
      signal: AbortSignal.timeout(SOURCE_PAGE_TIMEOUT_MS),
    });
    const html = await readHtmlResponse(response as unknown as Response);
    const firstPage = genericExtract(cheerio.load(html), source, source.url);
    const all = [...firstPage];

    // 常见中文站点分页参数不统一；并行尝试 page/pageNo，重复链接会被去重。
    // 失败或不支持分页的站点仍保留首页结果，不影响整批抓取。
    const pageUrls = Array.from({ length: MAX_HTML_PAGES_PER_SOURCE - 1 }, (_, index) => index + 2)
      .flatMap(page => {
        const joiner = source.url.includes('?') ? '&' : '?';
        return [
          `${source.url}${joiner}page=${page}`,
          `${source.url}${joiner}pageNo=${page}`,
        ];
      });
    const pageResults = await Promise.allSettled(pageUrls.map(async (url) => {
      const pageResponse = await fetchHtml(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
          'Accept': 'text/html,application/xhtml+xml',
          'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
        },
        signal: AbortSignal.timeout(SOURCE_PAGE_TIMEOUT_MS),
      });
      const pageHtml = await readHtmlResponse(pageResponse as unknown as Response);
      return genericExtract(cheerio.load(pageHtml), source, url);
    }));
    for (const result of pageResults) {
      if (result.status === 'fulfilled') all.push(...result.value);
    }

    const unique = Array.from(new Map(all.map(article => [article.link, article])).values());
    const limited = unique.slice(0, MAX_ARTICLES_PER_SOURCE);
    console.log(`✓ HTML: ${limited.length} articles from ${source.name} (首页+分页)`);
    return limited;
  } catch (error) {
    throw new Error(`HTML failed: ${(error as Error).message}`);
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
  let failedSources = 0;
  const unhealthySources: Array<{ name: string; failures: number; error: string }> = [];

  // The first update works against the old schema too. Extended telemetry is
  // best-effort until the accompanying migration has been applied.
  async function recordHealth(source: Source, outcome: 'success' | 'error', fetched: number, inserted: number, message?: string) {
    const now = new Date().toISOString();
    await supabase.from('sources').update({ last_fetched_at: now }).eq('id', source.id);
    const payload = outcome === 'success'
      ? { last_fetch_status: outcome, last_fetch_error: null, last_fetch_article_count: fetched, last_fetch_new_article_count: inserted, consecutive_failures: 0 }
      : { last_fetch_status: outcome, last_fetch_error: (message || 'Unknown fetch error').substring(0, 500), last_fetch_article_count: fetched, last_fetch_new_article_count: inserted, consecutive_failures: (source.consecutive_failures || 0) + 1 };
    if (extendedHealthColumnsAvailable === false) return;
    const { error: healthError } = await supabase.from('sources').update(payload).eq('id', source.id);
    if (healthError && /(column .* does not exist|could not find the .* column)/i.test(healthError.message)) {
      extendedHealthColumnsAvailable = false;
      console.warn('  ⚠ Source-health migration has not been applied; only last_fetched_at is being recorded for this run.');
    } else if (healthError) {
      console.warn(`  ⚠ Health telemetry failed for ${source.name}: ${healthError.message}`);
    } else {
      extendedHealthColumnsAvailable = true;
    }
  }

  // 58+ 个信源串行抓取时，仅网络 I/O 就会超过 runStep 的 10 分钟步骤超时
  //（2026-08-28 实测 10 分钟只跑完 57/58）。信源之间用有界并发池并行：
  // 每个信源内部仍是逐页串行（对单一站点保持礼貌），不同站点同时抓取
  // 只是相当于浏览器开了多个标签页。
  const SOURCE_CONCURRENCY = 6;
  const queue = [...(sources as Source[])];

  async function processSource(source: Source) {
    try {
      let articles: Article[] = [];

      if (API_FETCHERS[source.id]) {
        articles = await API_FETCHERS[source.id](source);
      } else if (source.rss) {
        articles = await fetchRSS(source);
      } else {
        articles = await fetchHtmlContent(source);
      }
      const fetchedCount = articles.length;

    // 相关性闸门 + 未来日期拦截（治本：过滤不相关与未来日期文章）
    // 并发判断：LLM 兜底调用是同步阻塞的主要耗时来源，逐篇 await 会把一个
    // ~20篇的批次拖到分钟级、累加 40 个信源后撞 runStep() 的 10 分钟内部
    // 超时（2026-07-14 实测过）。同一信源内的文章并发判断，信源之间仍按
    // 原样顺序 + 800ms 间隔跑，不会对外部站点或 LLM API 造成突发流量。
    const relevanceResults = await Promise.all(
      articles.map(async (a) => ({
        article: a,
        rel: await isRelevant(a.title, a.content || a.excerpt || '', {
          sourceId: source.id,
          url: a.link,
        }),
      }))
    );
    const passed: Article[] = [];
    let candidateCount = 0;
    for (const { article: a, rel } of relevanceResults) {
      // Ambiguous recent items must reach the batch LLM pre-filter. The old
      // code discarded them here, so a generic news source could never yield
      // a newly published factoring/SCF article unless its title contained a
      // strong keyword. Explicit site noise and ads remain blocked.
      const keepAsCandidate = !rel.relevant
        && rel.method === 'skipped'
        && !rel.reason
        && isRecentCandidate(a.pub_date)
        && candidateCount < MAX_AMBIGUOUS_CANDIDATES_PER_SOURCE;
      if (!rel.relevant && !keepAsCandidate) {
        console.log(`  ⏩ 跳过不相关: ${a.title.slice(0, 40)}`);
        continue;
      }
      if (keepAsCandidate) {
        candidateCount++;
        console.log(`  🔎 候选待预筛: ${a.title.slice(0, 40)}`);
      }
      const safe = sanitizePubDate(a.pub_date);
      // pub_date 列有 NOT NULL 约束：未来/非法日期统一回退为“实时当前时间（精确到分钟）”
      a.pub_date = safe ? new Date(safe) : nowToMinute();
      passed.push(a);
    }
      articles = passed;
      let insertedCount = 0;

      if (articles.length > 0) {
        const { data: inserted, error: insertError } = await supabase
          .from('articles')
          .upsert(articles, { onConflict: 'link', ignoreDuplicates: true })
          .select('id');

        if (insertError) throw new Error(`Insert failed: ${insertError.message}`);
        insertedCount = inserted?.length || 0;
        totalArticles += insertedCount;
        if (fetchedCount > 0) sourcesWithArticles++;
      }

      console.log(`  ↳ ${source.name}: 抓取 ${fetchedCount}，通过/候选 ${articles.length}（候选 ${candidateCount}），新增 ${insertedCount}`);
      await recordHealth(source, 'success', fetchedCount, insertedCount);
    } catch (err) {
      failedSources++;
      const message = err instanceof Error ? err.message : String(err);
      console.error(`✗ Source failed for ${source.name}: ${message}`);
      const failures = (source.consecutive_failures || 0) + 1;
      if (failures >= SOURCE_FAILURE_ALERT_THRESHOLD) {
        unhealthySources.push({ name: source.name, failures, error: message.substring(0, 180) });
      }
      if (failures >= SOURCE_FAILURE_HARD_THRESHOLD) {
        console.error(`🚨 Critical source outage: ${source.name} has failed ${failures} consecutive times.`);
      }
      await recordHealth(source, 'error', 0, 0, message);
    }
  }

  const workers = Array.from(
    { length: Math.min(SOURCE_CONCURRENCY, queue.length) },
    () => (async () => {
      while (queue.length > 0) {
        const source = queue.shift()!;
        await processSource(source);
        // Be polite: 800ms delay between sources handled by this worker
        await new Promise(resolve => setTimeout(resolve, 800));
      }
    })()
  );
  await Promise.all(workers);

  console.log(`\n✅ Fetch complete!`);
  console.log(`   Sources with articles: ${sourcesWithArticles}/${sources.length}`);
  console.log(`   Failed sources: ${failedSources}`);
  console.log(`   Total articles: ${totalArticles}`);
  if (unhealthySources.length > 0) {
    console.warn(`⚠ Source health warning: ${unhealthySources.length} source(s) have failed ${SOURCE_FAILURE_ALERT_THRESHOLD}+ consecutive times.`);
    for (const source of unhealthySources) console.warn(`   - ${source.name}: ${source.failures} failures; ${source.error}`);
  }
  if (failedSources >= Math.max(12, Math.ceil(sources.length * 0.5))) {
    throw new Error(`Source outage threshold exceeded: ${failedSources}/${sources.length} active sources failed.`);
  }
  return { sourcesWithArticles, failedSources, totalArticles, totalSources: sources.length, unhealthySources };
}

// Only run when executed directly (tsx), not when imported
const isMain = isScriptInvoked(/fetch-sources/);
if (isMain) {
  keepProcessAlive(runFetch()).catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
