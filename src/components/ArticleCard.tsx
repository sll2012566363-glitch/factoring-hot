'use client';

import Link from 'next/link';
import { Article } from '@/types';
import { formatRelativeTime } from '@/lib/date-utils';

interface ArticleCardProps {
  article: Article;
  categoryName?: string;
}

function getScoreColor(score: number): string {
  if (score >= 80) return 'bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400 border-red-200 dark:border-red-900';
  if (score >= 60) return 'bg-orange-50 dark:bg-orange-950/40 text-orange-600 dark:text-orange-400 border-orange-200 dark:border-orange-900';
  if (score >= 40) return 'bg-yellow-50 dark:bg-yellow-950/40 text-yellow-700 dark:text-yellow-400 border-yellow-200 dark:border-yellow-900';
  return 'bg-gray-50 dark:bg-gray-950 text-gray-500 dark:text-gray-400 border-gray-200 dark:border-gray-800';
}

function getScoreLabel(score: number): string {
  if (score >= 80) return '热点';
  if (score >= 60) return '关注';
  if (score >= 40) return '一般';
  return '';
}

export default function ArticleCard({ article, categoryName }: ArticleCardProps) {
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const y = date.getFullYear();
    const m = date.getMonth() + 1;
    const d = date.getDate();
    const time = `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
    return `${y}年${m}月${d}日 ${time}`;
  };

  const score = article.score != null ? Math.round(article.score) : null;
  const relTime = formatRelativeTime(article.pub_date);
  // 封面图走 img-proxy，绕源站防盗链
  const coverSrc = article.cover_image
    ? `/api/img-proxy?url=${encodeURIComponent(article.cover_image)}`
    : null;

  return (
    <article className="group bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800 p-4 hover:border-blue-300 dark:hover:border-blue-700 hover:shadow-sm transition-all duration-200">
      <div className="flex items-start gap-3">
        {/* Score badge on the left */}
        {score !== null && (
          <div className={`flex-shrink-0 w-10 h-10 rounded-lg flex flex-col items-center justify-center border ${getScoreColor(score)}`}>
            <span className="text-sm font-bold leading-none">{score}</span>
            {getScoreLabel(score) && (
              <span className="text-[9px] leading-none mt-0.5 opacity-70">{getScoreLabel(score)}</span>
            )}
          </div>
        )}

        <div className="flex-1 min-w-0">
          {/* Title */}
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-1.5 line-clamp-2 leading-snug">
            <Link href={`/article/${article.id}`} className="hover:text-blue-600 dark:hover:text-blue-400 transition-colors">
              {article.title}
            </Link>
          </h3>

          {/* Excerpt + 封面缩略图 */}
          {(article.excerpt || article.content || coverSrc) && (
            <div className="flex items-start gap-3 mb-2">
              {(article.excerpt || article.content) && (
                <p className="flex-1 min-w-0 text-xs text-gray-500 dark:text-gray-400 line-clamp-2 leading-relaxed">
                  {article.excerpt || article.content}
                </p>
              )}
              {coverSrc && (
                <Link href={`/article/${article.id}`} className="flex-shrink-0">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={coverSrc}
                    alt=""
                    loading="lazy"
                    className="w-20 h-14 object-cover rounded-md border border-gray-100 dark:border-gray-800"
                    onError={(e) => { (e.target as HTMLImageElement).parentElement!.style.display = 'none'; }}
                  />
                </Link>
              )}
            </div>
          )}

          {/* Meta row */}
          <div className="flex items-center gap-2 text-xs flex-wrap">
            {categoryName && (
              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-medium bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400">
                {categoryName}
              </span>
            )}
            <span className="text-gray-500 dark:text-gray-400">
              {article.source_name}
            </span>
            <span className="text-gray-300 dark:text-gray-600">·</span>
            <span className="text-gray-400" title={formatDate(article.pub_date)} suppressHydrationWarning>
              {relTime || formatDate(article.pub_date)}
            </span>
            {article.ai_reason && (
              <>
                <span className="text-gray-300 dark:text-gray-600">·</span>
                <span className="text-gray-400 italic line-clamp-1 max-w-[200px]" title={article.ai_reason}>
                  {article.ai_reason}
                </span>
              </>
            )}
            <a
              href={article.link}
              target="_blank"
              rel="noopener noreferrer"
              className="ml-auto text-gray-300 dark:text-gray-600 hover:text-blue-500 dark:hover:text-blue-400 transition-colors flex-shrink-0"
              title="查看原文"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
            </a>
          </div>
        </div>
      </div>
    </article>
  );
}
