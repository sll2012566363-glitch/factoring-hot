export type ContentTier = 'full' | 'summary' | 'external';

export interface ContentQuality {
  tier: ContentTier;
  textLength: number;
  htmlLength: number;
  paragraphCount: number;
  reason: string;
}

export const FULL_TEXT_MIN_LENGTH = 400;
export const FULL_HTML_MIN_LENGTH = 300;
export const FULL_PARAGRAPH_MIN_COUNT = 3;

function plainText(value?: string | null): string {
  return (value || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function countParagraphs(html: string | null | undefined, text: string): number {
  const htmlParagraphs = (html?.match(/<p[\s>]/gi) || []).length;
  if (htmlParagraphs > 0) return htmlParagraphs;
  return text.split(/(?:\n+|(?<=[。！？]))/).filter(part => part.trim().length >= 30).length;
}

/**
 * Decides whether an article is safe to promise as an on-site full-text read.
 * This is deliberately deterministic: a model may enrich a summary, but it
 * must never turn a navigation shell into a "full article" by assertion alone.
 */
export function assessContentQuality(article: { content?: string | null; content_html?: string | null }): ContentQuality {
  const text = plainText(article.content);
  const html = article.content_html || '';
  const textLength = text.length;
  const htmlLength = html.trim().length;
  const paragraphCount = countParagraphs(html, text);

  if (textLength >= FULL_TEXT_MIN_LENGTH && htmlLength >= FULL_HTML_MIN_LENGTH && paragraphCount >= FULL_PARAGRAPH_MIN_COUNT) {
    return { tier: 'full', textLength, htmlLength, paragraphCount, reason: '全文已收录并通过结构校验' };
  }
  if (textLength >= 80) {
    return { tier: 'summary', textLength, htmlLength, paragraphCount, reason: '仅收录摘要，未达到站内全文标准' };
  }
  return { tier: 'external', textLength, htmlLength, paragraphCount, reason: '未收录可验证正文，仅保留原文线索' };
}

export function hasFullContent(article: { content?: string | null; content_html?: string | null }): boolean {
  return assessContentQuality(article).tier === 'full';
}

export function partitionByContentQuality<T extends { content?: string | null; content_html?: string | null }>(articles: T[]) {
  const full: T[] = [];
  const sourceOnly: T[] = [];
  for (const article of articles) (hasFullContent(article) ? full : sourceOnly).push(article);
  return { full, sourceOnly };
}
