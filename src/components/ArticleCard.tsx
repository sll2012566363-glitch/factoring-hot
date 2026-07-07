'use client';

import Link from 'next/link';
import { Article } from '@/types';

interface ArticleCardProps {
  article: Article;
  categoryName?: string;
}

function getScoreColor(score: number): string {
  if (score >= 80) return 'bg-red-50 text-red-600 border-red-200';
  if (score >= 60) return 'bg-orange-50 text-orange-600 border-orange-200';
  if (score >= 40) return 'bg-yellow-50 text-yellow-700 border-yellow-200';
  return 'bg-gray-50 text-gray-500 border-gray-200';
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

  return (
    <article className="group bg-white rounded-lg border border-gray-200 p-4 hover:border-blue-300 hover:shadow-sm transition-all duration-200">
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
          <h3 className="text-sm font-semibold text-gray-900 mb-1.5 line-clamp-2 leading-snug">
            <Link href={`/article/${article.id}`} className="hover:text-blue-600 transition-colors">
              {article.title}
            </Link>
          </h3>
          
          {/* Excerpt */}
          {(article.excerpt || article.content) && (
            <p className="text-xs text-gray-500 line-clamp-2 mb-2 leading-relaxed">
              {article.excerpt || article.content}
            </p>
          )}

          {/* Meta row */}
          <div className="flex items-center gap-2 text-xs flex-wrap">
            {categoryName && (
              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-medium bg-blue-50 text-blue-600">
                {categoryName}
              </span>
            )}
            <span className="text-gray-500">
              {article.source_name}
            </span>
            <span className="text-gray-300">·</span>
            <span className="text-gray-400">
              {formatDate(article.pub_date)}
            </span>
            {article.ai_reason && (
              <>
                <span className="text-gray-300">·</span>
                <span className="text-gray-400 italic line-clamp-1 max-w-[200px]" title={article.ai_reason}>
                  {article.ai_reason}
                </span>
              </>
            )}
            <a
              href={article.link}
              target="_blank"
              rel="noopener noreferrer"
              className="ml-auto text-gray-300 hover:text-blue-500 transition-colors flex-shrink-0"
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
