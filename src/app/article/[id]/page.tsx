import { createClient } from '@supabase/supabase-js';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import * as cheerio from 'cheerio';

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

const CONTENT_SELECTORS = [
  'article', '.article-content', '.content', '#content',
  '.post-body', '.entry-content', '.TRS_Editor', '.text',
  '.detail-content', '.news-content',
];

/** 从正文中提取摘要：取前2个完整句子 */
function extractExcerptFromContent(content: string): string {
  if (!content) return '';
  // Split by sentence-ending punctuation
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

/** 从URL实时抓取完整正文（不截断） */
async function fetchFullContent(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
      },
      signal: AbortSignal.timeout(15000),
      cache: 'no-store',
    });
    if (!res.ok) return null;
    const html = await res.text();
    const $ = cheerio.load(html);
    $('script, style, nav, header, footer, .ad, .sidebar, .comment, .comments').remove();

    for (const sel of CONTENT_SELECTORS) {
      const $el = $(sel).first();
      if ($el.length) {
        const text = $el.text().replace(/\s+/g, ' ').trim();
        if (text.length > 80) return text;
      }
    }
    const paragraphs: string[] = [];
    $('p').each((_i, el) => {
      const t = $(el).text().replace(/\s+/g, ' ').trim();
      if (t.length > 20) paragraphs.push(t);
    });
    if (paragraphs.length > 0) {
      paragraphs.sort((a, b) => b.length - a.length);
      return paragraphs.slice(0, 30).join(' ');
    }
    const bodyText = $('body').text().replace(/\s+/g, ' ').trim();
    return bodyText.length > 80 ? bodyText : null;
  } catch {
    return null;
  }
}

interface PageProps {
  params: { id: string };
}

export default async function ArticleDetailPage({ params }: PageProps) {
  const { data: article, error } = await supabase
    .from('articles')
    .select('*')
    .eq('id', params.id)
    .single();

  if (error || !article) {
    notFound();
  }

  // ── 正文：取完整内容，不够就实时抓 ──
  let content = article.content;
  const contentIncomplete = !content || content.length < 50
    || (content.length < 3000 && !/[。！？）》"']\s*$/.test(content.trim()));
  if (contentIncomplete) {
    const live = await fetchFullContent(article.link);
    if (live) {
      content = live;
      // Persist full content for next visit
      await supabase.from('articles').update({ content }).eq('id', article.id);
    }
  }

  // ── 摘要：三层优先级 ──
  let excerpt = '';
  if (article.scoring_method === 'llm' && article.excerpt && article.excerpt.length > 10) {
    // 1. LLM生成的摘要最好
    excerpt = article.excerpt;
  } else if (content && content.length > 30) {
    // 2. 从正文取前2个完整句子
    excerpt = extractExcerptFromContent(content);
  } else if (article.excerpt) {
    // 3. 回退到已有excerpt
    excerpt = article.excerpt;
  }

  const pubDate = new Date(article.pub_date);
  const sectionName = SECTION_NAMES[article.category] || '监管新闻';

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center gap-3">
          <Link href="/" className="text-gray-400 hover:text-gray-700 transition-colors flex-shrink-0">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </Link>
          <span className="text-xs text-blue-600 font-medium px-2 py-0.5 bg-blue-50 rounded flex-shrink-0">{sectionName}</span>
          <span className="text-sm text-gray-500 truncate">{article.source_name}</span>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-8">
        {/* Meta */}
        <div className="flex flex-wrap items-center gap-2 mb-5">
          {article.score != null && (
            <span className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-semibold bg-yellow-50 text-yellow-700 border border-yellow-100">
              {Math.round(article.score)} 分
            </span>
          )}
          <time className="text-xs text-gray-400" dateTime={article.pub_date}>
            {pubDate.toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' })}
          </time>
          {article.scoring_method && (
            <>
              <span className="text-xs text-gray-300">|</span>
              <span className="text-xs text-gray-400">
                {article.scoring_method === 'llm' ? 'AI 评分' : '规则评分'}
              </span>
            </>
          )}
        </div>

        {/* Title */}
        <h1 className="text-xl sm:text-2xl font-bold text-gray-900 mb-5 leading-snug">
          {article.title}
        </h1>

        {/* AI Selection Reason */}
        {article.ai_reason && (
          <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm bg-indigo-50 text-indigo-700 border border-indigo-100 mb-5">
            <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
            </svg>
            <span>AI: {article.ai_reason}</span>
          </div>
        )}

        {/* Excerpt */}
        {excerpt && (
          <div className="bg-blue-50 border-l-4 border-blue-300 p-4 mb-6 rounded-r-lg">
            <p className="text-sm text-blue-800 leading-relaxed">{excerpt}</p>
          </div>
        )}

        {/* Score dimensions */}
        {article.score_dimensions && (
          <div className="grid grid-cols-5 gap-2 mb-6">
            {Object.entries(article.score_dimensions as Record<string, number>).map(([dim, val]) => {
              const labels: Record<string, string> = {
                frontier: '前沿解读', industry_model: '行业模式',
                regulatory: '监管动态', dispute: '争议解决', normative: '规范文件',
                policy: '政策敏感度', market: '市场信号', risk: '风险预警', innovation: '创新实践',
              };
              return (
                <div key={dim} className="bg-white rounded-lg border border-gray-100 p-3 text-center">
                  <div className="text-xl font-bold text-blue-600">{val}</div>
                  <div className="text-xs text-gray-500 mt-1">{labels[dim] || dim}</div>
                </div>
              );
            })}
          </div>
        )}

        {/* Content — 完整正文，不截断 */}
        {content && content.length > 20 ? (
          <div className="bg-white rounded-lg border border-gray-200 p-6 sm:p-8">
            <div className="text-gray-700 leading-7 text-[15px] space-y-4">
              {content.split(/(?<=[。！？\n])\s*/).filter((p: string) => p.trim().length > 5).map((para: string, i: number) => (
                <p key={i} className="indent-8">{para.trim()}</p>
              ))}
            </div>
          </div>
        ) : (
          <div className="bg-white rounded-lg border border-gray-200 p-6 text-center text-gray-400 text-sm">
            该文章暂无正文内容，可点击"查看原文"访问原始链接
          </div>
        )}

        {/* Actions */}
        <div className="mt-8 border-t border-gray-200 pt-6">
          <div className="flex items-center justify-between">
            <div className="text-xs text-gray-400">来源：{article.source_name}</div>
            <div className="flex items-center gap-3">
              <Link href="/" className="inline-flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-600 text-sm rounded-lg hover:bg-gray-200 transition-colors">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
                返回
              </Link>
              <a href={article.link} target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-4 py-2 bg-blue-500 text-white text-sm rounded-lg hover:bg-blue-600 transition-colors">
                查看原文
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
              </a>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
