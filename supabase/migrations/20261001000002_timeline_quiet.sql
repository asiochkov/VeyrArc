-- VeyrArc · Master Changeset tasks 26 and 32
-- 26: system_events — the user's own activity feed (Analytics «Активность», sidebar inbox).
--     Filled by triggers, read-only for the client.
-- 32: quiet hours for push notifications (profiles.quiet_from / quiet_to, local time).

create table if not exists public.system_events (
  id       bigint generated always as identity primary key,
  user_id  uuid not null references auth.users (id) on delete cascade,
  at       timestamptz not null default now(),
  domain   text not null,              -- habit | focus | planner | goal | mood | freeze | quit | arc
  action   text not null,
  meta     jsonb not null default '{}'::jsonb
);
create index if not exists system_events_user_at on public.system_events (user_id, at desc);
alter table public.system_events enable row level security;
drop policy if exists "own events: read" on public.system_events;
create policy "own events: read" on public.system_events for select using (user_id = (select auth.uid()));

create or replace function private.log_event(p_user uuid, p_domain text, p_action text, p_meta jsonb)
returns void language sql security definer set search_path = '' as $$
  insert into public.system_events (user_id, domain, action, meta) values (p_user, p_domain, p_action, coalesce(p_meta, '{}'::jsonb));
$$;

create or replace function private.on_activity()
returns trigger language plpgsql security definer set search_path = '' as $$
declare nm text;
begin
  if tg_table_name = 'habit_logs' then
    if new.done and (tg_op = 'INSERT' or not coalesce(old.done, false)) then
      select name into nm from public.habits where id = new.habit_id;
      perform private.log_event(new.user_id, 'habit', 'done', jsonb_build_object('habit_id', new.habit_id, 'name', nm, 'day', new.day));
    end if;
  elsif tg_table_name = 'habits' then
    if tg_op = 'INSERT' then
      perform private.log_event(new.user_id, 'habit', 'created', jsonb_build_object('habit_id', new.id, 'name', new.name, 'core', new.core));
    elsif old.archived_at is null and new.archived_at is not null then
      perform private.log_event(new.user_id, 'habit', 'archived', jsonb_build_object('habit_id', new.id, 'name', new.name));
    elsif old.core is distinct from new.core then
      perform private.log_event(new.user_id, 'habit', case when new.core then 'to_core' else 'to_extra' end, jsonb_build_object('habit_id', new.id, 'name', new.name));
    end if;
  elsif tg_table_name = 'plan_items' then
    if new.done and (tg_op = 'INSERT' or not old.done) then
      perform private.log_event(new.user_id, 'planner', 'done', jsonb_build_object('id', new.id, 'title', new.title, 'day', new.day));
    end if;
  elsif tg_table_name = 'goals' then
    if tg_op = 'INSERT' then
      perform private.log_event(new.user_id, 'goal', 'created', jsonb_build_object('goal_id', new.id, 'title', new.title));
    elsif old.status <> 'completed' and new.status = 'completed' then
      perform private.log_event(new.user_id, 'goal', 'completed', jsonb_build_object('goal_id', new.id, 'title', new.title));
    end if;
  elsif tg_table_name = 'focus_sessions' then
    if new.completed then
      perform private.log_event(new.user_id, 'focus', 'session', jsonb_build_object('minutes', new.minutes));
    end if;
  elsif tg_table_name = 'day_entries' then
    if new.mood is not null and (tg_op = 'INSERT' or old.mood is distinct from new.mood) then
      perform private.log_event(new.user_id, 'mood', 'set', jsonb_build_object('level', new.mood, 'day', new.day));
    end if;
    if new.frozen and (tg_op = 'INSERT' or not old.frozen) then
      perform private.log_event(new.user_id, 'freeze', 'used', jsonb_build_object('day', new.day));
    end if;
  elsif tg_table_name = 'quit_relapses' then
    select name into nm from public.quits where id = new.quit_id;
    perform private.log_event(new.user_id, 'quit', 'relapse', jsonb_build_object('quit_id', new.quit_id, 'name', nm));
  elsif tg_table_name = 'arcs' then
    perform private.log_event(new.user_id, 'arc', 'started', jsonb_build_object('number', new.number));
  end if;
  return new;
end;
$$;

do $$
declare t text;
begin
  foreach t in array array['habit_logs', 'habits', 'plan_items', 'goals', 'focus_sessions', 'day_entries', 'quit_relapses'] loop
    execute format('drop trigger if exists activity on public.%I', t);
    execute format('create trigger activity after insert or update on public.%I for each row execute function private.on_activity()', t);
  end loop;
  drop trigger if exists activity on public.arcs;
  create trigger activity after insert on public.arcs for each row execute function private.on_activity();
end $$;

-- 32: quiet hours (both null = off)
alter table public.profiles add column if not exists quiet_from time;
alter table public.profiles add column if not exists quiet_to time;
