import { createClient } from '@supabase/supabase-js';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { cache } from 'react';
import type { Metadata } from 'next';
import * as cheerio from 'cheerio';
import { extractContentHtml, extractPlainText, extractMetaDescription } from '@/lib/extract-content';
import { fetchSourceBody } from '@/lib/fetch-source-body';
import { assessContentQuality } from '@/lib/content-quality';
import { formatRelativeTime, formatDateSafe } from '@/lib/date-utils';
import AppShell from '@/components/AppShell';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const SECTION_NAMES: Record<string, string> = {
  frontier: '前沿解读',
  industry_model: '行业前沿模式',
  regulatory: '前沿监管新闻',
  dispute: '前沿争议解决',
  normative: '前沿规范文件',
};

/** 从正文中提取摘要：取前2个完整句子 */
function extractExcerptFromContent(content: string): string {
  if (!content) return '';
  const sentences: string[] = [];
  const parts = content.split(/(?<=[。！？])/);
  let total = 0;
  for (const part of parts) {
    const s = part.trim();
    if (s.length < 3) continue;
    sentences.push(s);
    total += s.length;
    if (sentences.length >= 2 && total >= 40) break;
    if (total >= 300) break;
  }
  if (sentences.length === 0) return content.substring(0, 200);
  return sentences.join('');
}

/** 从URL实时抓取完整正文（HTML版 + 纯文本版） */
async function fetchFullContent(url: string): Promise<{ html: string; text: string; coverImage: string | null } | null> {
  try {
    const sourceHtml = await fetchSourceBody(url);
    const res = sourceHtml ? null : await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
      },
      signal: AbortSignal.timeout(15000),
      cache: 'no-store',
    });
    if (res && !res.ok) return null;

    // ── 防止 PDF / 二进制 / 非 HTML 内容污染正文 ──
    const contentType = res ? (res.headers.get('content-type') || '').toLowerCase() : 'text/html';
    if (res && (
      contentType.includes('application/pdf')
      || contentType.includes('application/octet-stream')
      || contentType.startsWith('image/')
      || contentType.startsWith('video/')
      || (!contentType.includes('text/') && !contentType.includes('html') && !contentType.includes('xml'))
    )) {
      return null;
    }

    const rawHtml = sourceHtml || await res!.text();

    // ── 二次保险：即使 Content-Type 蒙混过关，%PDF 开头一律拦截 ──
    if (rawHtml.trimStart().startsWith('%PDF')) {
      return null;
    }
    const $ = cheerio.load(rawHtml);
    const { html, coverImage } = extractContentHtml($, url);
    if (!html || html.length < 50) {
      // 正文提取失败（JS 渲染站）：meta description 兜底当摘要
      const metaDesc = extractMetaDescription($);
      if (metaDesc) return { html: '', text: metaDesc, coverImage };
      return null;
    }

    const text = extractPlainText(html);
    return { html, text, coverImage };
  } catch {
    return null;
  }
}

interface PageProps {
  params: Promise<{ id: string }>;
}

/** 同一请求内 generateMetadata 与页面组件共享查询结果 */
const getArticle = cache(async (id: string) => {
  const { data, error } = await supabase
    .from('articles')
    .select('*')
    .eq('id', id)
    .eq('pre_filtered', true)
    .in('status', ['selected', 'pending'])
    .single();
  return error ? null : data;
});

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  const article = await getArticle(id);
  if (!article) return { title: '文章不存在 · 保理热榜' };
  const description = (article.excerpt || article.content || '').substring(0, 120);
  const cover = (article as any).cover_image || undefined;
  return {
    title: `${article.title} · 保理热榜`,
    description,
    openGraph: {
      title: article.title,
      description,
      type: 'article',
      ...(cover ? { images: [{ url: cover }] } : {}),
    },
  };
}

export default async function ArticleDetailPage({ params }: PageProps) {
  const { id } = await params;
  const article = await getArticle(id);

  if (!article) {
    notFound();
  }

  // ── 正文HTML：优先用已存储的content_html，否则实时抓取 ──
  let contentHtml = (article as any).content_html || null;
  let content = article.content;
  let coverImage = (article as any).cover_image || null;

  const needsFetch = !contentHtml && (!content || content.length < 50
    || (content.length < 3000 && !/[。！？）》"']\s*$/.test(content.trim())));

  if (needsFetch) {
    const live = await fetchFullContent(article.link);
    if (live) {
      contentHtml = live.html;
      content = live.text;
      if (!coverImage && live.coverImage) coverImage = live.coverImage;
      // Persist for next visit
      const updatePayload: Record<string, any> = {
        content: live.text.substring(0, 5000),
        content_html: live.html,
      };
      if (coverImage) updatePayload.cover_image = coverImage;
      await supabase.from('articles').update(updatePayload).eq('id', article.id);
    }
  }
  const contentQuality = assessContentQuality({ content, content_html: contentHtml });
  const isFullContent = contentQuality.tier === 'full';

  // ── 摘要：三层优先级 ──
  let excerpt = '';
  if (article.scoring_method === 'llm' && article.excerpt && article.excerpt.length > 10) {
    excerpt = article.excerpt;
  } else if (content && content.length > 30) {
    excerpt = extractExcerptFromContent(content);
  } else if (article.excerpt) {
    excerpt = article.excerpt;
  }

  const pubDate = new Date(article.pub_date);
  const sectionName = SECTION_NAMES[article.category] || '监管新闻';

  // 北京时间展示（固定 Asia/Shanghai，避免 Vercel UTC 服务器导致慢 8 小时）
  const formatDate = (d: Date) => formatDateSafe(d);

  return (
    <AppShell wide>
      <article>
        <header className="article-head">
        <div className="article-source">
          <Link href="/" className="soft-button">返回精选</Link>
          <span className="feed-tag">{sectionName}</span>
          <span>{article.source_name}</span>
          {article.score != null && (
            <span className="feed-item-score">{Math.round(article.score)} 分</span>
          )}
          <time className="text-xs text-gray-400" dateTime={article.pub_date}>
            {formatDate(pubDate)}
          </time>
          {formatRelativeTime(article.pub_date) && (
            <span className="text-xs text-gray-400">· {formatRelativeTime(article.pub_date)}</span>
          )}
          {article.scoring_method && (
            <>
              <span className="text-xs text-gray-300 dark:text-gray-600">|</span>
              <span className="text-xs text-gray-400">
                {article.scoring_method === 'llm' ? 'AI 评分' : '规则评分'}
              </span>
            </>
          )}
        </div>
        <h1 className="article-title">{article.title}</h1>

        {/* AI Selection Reason */}
        {article.ai_reason && (
          <div className="article-reason">
            <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
            </svg>
            <span>AI: {article.ai_reason}</span>
          </div>
        )}

        {/* Excerpt */}
        {excerpt && <p className="article-lead">{excerpt}</p>}
        </header>

        {/* Score dimensions */}
        {article.score_dimensions && (
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 my-6">
            {Object.entries(article.score_dimensions as Record<string, number>).map(([dim, val]) => {
              const labels: Record<string, string> = {
                frontier: '前沿解读', industry_model: '行业模式',
                regulatory: '监管动态', dispute: '争议解决', normative: '规范文件',
                policy: '政策敏感度', market: '市场信号', risk: '风险预警', innovation: '创新实践',
              };
              return (
                <div key={dim} className="surface p-3 text-center">
                  <div className="text-xl font-bold text-[var(--brand)]">{val}</div>
                  <div className="text-xs text-[var(--muted)] mt-1">{labels[dim] || dim}</div>
                </div>
              );
            })}
          </div>
        )}

        {/* Content — 优先渲染HTML，降级为纯文本 */}
        {isFullContent && <div className="flex items-center gap-3 mb-4 mt-8"><span className="text-xs text-[var(--muted)] tracking-widest">内容原文 · 已收录全文</span><div className="flex-1 border-t border-[var(--line)]" /></div>}
        {isFullContent && contentHtml ? (
          <div className="article-content">
            <article
              className="article-body"
              dangerouslySetInnerHTML={{ __html: contentHtml }}
            />
          </div>
        ) : isFullContent && content && content.length > 20 ? (
          <div className="article-content">
            <div className="text-gray-700 dark:text-gray-300 dark:text-gray-600 leading-7 text-[15px] space-y-4">
              {content.split(/(?<=[。！？\n])\s*/).filter((p: string) => p.trim().length > 5).map((para: string, i: number) => (
                <p key={i} className="indent-8">{para.trim()}</p>
              ))}
            </div>
          </div>
        ) : (
          <div className="article-content text-center text-[var(--muted)] text-sm">
            <p>此条内容未达到站内全文标准，因此不展示为文章正文。</p>
            <p className="mt-2">{contentQuality.reason}；请查看原始链接获取完整内容。</p>
          </div>
        )}

        {/* Actions */}
        <div className="mt-8 border-t border-[var(--line)] pt-6">
          <div className="flex items-center justify-between">
            <div className="text-xs text-gray-400">来源：{article.source_name}</div>
            <div className="flex items-center gap-3">
              <Link href="/" className="soft-button">返回精选</Link>
              <a href={`https://github.com/sll2012566363-glitch/factoring-hot/issues/new?title=${encodeURIComponent(`正文质量反馈：${article.title}`)}`} target="_blank" rel="noopener noreferrer" className="soft-button">反馈正文问题</a>
              <a href={article.link} target="_blank" rel="noopener noreferrer"
                className="primary-button">
                查看原文
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
              </a>
            </div>
          </div>
        </div>
      </article>
    </AppShell>
  );
}
