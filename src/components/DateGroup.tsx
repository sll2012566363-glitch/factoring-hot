'use client';

import { Article } from '@/types';
import ArticleCard from './ArticleCard';

export default function DateGroup({ dateLabel, articles, categoryMap }: { dateLabel: string; articles: Article[]; categoryMap: Record<string, string> }) {
  return <section className="date-group"><div className="date-group-header"><h2 className="date-group-title">{dateLabel}</h2><span className="date-group-count">{articles.length} 条情报</span></div>{articles.map(article => <ArticleCard key={article.id} article={article} categoryName={categoryMap[article.category]} />)}</section>;
}
