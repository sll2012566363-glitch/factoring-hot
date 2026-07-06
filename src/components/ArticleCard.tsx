'use client';

import Link from 'next/link';
import { Article } from '@/types';

interface ArticleCardProps {
  article: Article;
  categoryName?: string;
}

export default function ArticleCard({ article, categoryName }: ArticleCardProps) {
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const hours = Math.floor(diff / (1000 * 60 * 60));
    
    if (hours < 1) return '刚刚';
    if (hours < 24) return `${hours}小时前`;
    if (hours < 48) return '昨天';
    return date.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' });
  };

  return (
    <article className="group bg-white rounded-lg border border-gray-200 p-5 hover:border-blue-300 hover:shadow-md transition-all duration-200">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-2">
            {categoryName && (
              <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-50 text-blue-700">
                {categoryName}
              </span>
            )}
            <span className="text-xs text-gray-500">
              {article.source_name}
            </span>
            <span className="text-xs text-gray-400">·</span>
            <span className="text-xs text-gray-500">
              {formatDate(article.pub_date)}
            </span>
          </div>
          
          <h3 className="text-base font-semibold text-gray-900 mb-2 line-clamp-2">
            <Link href={`/article/${article.id}`} className="hover:text-blue-600 transition-colors">
              {article.title}
            </Link>
          </h3>
          
          {(article.excerpt || article.content) && (
            <p className="text-sm text-gray-600 line-clamp-2 mb-3">
              {article.excerpt || article.content}
            </p>
          )}

          {article.ai_reason && (
            <p className="text-xs text-gray-400 italic mb-2 line-clamp-1">
              AI: {article.ai_reason}
            </p>
          )}

          <div className="flex items-center gap-3 text-xs text-gray-500">
            {article.score != null && (
              <span className="inline-flex items-center px-2 py-0.5 rounded bg-yellow-50 text-yellow-700 font-medium">
                {Math.round(article.score)} 分
              </span>
            )}
            {article.scoring_method && (
              <span className="text-gray-400">
                {article.scoring_method === 'llm' ? 'AI评分' : '规则评分'}
              </span>
            )}
            <a
              href={article.link}
              target="_blank"
              rel="noopener noreferrer"
              className="ml-auto text-gray-400 hover:text-blue-500 transition-colors"
              title="查看原文"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
            </a>
          </div>
        </div>
      </div>
    </article>
  );
}
