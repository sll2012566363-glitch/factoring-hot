'use client';

import Link from 'next/link';
import Header from '@/components/Header';
import CategoryFilter from '@/components/CategoryFilter';
import DateGroup from '@/components/DateGroup';
import { useState, useMemo } from 'react';
import { Article } from '@/types';

const sections = [
  { id: 'frontier',       name: '前沿解读',     icon: '🔍', description: '评分最高的深度分析文章' },
  { id: 'industry_model', name: '行业前沿模式', icon: '🏭', description: '市场趋势与创新实践' },
  { id: 'regulatory',     name: '前沿监管新闻', icon: '📋', description: '央行、金融监管总局等政策动态' },
  { id: 'dispute',        name: '前沿争议解决', icon: '⚖️', description: '风险预警与争议解决案例' },
  { id: 'normative',      name: '前沿规范文件', icon: '📄', description: '高分监管规范与政策文件' },
];

const dateOptions = [
  { value: 'all',  label: '全部时间' },
  { value: '7d',   label: '近7天' },
  { value: '30d',  label: '近30天' },
  { value: '90d',  label: '近3个月' },
];

const SECTION_NAMES: Record<string, string> = {
  frontier: '前沿解读',
  industry_model: '行业前沿模式',
  regulatory: '前沿监管新闻',
  dispute: '前沿争议解决',
  normative: '前沿规范文件',
};

const BEIJING_TIME_ZONE = 'Asia/Shanghai';

function beijingDateParts(dateStr: string) {
  const parts = new Intl.DateTimeFormat('zh-CN', {
    timeZone: BEIJING_TIME_ZONE,
    year: 'numeric', month: 'numeric', day: 'numeric', weekday: 'short',
  }).formatToParts(new Date(dateStr));
  const value = (type: string) => parts.find(part => part.type === type)?.value || '';
  return { year: value('year'), month: value('month'), day: value('day'), weekday: value('weekday') };
}

function beijingDateKey(dateStr: string) {
  const date = beijingDateParts(dateStr);
  return `${date.year}-${date.month.padStart(2, '0')}-${date.day.padStart(2, '0')}`;
}

/** 生成日期标签，格式如：今天7月6日 周日 / 昨天7月5日 周六 / 7月4日 周四 */
function formatDateLabel(dateStr: string): string {
  const date = beijingDateParts(dateStr);
  const todayKey = beijingDateKey(new Date().toISOString());
  const targetKey = beijingDateKey(dateStr);
  const diffDays = Math.round((Date.parse(`${todayKey}T00:00:00+08:00`) - Date.parse(`${targetKey}T00:00:00+08:00`)) / 86400000);
  const monthDay = `${date.month}月${date.day}日`;
  const weekday = date.weekday;

  if (diffDays === 0) return `今天 ${monthDay} ${weekday}`;
  if (diffDays === 1) return `昨天 ${monthDay} ${weekday}`;
  if (diffDays === 2) return `前天 ${monthDay} ${weekday}`;
  return `${monthDay} ${weekday}`;
}

/** 按日期分组文章 */
function groupByDate(articles: Article[]): { label: string; articles: Article[] }[] {
  const groups = new Map<string, Article[]>();
  for (const article of articles) {
    const dateKey = beijingDateKey(article.pub_date);
    if (!groups.has(dateKey)) groups.set(dateKey, []);
    groups.get(dateKey)!.push(article);
  }
  const sorted = Array.from(groups.entries()).sort((a, b) => b[0].localeCompare(a[0]));
  return sorted.map(([dateKey, items]) => ({
    label: formatDateLabel(dateKey),
    articles: items.sort((a, b) => (b.score || 0) - (a.score || 0)),
  }));
}

export default function HomeClient({ initialArticles }: { initialArticles: Article[] }) {
  const [selectedSection, setSelectedSection] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [dateRange, setDateRange] = useState('all');
  const articles = initialArticles;

  const dateFrom = useMemo(() => {
    if (dateRange === 'all') return null;
    const now = new Date();
    const days = dateRange === '7d' ? 7 : dateRange === '30d' ? 30 : 90;
    now.setDate(now.getDate() - days);
    return now.toISOString();
  }, [dateRange]);

  const filteredArticles = useMemo(() => {
    let result = articles;
    if (selectedSection) result = result.filter(a => a.category === selectedSection);
    if (dateFrom) result = result.filter(a => a.pub_date >= dateFrom);
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      result = result.filter(a =>
        a.title?.toLowerCase().includes(q) ||
        a.excerpt?.toLowerCase().includes(q) ||
        a.source_name?.toLowerCase().includes(q)
      );
    }
    return result;
  }, [selectedSection, articles, searchQuery, dateFrom]);

  const dateGroups = useMemo(() => groupByDate(filteredArticles), [filteredArticles]);

  // Today's top 3 by score, independent of active filters
  const todayTop3 = useMemo(() => {
    const todayKey = beijingDateKey(new Date().toISOString());
    return articles
      .filter(a => beijingDateKey(a.pub_date) === todayKey)
      .sort((a, b) => (b.score || 0) - (a.score || 0))
      .slice(0, 3);
  }, [articles]);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      <Header />

      <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-2">
            保理与供应链金融热榜
          </h1>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            基于 48 个权威信源，AI 实时评分，五大板块聚焦行业前沿
          </p>
        </div>

        {/* Today's Top 3 */}
        {todayTop3.length > 0 && (
          <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800 p-4 mb-4">
            <h2 className="text-sm font-bold text-gray-800 dark:text-gray-200 mb-3 flex items-center gap-1.5">
              <span>🔥</span> 今日头条
            </h2>
            <div className="space-y-2.5">
              {todayTop3.map((article, i) => (
                <Link key={article.id} href={`/article/${article.id}`} className="flex items-start gap-3 group">
                  <span
                    className={`flex-shrink-0 w-5 h-5 mt-0.5 rounded text-[11px] font-bold flex items-center justify-center ${
                      i === 0 ? 'bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400' : i === 1 ? 'bg-orange-50 dark:bg-orange-950/40 text-orange-600 dark:text-orange-400' : 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400'
                    }`}
                  >
                    {i + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-gray-900 dark:text-gray-100 group-hover:text-blue-600 dark:hover:text-blue-400 transition-colors line-clamp-1">
                      {article.title}
                    </p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {article.source_name}
                      {article.score != null ? ` · ${Math.round(article.score)} 分` : ''}
                    </p>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* Search + Date Filter Bar */}
        <div className="flex flex-col sm:flex-row gap-3 mb-4">
          <div className="relative flex-1">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              placeholder="搜索文章标题、内容、来源..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 text-sm border border-gray-200 dark:border-gray-800 rounded-lg bg-white dark:bg-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 dark:text-gray-600">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>
          <div className="flex gap-1 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg p-1">
            {dateOptions.map(opt => (
              <button key={opt.value} onClick={() => setDateRange(opt.value)}
                className={`px-3 py-1.5 text-xs rounded-md transition-colors whitespace-nowrap ${
                  dateRange === opt.value ? 'bg-blue-500 text-white' : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
                }`}>
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        <CategoryFilter
          categories={sections}
          selectedCategory={selectedSection}
          onSelectCategory={setSelectedSection}
        />

        {/* Timeline grouped view */}
        <div className="mt-6">
          {filteredArticles.length === 0 ? (
            <div className="text-center py-12 text-gray-500 dark:text-gray-400">
              {searchQuery ? `未找到与"${searchQuery}"相关的文章` : '暂无文章'}
            </div>
          ) : (
            <div className="space-y-6">
              {dateGroups.map(group => (
                <DateGroup
                  key={group.label}
                  dateLabel={group.label}
                  articles={group.articles}
                  categoryMap={SECTION_NAMES}
                />
              ))}
            </div>
          )}
        </div>

        <div className="mt-8 text-center text-xs text-gray-400">
          {filteredArticles.length !== articles.length
            ? `显示 ${filteredArticles.length} / ${articles.length} 篇`
            : `共收录 ${articles.length} 篇文章`}
          {' · '}数据来源：48个权威信源
        </div>
      </main>
    </div>
  );
}
