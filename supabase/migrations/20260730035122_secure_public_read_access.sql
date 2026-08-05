-- Public website data is anonymous read-only. Pipeline writes use service_role.
do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'sources',
    'articles',
    'events',
    'topic_clusters',
    'daily_reports',
    'weekly_reports',
    'monthly_reports',
    'report_archives'
  ]
  loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('drop policy if exists public_all on public.%I', table_name);
    execute format('drop policy if exists public_read on public.%I', table_name);
    execute format('revoke all on table public.%I from public, anon, authenticated', table_name);
    execute format('grant select on table public.%I to anon, authenticated', table_name);
    execute format('grant all on table public.%I to service_role', table_name);
    execute format(
      'create policy public_read on public.%I for select to anon, authenticated using (true)',
      table_name
    );
  end loop;
end
$$;

alter default privileges for role postgres in schema public
  revoke select, insert, update, delete on tables from anon, authenticated;
alter default privileges for role postgres in schema public
  revoke execute on functions from public, anon, authenticated;
