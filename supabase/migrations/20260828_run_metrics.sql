-- 2026-08-28: per-stage metrics for pipeline health monitoring.
-- pre-filter pass-rate regressions (97/297 -> 4/297) previously went
-- unnoticed because metrics only lived in console logs.

alter table public.pipeline_runs
  add column if not exists metrics jsonb,
  add column if not exists step_results jsonb;
