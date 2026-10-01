-- VeyrArc · Master Changeset task 38: cross-device sync through Supabase realtime.
-- Realtime respects RLS, so each user only receives changes to their own rows.
do $$
declare t text;
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    raise notice 'no supabase_realtime publication (local stand-in) — skipped';
    return;
  end if;
  foreach t in array array['habits', 'habit_logs', 'day_entries', 'focus_sessions', 'plan_items', 'goals', 'goal_tasks', 'goal_entries', 'quits', 'quit_relapses', 'arcs'] loop
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
