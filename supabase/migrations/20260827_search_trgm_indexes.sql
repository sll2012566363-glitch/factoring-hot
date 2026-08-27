-- 2026-08-27: pg_trgm GIN indexes to accelerate ilike '%q%' searches
-- on articles. Previously the public items API and admin article search
-- ran sequential scans over title/excerpt/content for every query.
-- gin_trgm_ops lets Postgres serve substring-ILIKE predicates from an index.
-- The extension is available on all Supabase plans. Index builds are fast
-- at the current table size; re-run with CONCURRENTLY via the SQL editor
-- if the table grows large.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS articles_title_trgm_idx
  ON public.articles USING gin (title gin_trgm_ops);

CREATE INDEX IF NOT EXISTS articles_excerpt_trgm_idx
  ON public.articles USING gin (excerpt gin_trgm_ops);

CREATE INDEX IF NOT EXISTS articles_content_trgm_idx
  ON public.articles USING gin (content gin_trgm_ops);
