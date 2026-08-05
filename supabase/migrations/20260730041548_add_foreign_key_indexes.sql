create index if not exists idx_articles_source_id
  on public.articles (source_id);

create index if not exists idx_topic_clusters_primary_article_id
  on public.topic_clusters (primary_article_id);
