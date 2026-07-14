'use client';

import { Article } from '@/types';
import ArticleCard from './ArticleCard';

interface DateGroupProps {
  dateLabel: string;
  articles: Article[];
  categoryMap: Record<string, string>;
}

export default function DateGroup({ dateLabel, articles, categoryMap }: DateGroupProps) {
  return (
    <div className="relative pl-6 pb-2">
      {/* Timeline line */}
      <div className="absolute left-[7px] top-3 bottom-0 w-px bg-gray-200" />
      {/* Timeline dot */}
      <div className="absolute left-0 top-2.5 w-[15px] h-[15px] rounded-full bg-white dark:bg-gray-900 border-[3px] border-blue-500 z-10" />

      {/* Date header */}
      <div className="flex items-center gap-2 mb-4">
        <h2 className="text-base font-bold text-gray-800 dark:text-gray-200">{dateLabel}</h2>
        <span className="text-xs text-gray-400 bg-gray-100 dark:bg-gray-800 px-2 py-0.5 rounded-full">
          {articles.length} 篇
        </span>
      </div>

      {/* Articles */}
      <div className="space-y-3">
        {articles.map((article) => (
          <ArticleCard
            key={article.id}
            article={article}
            categoryName={categoryMap[article.category]}
          />
        ))}
      </div>
    </div>
  );
}
