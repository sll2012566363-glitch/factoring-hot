-- ========================================
-- Factoring HOT Database Schema (Complete)
-- ========================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ========================================
-- Table 1: Sources (信源)
-- ========================================
CREATE TABLE IF NOT EXISTS sources (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  url TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('government', 'association', 'media', 'thinktank', 'exchange')),
  category TEXT NOT NULL,
  priority TEXT NOT NULL CHECK (priority IN ('T1', 'T1.5', 'T2')),
  weight DECIMAL(3,2) NOT NULL DEFAULT 1.0,
  rss TEXT,
  selector TEXT,
  active BOOLEAN DEFAULT TRUE,
  last_fetched_at TIMESTAMPTZ,
  last_fetch_status TEXT CHECK (last_fetch_status IN ('success', 'error')),
  last_fetch_error TEXT,
  last_fetch_article_count INTEGER NOT NULL DEFAULT 0,
  last_fetch_new_article_count INTEGER NOT NULL DEFAULT 0,
  consecutive_failures INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_sources_category ON sources(category);
CREATE INDEX idx_sources_priority ON sources(priority);
CREATE INDEX idx_sources_active ON sources(active);

COMMENT ON TABLE sources IS '信源管理表';
COMMENT ON COLUMN sources.type IS '类型：government=政府, association=协会, media=媒体, thinktank=智库, exchange=交易所';
COMMENT ON COLUMN sources.category IS '分类：policy, market, risk, innovation';
COMMENT ON COLUMN sources.priority IS '优先级：T1=核心信源, T1.5=重要信源, T2=一般信源';
COMMENT ON COLUMN sources.weight IS '权重：0.5-1.5，影响评分';
COMMENT ON COLUMN sources.last_fetch_status IS '最近一次抓取结果：success/error';

-- ========================================
-- Table 2: Articles (文章)
-- ========================================
CREATE TABLE IF NOT EXISTS articles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title TEXT NOT NULL,
  link TEXT NOT NULL UNIQUE,
  content TEXT,
  excerpt TEXT,
  content_quality TEXT CHECK (content_quality IN ('full', 'summary', 'external')),
  content_word_count INTEGER,
  content_checked_at TIMESTAMPTZ,
  pub_date TIMESTAMPTZ NOT NULL,
  source_id TEXT NOT NULL REFERENCES sources(id),
  source_name TEXT NOT NULL,
  category TEXT NOT NULL,
  priority TEXT NOT NULL,
  weight DECIMAL(3,2) NOT NULL DEFAULT 1.0,
  
  -- Scoring
  score DECIMAL(5,2),
  score_dimensions JSONB,
  scored_at TIMESTAMPTZ,
  scoring_method TEXT CHECK (scoring_method IN ('rule', 'llm')),
  
  -- Pipeline status
  pre_filtered BOOLEAN,
  ai_reason TEXT,
  
  -- Event clustering
  event_id TEXT,
  event_title TEXT,
  
  -- Status
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'selected', 'rejected')),
  is_selected BOOLEAN DEFAULT FALSE,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_articles_pub_date ON articles(pub_date DESC);
CREATE INDEX idx_articles_category ON articles(category);
CREATE INDEX idx_articles_score ON articles(score DESC);
CREATE INDEX idx_articles_source_id ON articles(source_id);
CREATE INDEX idx_articles_event_id ON articles(event_id);
CREATE INDEX idx_articles_status ON articles(status);
CREATE INDEX idx_articles_selected ON articles(is_selected);
CREATE INDEX idx_articles_content_quality ON articles(content_quality, pub_date DESC);

COMMENT ON TABLE articles IS '文章表';
COMMENT ON COLUMN articles.score IS '综合评分（0-100）';
COMMENT ON COLUMN articles.score_dimensions IS '五维度评分：{frontier: 0-20, industry_model: 0-20, regulatory: 0-20, dispute: 0-20, normative: 0-20}';
COMMENT ON COLUMN articles.scoring_method IS '评分方法：rule=规则引擎, llm=LLM评分';
COMMENT ON COLUMN articles.status IS '状态：pending=待筛选, selected=已入选, rejected=已拒绝';

-- ========================================
-- Table 3: Events (事件聚类)
-- ========================================
CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY,
  event_title TEXT NOT NULL,
  summary TEXT,
  category TEXT NOT NULL,
  article_ids UUID[] NOT NULL,
  article_count INTEGER NOT NULL DEFAULT 0,
  importance_score DECIMAL(5,2),
  first_seen_at TIMESTAMPTZ NOT NULL,
  last_seen_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_events_category ON events(category);
CREATE INDEX idx_events_importance ON events(importance_score DESC);
CREATE INDEX idx_events_first_seen ON events(first_seen_at DESC);

COMMENT ON TABLE events IS '事件聚类表';
COMMENT ON COLUMN events.article_count IS '该事件包含的文章数量';
COMMENT ON COLUMN events.importance_score IS '事件重要性评分（基于文章评分和数量）';

-- ========================================
-- Table 3b: Topic Clusters (话题聚类 - bigram Jaccard)
-- ========================================
CREATE TABLE IF NOT EXISTS topic_clusters (
  id TEXT PRIMARY KEY,
  primary_article_id UUID REFERENCES articles(id),
  primary_title TEXT NOT NULL,
  primary_excerpt TEXT,
  primary_score DECIMAL(5,2),
  primary_link TEXT NOT NULL,
  primary_source TEXT,
  primary_category TEXT,
  related_article_ids UUID[],
  related_count INTEGER NOT NULL DEFAULT 0,
  source_count INTEGER NOT NULL DEFAULT 1,
  unique_sources TEXT[],
  max_score DECIMAL(5,2),
  avg_score DECIMAL(5,2),
  cluster_date DATE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_topic_clusters_date ON topic_clusters(cluster_date DESC);
CREATE INDEX idx_topic_clusters_score ON topic_clusters(max_score DESC);
CREATE INDEX idx_topic_clusters_source_count ON topic_clusters(source_count DESC);

COMMENT ON TABLE topic_clusters IS '话题聚类表（bigram Jaccard相似度聚类）';
COMMENT ON COLUMN topic_clusters.primary_article_id IS '聚类中评分最高的文章ID';
COMMENT ON COLUMN topic_clusters.related_article_ids IS '聚类中其他相关文章ID列表';
COMMENT ON COLUMN topic_clusters.source_count IS '覆盖的不同信源数量';
COMMENT ON COLUMN topic_clusters.cluster_date IS '聚类生成日期';

-- ========================================
-- Table 4: Daily Reports (日报)
-- ========================================
CREATE TABLE IF NOT EXISTS daily_reports (
  id TEXT PRIMARY KEY,
  report_date DATE NOT NULL UNIQUE,
  report_title TEXT NOT NULL,
  
  -- Report structure
  executive_summary TEXT,
  sections JSONB NOT NULL,
  total_articles INTEGER NOT NULL DEFAULT 0,
  
  -- Metadata
  top_sources TEXT[],
  category_distribution JSONB,
  generated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_daily_reports_date ON daily_reports(report_date DESC);

COMMENT ON TABLE daily_reports IS '日报表';
COMMENT ON COLUMN daily_reports.sections IS '板块结构：[{id, name, articles: []}]';
COMMENT ON COLUMN daily_reports.category_distribution IS '分类分布：{policy: 10, market: 15, risk: 8, innovation: 5}';
COMMENT ON COLUMN daily_reports.top_sources IS 'TOP信源列表';

-- ========================================
-- Table 5: Weekly Reports (周报)
-- ========================================
CREATE TABLE IF NOT EXISTS weekly_reports (
  id TEXT PRIMARY KEY,
  year INTEGER NOT NULL,
  week_number INTEGER NOT NULL,
  report_title TEXT NOT NULL,
  report_date_range JSONB NOT NULL,
  
  -- Five sections (matching user's monthly structure)
  section_frontier_interpretation JSONB,
  section_industry_model JSONB,
  section_regulatory_news JSONB,
  section_dispute_resolution JSONB,
  section_normative_documents JSONB,
  
  -- Summary
  executive_summary TEXT,
  key_insights TEXT[],
  trend_analysis JSONB,
  
  total_articles INTEGER NOT NULL DEFAULT 0,
  generated_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(year, week_number)
);

CREATE INDEX idx_weekly_reports_date ON weekly_reports(year DESC, week_number DESC);

COMMENT ON TABLE weekly_reports IS '周报表';
COMMENT ON COLUMN weekly_reports.section_frontier_interpretation IS '第一部分：前沿解读';
COMMENT ON COLUMN weekly_reports.section_industry_model IS '第二部分：行业前沿模式';
COMMENT ON COLUMN weekly_reports.section_regulatory_news IS '第三部分：前沿监管新闻';
COMMENT ON COLUMN weekly_reports.section_dispute_resolution IS '第四部分：前沿争议解决';
COMMENT ON COLUMN weekly_reports.section_normative_documents IS '第五部分：前沿规范文件';

-- ========================================
-- Table 6: Monthly Reports (月刊)
-- ========================================
CREATE TABLE IF NOT EXISTS monthly_reports (
  id TEXT PRIMARY KEY,
  year INTEGER NOT NULL,
  month INTEGER NOT NULL,
  report_title TEXT NOT NULL,
  report_date_range JSONB NOT NULL,
  
  -- Five sections (matching user's existing monthly structure)
  section_frontier_interpretation JSONB,
  section_industry_model JSONB,
  section_regulatory_news JSONB,
  section_dispute_resolution JSONB,
  section_normative_documents JSONB,
  
  -- Editorial board
  editorial_board JSONB,
  
  -- Summary & Analysis
  executive_summary TEXT,
  monthly_overview JSONB,
  trend_charts JSONB,
  expert_opinions JSONB,
  
  total_articles INTEGER NOT NULL DEFAULT 0,
  generated_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(year, month)
);

CREATE INDEX idx_monthly_reports_date ON monthly_reports(year DESC, month DESC);

COMMENT ON TABLE monthly_reports IS '月报表（按用户现有月刊结构调整）';
COMMENT ON COLUMN monthly_reports.section_frontier_interpretation IS '第一部分：前沿解读';
COMMENT ON COLUMN monthly_reports.section_industry_model IS '第二部分：行业前沿模式';
COMMENT ON COLUMN monthly_reports.section_regulatory_news IS '第三部分：前沿监管新闻';
COMMENT ON COLUMN monthly_reports.section_dispute_resolution IS '第四部分：前沿争议解决';
COMMENT ON COLUMN monthly_reports.section_normative_documents IS '第五部分：前沿规范文件';
COMMENT ON COLUMN monthly_reports.editorial_board IS '编委会名单：{chief_editor, deputy_editors, editorial_members, contact}';

-- ========================================
-- Table 7: Report Archives (归档)
-- ========================================
CREATE TABLE IF NOT EXISTS report_archives (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  report_type TEXT NOT NULL CHECK (report_type IN ('daily', 'weekly', 'monthly')),
  report_id TEXT NOT NULL,
  report_date DATE NOT NULL,
  pdf_url TEXT,
  markdown_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_archives_type_date ON report_archives(report_type, report_date DESC);

COMMENT ON TABLE report_archives IS '报告归档表（存储PDF/Markdown下载链接）';

-- ========================================
-- Triggers for updated_at
-- ========================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE 'plpgsql';

CREATE TRIGGER update_sources_updated_at BEFORE UPDATE ON sources
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_articles_updated_at BEFORE UPDATE ON articles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ========================================
-- Row Level Security (RLS)
-- ========================================
ALTER TABLE sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE articles ENABLE ROW LEVEL SECURITY;
ALTER TABLE events ENABLE ROW LEVEL SECURITY;
ALTER TABLE topic_clusters ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE weekly_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE monthly_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE report_archives ENABLE ROW LEVEL SECURITY;

-- Public read access
CREATE POLICY "Public read access" ON sources FOR SELECT USING (true);
CREATE POLICY "Public read access" ON articles FOR SELECT USING (true);
CREATE POLICY "Public read access" ON events FOR SELECT USING (true);
CREATE POLICY "Public read access" ON topic_clusters FOR SELECT USING (true);
CREATE POLICY "Public read access" ON daily_reports FOR SELECT USING (true);
CREATE POLICY "Public read access" ON weekly_reports FOR SELECT USING (true);
CREATE POLICY "Public read access" ON monthly_reports FOR SELECT USING (true);
CREATE POLICY "Public read access" ON report_archives FOR SELECT USING (true);

-- Service role full access
CREATE POLICY "Service role full access" ON sources FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role full access" ON articles FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role full access" ON events FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role full access" ON topic_clusters FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role full access" ON daily_reports FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role full access" ON weekly_reports FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role full access" ON monthly_reports FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role full access" ON report_archives FOR ALL USING (auth.role() = 'service_role');

-- ========================================
-- Initial Data: Insert Sources
-- ========================================
-- (This will be handled by the init-sources.ts script)
