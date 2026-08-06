'use client';

import { Search, SlidersHorizontal } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import AppShell from '@/components/AppShell';
import ArticleCard from '@/components/ArticleCard';
import type { Article, Category } from '@/types';

const sections: Category[] = [
  { id: 'frontier', name: '前沿解读', icon: '01', description: '评分最高的深度分析文章' },
  { id: 'industry_model', name: '业务与市场', icon: '02', description: '市场趋势与创新实践' },
  { id: 'regulatory', name: '监管政策', icon: '03', description: '政策、监管与合规动态' },
  { id: 'dispute', name: '风险与争议', icon: '04', description: '风险预警与争议解决案例' },
  { id: 'normative', name: '规范文件', icon: '05', description: '规范性文件与制度材料' },
];

function toArticle(item: any): Article {
  return {
    id: item.id,
    title: item.title,
    link: item.url || item.link,
    content: item.content || '',
    excerpt: item.summary || item.excerpt || '',
    pub_date: item.publishedAt || item.pub_date,
    source_id: item.sourceId || item.source_id || '',
    source_name: item.source || item.source_name || '未知来源',
    category: item.category,
    priority: item.priority || 'normal',
    weight: 0,
    score: item.score,
    score_dimensions: item.scoreDimensions || item.score_dimensions,
    ai_reason: item.ai_reason,
    scoring_method: item.scoringMethod || item.scoring_method,
    content_quality: item.contentTier || 'full',
    review_tier: item.reviewTier || (item.selected === false ? 'signal' : 'selected'),
    is_selected: item.selected,
  };
}

export default function AllArticles() {
  const [selectedSection, setSelectedSection] = useState<string | null>(null);
  const [articles, setArticles] = useState<Article[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setLoading(true);
      setError('');
      try {
        const params = new URLSearchParams({ mode: 'all', take: '30' });
        if (selectedSection) params.set('category', selectedSection);
        if (searchQuery.trim()) params.set('q', searchQuery.trim());
        const response = await fetch(`/api/public/items?${params}`, { signal: controller.signal });
        if (!response.ok) throw new Error('资料库暂时无法访问');
        const data = await response.json();
        setArticles((data.items || []).map(toArticle));
        setTotal(data.total || 0);
        setCursor(data.nextCursor || null);
        setHasMore(Boolean(data.hasMore));
      } catch (err: any) {
        if (err?.name !== 'AbortError') setError(err?.message || '加载失败');
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 220);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [selectedSection, searchQuery]);

  const loadMore = async () => {
    if (!cursor || loading) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({ mode: 'all', take: '30', cursor });
      if (selectedSection) params.set('category', selectedSection);
      if (searchQuery.trim()) params.set('q', searchQuery.trim());
      const response = await fetch(`/api/public/items?${params}`);
      if (!response.ok) throw new Error('加载更多失败');
      const data = await response.json();
      setArticles(prev => [...prev, ...(data.items || []).map(toArticle)]);
      setCursor(data.nextCursor || null);
      setHasMore(Boolean(data.hasMore));
    } catch (err: any) {
      setError(err?.message || '加载失败');
    } finally {
      setLoading(false);
    }
  };

  const selectedLabel = useMemo(() => sections.find(item => item.id === selectedSection)?.name || '全部资料', [selectedSection]);

  return (
    <AppShell>
      <header className="page-intro">
        <p className="page-eyebrow">Research library · Live index</p>
        <h1 className="page-title">实时动态</h1>
        <p className="page-description">这是完整的行业资料库。支持标题、摘要和正文关键词检索；只展示已完成正文核验的相关资讯。</p>
      </header>

      <section className="library-status">
        <div><span className="realtime-dot" /><strong>资料库持续更新</strong><span>{total ? `当前可检索 ${total} 篇` : '正在同步最新资料'}</span></div>
        <span className="library-status-label">{selectedLabel}</span>
      </section>

      <section className="library-controls" aria-label="资料库筛选">
        <label className="feed-search library-search"><Search size={15} /><input value={searchQuery} onChange={event => setSearchQuery(event.target.value)} placeholder="搜索标题、摘要、正文或来源…" /></label>
        <div className="library-filter-label"><SlidersHorizontal size={14} /> 分类</div>
        <div className="feed-tabs" role="tablist" aria-label="文章分类">
          <button onClick={() => setSelectedSection(null)} className={`feed-tab ${selectedSection === null ? 'active' : ''}`}>全部</button>
          {sections.map(section => <button key={section.id} onClick={() => setSelectedSection(section.id)} className={`feed-tab ${selectedSection === section.id ? 'active' : ''}`}>{section.name}</button>)}
        </div>
      </section>

      {error && <div className="library-error">{error}</div>}
      <div className="library-results-meta">{searchQuery ? `“${searchQuery}”的检索结果` : '最新收录'} <span>{articles.length}{hasMore ? '+' : ''} 篇</span></div>
      <div className="mt-1">
        {articles.map(article => <ArticleCard key={article.id} article={article} categoryName={sections.find(section => section.id === article.category)?.name} />)}
      </div>
      {loading && <div className="text-center py-10 text-sm text-[var(--muted)]">正在加载资料…</div>}
      {!loading && hasMore && <div className="text-center mt-6"><button onClick={loadMore} className="primary-button">加载更多资料</button></div>}
      {!loading && !hasMore && articles.length > 0 && <div className="text-center mt-7 text-xs text-[var(--muted)]">已显示全部匹配资料</div>}
      {!loading && !articles.length && <div className="library-empty"><strong>暂无匹配资料</strong><span>可以换一个关键词，或清除分类筛选。</span></div>}
    </AppShell>
  );
}
