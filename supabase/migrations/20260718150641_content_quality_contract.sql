alter table public.articles
  add column if not exists content_quality text check (content_quality in ('full', 'summary', 'external')),
  add column if not exists content_word_count integer,
  add column if not exists content_checked_at timestamptz;

create index if not exists idx_articles_content_quality
  on public.articles (content_quality, pub_date desc);

comment on column public.articles.content_quality is 'full=站内完整正文，summary=仅摘要，external=仅原文线索';
