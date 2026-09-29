-- VeyrArc · Free/Pro limits, streak freezes, arc rollover (stage 5)

-- Free: up to 5 active habits and 3 active goals (config.ts limits). Enforced here so
-- the client cannot go around it; Pro has no limit.
create or replace function public.enforce_free_limits()
returns trigger language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  if public.is_pro(new.user_id) then return new; end if;
  if tg_table_name = 'habits' then
    select count(*) into n from public.habits where user_id = new.user_id and archived_at is null;
    if n >= 5 then raise exception 'limit:habits' using errcode = 'P0001'; end if;
  elsif tg_table_name = 'goals' then
    select count(*) into n from public.goals where user_id = new.user_id and status = 'active';
    if n >= 3 then raise exception 'limit:goals' using errcode = 'P0001'; end if;
  end if;
  return new;
end;
$$;
create trigger habits_free_limit before insert on public.habits for each row execute function public.enforce_free_limits();
create trigger goals_free_limit  before insert on public.goals  for each row execute function public.enforce_free_limits();

-- Streak freeze for a past day: 1 per week on Free, 2 on Pro (Monday-based weeks).
create or replace function public.use_freeze(p_day date)
returns boolean language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); used int; allowed int;
begin
  if uid is null then raise exception 'not signed in'; end if;
  if p_day >= current_date or p_day < current_date - 7 then return false; end if;
  allowed := case when public.is_pro(uid) then 2 else 1 end;
  select count(*) into used from public.day_entries
   where user_id = uid and frozen and date_trunc('week', day) = date_trunc('week', p_day::timestamp);
  if used >= allowed then return false; end if;
  insert into public.day_entries (user_id, day, frozen) values (uid, p_day, true)
  on conflict (user_id, day) do update set frozen = true;
  return true;
end;
$$;
revoke all on function public.use_freeze(date) from public, anon;
grant execute on function public.use_freeze(date) to authenticated;

-- «Начать новую Arc» and the automatic rollover after 90 days; keeps the summary for the archive.
drop function if exists public.start_new_arc();
create or replace function public.start_new_arc(p_summary jsonb default null, p_auto boolean default false)
returns public.arcs language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); nxt int; a public.arcs; cur public.arcs;
begin
  if uid is null then raise exception 'not signed in'; end if;
  select * into cur from public.arcs where user_id = uid and ended_on is null;
  if p_auto and (cur.id is null or cur.started_on + cur.length_days > current_date) then return cur; end if;
  update public.arcs
     set ended_on = case when p_auto then started_on + length_days - 1 else current_date end,
         summary = coalesce(p_summary, summary)
   where user_id = uid and ended_on is null;
  select coalesce(max(number), 0) + 1 into nxt from public.arcs where user_id = uid;
  insert into public.arcs (user_id, number, started_on)
  values (uid, nxt, case when p_auto and cur.id is not null then cur.started_on + cur.length_days else current_date end)
  returning * into a;
  return a;
end;
$$;
revoke all on function public.start_new_arc(jsonb, boolean) from public, anon;
grant execute on function public.start_new_arc(jsonb, boolean) to authenticated;
