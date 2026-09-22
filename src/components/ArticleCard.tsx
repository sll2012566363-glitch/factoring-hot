'use client';

import Link from 'next/link';
import { ArrowUpRight } from 'lucide-react';
import { Article } from '@/types';
import { formatDateSafe } from '@/lib/date-utils';

export default function ArticleCard({ article, categoryName }: { article: Article; categoryName?: string }) {
  const score = article.score == null ? null : Math.round(article.score);
  // 时间展示：优先显示本站真实收录时间（created_at），避免来源只提供日期、
  // 被存成 UTC 00:00、转北京时间后变成"08:00"的假象。仅当收录时间缺失时
  // 回退到原文发布时间。
  const time = formatDateSafe(article.created_at || article.pub_date).match(/(\d{2}:\d{2})/)?.[1]
    || formatDateSafe(article.created_at || article.pub_date);
  const isSignal = article.review_tier === 'signal' || article.is_selected === false;
  return <article className="feed-item"><time className="feed-item-time" dateTime={article.created_at || article.pub_date}>{time}</time><div className="feed-item-main"><div className="feed-item-meta"><span>{article.source_name}</span><span className="content-proof">全文已收录</span>{isSignal && <span className="review-meta">待复核</span>}{score !== null ? <><span>·</span><span className="feed-item-score">{score}</span></> : <><span>·</span><span>待 AI 评估</span></>}</div><h3><Link href={`/article/${article.id}`}>{article.title}</Link></h3>{(article.excerpt || article.content) && <p className="feed-item-summary">{article.excerpt || article.content}</p>}<div className="feed-item-bottom">{categoryName && <span className="feed-tag">{categoryName}</span>}{isSignal && <span className="feed-tag review-tag">待复核线索</span>}{article.ai_reason && <span className="feed-reason">推荐理由：{article.ai_reason}</span>}<a href={article.link} target="_blank" rel="noopener noreferrer" className="feed-external" title="查看原文"><ArrowUpRight size={15} /></a></div></div></article>;
}
