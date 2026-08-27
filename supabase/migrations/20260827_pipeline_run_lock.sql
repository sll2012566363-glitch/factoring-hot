-- 2026-08-27: run lock for /api/cron/run-pipeline.
-- The pipeline steps take 20-30 minutes when run in full; GitHub Actions
-- already guards its own schedule with a concurrency group, but the HTTP
-- cron endpoint could be triggered twice in parallel (Vercel cron +
-- manual call). This table records in-flight runs so the endpoint can
-- refuse to start while another run is still active.
-- Stale rows (crashed instances never update finished_at) are ignored
-- after LOCK_STALE_AFTER_MINUTES (see route code, currently 6 minutes).

create table if not exists public.pipeline_runs (
  id bigint generated always as identity primary key,
  status text not null check (status in ('running', 'finished', 'failed')),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  trigger text
);

create index if not exists idx_pipeline_runs_active
  on public.pipeline_runs (status, started_at desc);
