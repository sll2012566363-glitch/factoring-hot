export interface Source {
  id: string;
  name: string;
  url: string;
  type: string;
  category: string;
  priority: string;
  weight: number;
  rss: string | null;
  selector: string | null;
  active: boolean;
}

export interface Article {
  id: string;
  title: string;
  link: string;
  content: string;
  excerpt?: string;
  ai_reason?: string;
  pub_date: string;
  source_id: string;
  source_name: string;
  category: string;
  priority: string;
  weight: number;
  score?: number;
  score_dimensions?: Record<string, number>;
  scored_at?: string;
  scoring_method?: 'rule' | 'llm';
  event_id?: string;
  event_title?: string;
  status?: 'pending' | 'selected' | 'rejected';
  is_selected?: boolean;
  created_at?: string;
}

export interface Category {
  id: string;
  name: string;
  icon: string;
  description: string;
}

export interface ClusterResult {
  id: string;
  event_title: string;
  summary: string;
  article_ids: string[];
  article_count: number;
  category: string;
  first_seen_at: string;
  last_seen_at: string;
  created_at: string;
}

export interface DailyReport {
  id: string;
  report_date: string;
  report_title: string;
  sections: ReportSection[];
  total_articles: number;
  executive_summary: string;
  generated_at: string;
}

export interface ReportSection {
  id: string;
  name: string;
  articles: Article[];
  maxItems?: number;
}

export interface ScoringConfig {
  dimensions: DimensionConfig[];
  priorityWeights: Record<string, number>;
  thresholds: {
    minScore: number;
    minDimensionScore: number;
    maxArticlesPerDay: number;
    duplicateSimilarity: number;
    eventClusterThreshold: number;
    boostRecentHours: number;
  };
}

export interface DimensionConfig {
  name: string;
  label: string;
  description: string;
  weight: number;
  keywords: string[];
}

export interface DimensionScore {
  name: string;
  score: number;
}
