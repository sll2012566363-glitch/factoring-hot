export type ContentTier = 'full' | 'summary' | 'external';

export interface ContentQuality {
  tier: ContentTier;
  textLength: number;
  htmlLength: number;
  paragraphCount: number;
  reason: string;
}

// “全文”是前台承诺，不可把 meta description 或几十字导语当作正文。
// 纯文本达到 300 字可独立通过；较短公告须同时具备正文 HTML 结构。
export const FULL_TEXT_MIN_LENGTH = 300;
export const STRUCTURED_TEXT_MIN_LENGTH = 150;
export const FULL_HTML_MIN_LENGTH = 300;
export const FULL_PARAGRAPH_MIN_COUNT = 1;
export const SUMMARY_TEXT_MIN_LENGTH = 80;

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

  const hasLongText = textLength >= FULL_TEXT_MIN_LENGTH;
  const hasStructuredShortBody = textLength >= STRUCTURED_TEXT_MIN_LENGTH
    && htmlLength >= FULL_HTML_MIN_LENGTH
    && paragraphCount >= FULL_PARAGRAPH_MIN_COUNT;

  if (hasLongText || hasStructuredShortBody) {
    return { tier: 'full', textLength, htmlLength, paragraphCount, reason: '全文已收录并通过结构校验' };
  }
  if (textLength >= SUMMARY_TEXT_MIN_LENGTH) {
    return { tier: 'summary', textLength, htmlLength, paragraphCount, reason: '仅收录摘要，未达到站内全文标准' };
  }
  return { tier: 'external', textLength, htmlLength, paragraphCount, reason: '未收录可验证正文，仅保留原文线索' };
}

export function hasFullContent(article: { content?: string | null; content_html?: string | null }): boolean {
  return assessContentQuality(article).tier === 'full';
}

export function contentQualityFields(article: { content?: string | null; content_html?: string | null }) {
  const quality = assessContentQuality(article);
  return {
    content_quality: quality.tier,
    content_word_count: quality.textLength,
    content_checked_at: new Date().toISOString(),
  };
}

export function partitionByContentQuality<T extends { content?: string | null; content_html?: string | null }>(articles: T[]) {
  const full: T[] = [];
  const sourceOnly: T[] = [];
  for (const article of articles) (hasFullContent(article) ? full : sourceOnly).push(article);
  return { full, sourceOnly };
}
