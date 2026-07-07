'use client';

import Header from '@/components/Header';
import CategoryFilter from '@/components/CategoryFilter';
import ArticleCard from '@/components/ArticleCard';
import { useState, useEffect, useMemo } from 'react';
import type { Category } from '@/types';

const sections: Category[] = [
  { id: 'frontier',       name: '前沿解读',     icon: '🔍', description: '评分最高的深度分析文章' },
  { id: 'industry_model', name: '行业前沿模式', icon: '🏭', description: '市场趋势与创新实践' },
  { id: 'regulatory',     name: '前沿监管新闻', icon: '', description: '央行、金融监管总局等政策动态' },
  { id: 'dispute',        name: '前沿争议解决', icon: '⚖️', description: '风险预警与争议解决案例' },
  { id: 'normative',      name: '前沿规范文件', icon: '📄', description: '高分监管规范与政策文件' },
];

const SECTION_NAMES: Record<string, string> = {
  frontier: '前沿解读',
  industry_model: '行业前沿模式',
  regulatory: '前沿监管新闻',
  dispute: '前沿争议解决',
  normative: '前沿规范文件',
};

export default function AllArticles() {
  const [selectedSection, setSelectedSection] = useState<string | null>(null);
  const [articles, setArticles] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);

  const PAGE_SIZE = 50;

  useEffect(() => {
    const fetchArticles = async (reset = false) => {
      setLoading(true);
      try {
        const offset = reset ? 0 : (page - 1) * PAGE_SIZE;
        const params = new URLSearchParams({
          limit: String(PAGE_SIZE),
          offset: String(offset),
        });
        if (selectedSection) params.set('category', selectedSection);

        const res = await fetch(`/api/articles?${params}`);
        if (res.ok) {
          const data = await res.json();
          const newArticles = data.articles || [];
          setArticles(reset ? newArticles : [...articles, ...newArticles]);
          setHasMore(newArticles.length === PAGE_SIZE);
        }
      } catch (err) {
        console.error('Failed to fetch articles:', err);
      }
      setLoading(false);
    };
    fetchArticles(true);
    setPage(1);
  }, [selectedSection]);

  const loadMore = () => {
    setPage(p => p + 1);
  };

  useEffect(() => {
    if (page > 1 && !loading) {
      const fetchMore = async () => {
        setLoading(true);
        try {
          const offset = (page - 1) * PAGE_SIZE;
          const params = new URLSearchParams({
            limit: String(PAGE_SIZE),
            offset: String(offset),
          });
          if (selectedSection) params.set('category', selectedSection);

          const res = await fetch(`/api/articles?${params}`);
          if (res.ok) {
            const data = await res.json();
            const newArticles = data.articles || [];
            setArticles(prev => [...prev, ...newArticles]);
            setHasMore(newArticles.length === PAGE_SIZE);
          }
        } catch (err) {
          console.error('Failed to fetch more articles:', err);
        }
        setLoading(false);
      };
      fetchMore();
    }
  }, [page]);

  const filteredArticles = useMemo(() => {
    if (!searchQuery.trim()) return articles;
    const q = searchQuery.trim().toLowerCase();
    return articles.filter(a =>
      a.title?.toLowerCase().includes(q) ||
      a.excerpt?.toLowerCase().includes(q) ||
      a.source_name?.toLowerCase().includes(q)
    );
  }, [articles, searchQuery]);

  return (
    <div className="min-h-screen bg-gray-50">
      <Header />

      <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">
            全部文章
          </h1>
          <p className="text-sm text-gray-600">
            查看所有采集到的保理与供应链金融相关资讯
          </p>
        </div>

        {/* Search */}
        <div className="relative mb-4">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            placeholder="搜索文章标题、内容、来源..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>

        <CategoryFilter
          categories={sections}
          selectedCategory={selectedSection}
          onSelectCategory={setSelectedSection}
        />

        {/* Articles list */}
        <div className="mt-6 space-y-3">
          {filteredArticles.map(article => (
            <ArticleCard
              key={article.id}
              article={article}
              categoryName={SECTION_NAMES[article.category]}
            />
          ))}
        </div>

        {/* Loading / Load more */}
        {loading && articles.length === 0 && (
          <div className="text-center py-12 text-gray-500">加载中...</div>
        )}

        {hasMore && !loading && articles.length > 0 && (
          <div className="text-center mt-6">
            <button
              onClick={loadMore}
              className="px-6 py-2 bg-white text-gray-700 text-sm border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
            >
              加载更多
            </button>
          </div>
        )}

        {!hasMore && articles.length > 0 && (
          <div className="text-center mt-6 text-xs text-gray-400">
            已显示全部 {articles.length} 篇文章
          </div>
        )}

        {filteredArticles.length === 0 && !loading && (
          <div className="text-center py-12 text-gray-500">
            {searchQuery ? `未找到与"${searchQuery}"相关的文章` : '暂无文章'}
          </div>
        )}
      </main>
    </div>
  );
}
