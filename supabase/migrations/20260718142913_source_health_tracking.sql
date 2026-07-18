-- Per-source health telemetry. `last_fetched_at` already existed; these fields
-- make an empty feed distinguishable from a failed fetch in the operations view.
alter table public.sources
  add column if not exists last_fetch_status text check (last_fetch_status in ('success', 'error')),
  add column if not exists last_fetch_error text,
  add column if not exists last_fetch_article_count integer not null default 0,
  add column if not exists last_fetch_new_article_count integer not null default 0,
  add column if not exists consecutive_failures integer not null default 0;

create index if not exists idx_sources_fetch_health
  on public.sources (active, last_fetch_status, last_fetched_at desc);

comment on column public.sources.last_fetch_status is 'Most recent fetch outcome: success or error';
comment on column public.sources.last_fetch_error is 'Truncated error message from most recent failed fetch';
