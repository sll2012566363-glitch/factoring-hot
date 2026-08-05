import * as cheerio from 'cheerio';
import { extractContentHtml, extractMetaDescription, extractPlainText } from '@/lib/extract-content';
import { fetchSourceBody } from '@/lib/fetch-source-body';
import { readHtmlResponse } from '@/lib/http-text';

const USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

export interface FetchedArticleContent {
  title: string | null;
  html: string;
  text: string;
  excerpt: string;
  coverImage: string | null;
  pubDate: string | null;
  summaryOnly: boolean;
}

function extractPageTitle($: cheerio.CheerioAPI): string | null {
  const candidates = [
    $('meta[property="og:title"]').attr('content'),
    $('meta[name="twitter:title"]').attr('content'),
    $('article h1').first().text(),
    $('.aTitle').first().text(),
    $('.newsBigTit').first().text(),
    $('h1').first().text(),
  ];
  for (const candidate of candidates) {
    const title = candidate?.trim().replace(/\s+/g, ' ');
    if (title && title !== '新闻标题' && title.length >= 6 && title.length <= 200) return title;
  }
  return null;
}

function isHtmlResponse(response: Response): boolean {
  const contentType = (response.headers.get('content-type') || '').toLowerCase();
  if (!contentType) return true;
  if (contentType.includes('application/pdf') || contentType.includes('application/octet-stream')) return false;
  if (contentType.startsWith('image/') || contentType.startsWith('video/')) return false;
  return contentType.includes('text/') || contentType.includes('html') || contentType.includes('xml');
}

function isPlausibleArticleDate(date: Date): boolean {
  const earliest = new Date('2000-01-01T00:00:00Z');
  const latest = new Date(Date.now() + 24 * 60 * 60 * 1000);
  return date >= earliest && date <= latest;
}

function extractPubDate($: cheerio.CheerioAPI, sourceUrl: string): string | null {
  const selectors = [
    'meta[name="publishdate"]', 'meta[name="pubdate"]', 'meta[name="publish_date"]',
    'meta[name="publishDate"]', 'meta[name="article:published_time"]',
    'meta[property="article:published_time"]', 'meta[property="og:article:published_time"]',
    'meta[name="Date"]', 'meta[name="pub_date"]', 'meta[name="createtime"]',
  ];
  for (const selector of selectors) {
    const value = $(selector).attr('content');
    if (!value) continue;
    const date = new Date(value);
    if (!Number.isNaN(date.getTime()) && isPlausibleArticleDate(date)) return date.toISOString();
  }

  const time = $('time').first();
  const timeValue = time.attr('datetime') || time.text().trim();
  if (timeValue) {
    const date = new Date(timeValue);
    if (!Number.isNaN(date.getTime()) && isPlausibleArticleDate(date)) return date.toISOString();
  }

  const match = $('body').text().match(/(\d{4})[-/.年](\d{1,2})[-/.月](\d{1,2})[日]?/);
  if (match) {
    const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
    if (!Number.isNaN(date.getTime()) && isPlausibleArticleDate(date)) return date.toISOString();
  }

  const timestamp = Number(new URL(sourceUrl).searchParams.get('_t'));
  const timestampDate = new Date(timestamp * 1000);
  return Number.isFinite(timestamp) && isPlausibleArticleDate(timestampDate) ? timestampDate.toISOString() : null;
}

function buildExcerpt(text: string): string {
  const sample = text.substring(0, 300);
  const end = Math.max(sample.lastIndexOf('。'), sample.lastIndexOf('！'), sample.lastIndexOf('？'));
  return end > 100 ? sample.substring(0, end + 1) : sample;
}

/** Shared body fetcher used by enrichment jobs and the article detail fallback. */
export async function fetchArticleContent(url: string): Promise<FetchedArticleContent | null> {
  try {
    const adaptedHtml = await fetchSourceBody(url);
    const response = adaptedHtml ? null : await fetch(url, {
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
      },
      signal: AbortSignal.timeout(15_000),
      cache: 'no-store',
    });
    if (response && (!response.ok || !isHtmlResponse(response))) return null;

    const rawHtml = adaptedHtml || await readHtmlResponse(response!);
    if (rawHtml.trimStart().startsWith('%PDF')) return null;

    const $ = cheerio.load(rawHtml);
    const title = extractPageTitle($);
    const { html, coverImage } = extractContentHtml($, url);
    const pubDate = extractPubDate($, url);
    if (!html || html.length < 50) {
      const summary = extractMetaDescription($);
      return summary
        ? { title, html: '', text: summary, excerpt: summary, coverImage, pubDate, summaryOnly: true }
        : null;
    }

    const text = extractPlainText(html);
    if (!text) return null;
    return { title, html, text, excerpt: buildExcerpt(text), coverImage, pubDate, summaryOnly: false };
  } catch {
    return null;
  }
}
