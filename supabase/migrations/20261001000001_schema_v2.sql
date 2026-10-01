-- VeyrArc · schema v2 (Master Changeset task 01).
-- Evolves the existing tables instead of rebuilding them: every current row keeps working.
--   habits.required  → habits.core           (Core = counts for the streak; Extra = everything else)
--   habits.cadence   → habits.days (bitmap)  (bit 0 = Monday … bit 6 = Sunday; 127 = every day)
--   plan_items       + linked_goal_id / linked_habit_id / focus   (Planner events linked to goals, focus blocks)
--   goals            + linked_core_habit_id / arc_id
--   arcs             + oath / theme_hue      (Arc as a first-class object: the promise for 90 days)
--   focus_sessions   + session_type / linked_goal_id / linked_habit_id / linked_event_id
--   profiles         + tour_done / pomodoro / density
--   mood             one value per day in day_entries (goal_entries.mood is copied there and no longer written)
-- Domains already exist as the habits.category enum (body / mind / disc / prod).

-- habits ---------------------------------------------------------------------------
alter table public.habits rename column required to core;
alter table public.habits add column days smallint not null default 127 check (days between 1 and 127);
update public.habits set days = case cadence when 'weekdays' then 31 when 'weekends' then 96 else 127 end;
create index habits_user_core on public.habits (user_id) where core and archived_at is null;

-- Free plan: up to 5 Core habits (Extra is unlimited) and 3 active goals.
create or replace function public.enforce_free_limits()
returns trigger language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  if public.is_pro(new.user_id) then return new; end if;
  if tg_table_name = 'habits' then
    if new.core and new.archived_at is null and (tg_op = 'INSERT' or not old.core or old.archived_at is not null) then
      select count(*) into n from public.habits
       where user_id = new.user_id and core and archived_at is null and id <> new.id;
      if n >= 5 then raise exception 'limit:core' using errcode = 'P0001'; end if;
    end if;
  elsif tg_table_name = 'goals' then
    if tg_op = 'INSERT' then
      select count(*) into n from public.goals where user_id = new.user_id and status = 'active';
      if n >= 3 then raise exception 'limit:goals' using errcode = 'P0001'; end if;
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists habits_free_limit on public.habits;
create trigger habits_free_limit before insert or update of core, archived_at on public.habits
  for each row execute function public.enforce_free_limits();

-- arcs -----------------------------------------------------------------------------
alter table public.arcs add column oath text check (char_length(oath) <= 280);
alter table public.arcs add column theme_hue text check (theme_hue ~ '^#[0-9A-Fa-f]{6}$');

-- goals ----------------------------------------------------------------------------
alter table public.goals add column linked_core_habit_id uuid references public.habits (id) on delete set null;
alter table public.goals add column arc_id uuid references public.arcs (id) on delete set null;
update public.goals g set arc_id = a.id from public.arcs a where a.user_id = g.user_id and a.ended_on is null and g.arc_id is null;

-- planner events -------------------------------------------------------------------
alter table public.plan_items add column linked_goal_id uuid references public.goals (id) on delete set null;
alter table public.plan_items add column linked_habit_id uuid references public.habits (id) on delete set null;
alter table public.plan_items add column focus boolean not null default false;

-- focus sessions -------------------------------------------------------------------
alter table public.focus_sessions add column session_type text not null default 'focus' check (session_type in ('focus', 'short', 'long'));
alter table public.focus_sessions add column linked_goal_id uuid references public.goals (id) on delete set null;
alter table public.focus_sessions add column linked_habit_id uuid references public.habits (id) on delete set null;
alter table public.focus_sessions add column linked_event_id uuid references public.plan_items (id) on delete set null;

-- links must point at the user's own rows
create or replace function public.check_links_owner()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare j jsonb := to_jsonb(new);
begin
  if j ? 'linked_goal_id' and j->>'linked_goal_id' is not null
     and not exists (select 1 from public.goals where id = (j->>'linked_goal_id')::uuid and user_id = new.user_id) then
    raise exception 'goal does not belong to user';
  end if;
  if j ? 'linked_habit_id' and j->>'linked_habit_id' is not null
     and not exists (select 1 from public.habits where id = (j->>'linked_habit_id')::uuid and user_id = new.user_id) then
    raise exception 'habit does not belong to user';
  end if;
  if j ? 'linked_core_habit_id' and j->>'linked_core_habit_id' is not null
     and not exists (select 1 from public.habits where id = (j->>'linked_core_habit_id')::uuid and user_id = new.user_id) then
    raise exception 'habit does not belong to user';
  end if;
  if j ? 'linked_event_id' and j->>'linked_event_id' is not null
     and not exists (select 1 from public.plan_items where id = (j->>'linked_event_id')::uuid and user_id = new.user_id) then
    raise exception 'event does not belong to user';
  end if;
  return new;
end;
$$;
create trigger plan_items_links     before insert or update on public.plan_items     for each row execute function public.check_links_owner();
create trigger goals_links          before insert or update on public.goals          for each row execute function public.check_links_owner();
create trigger focus_sessions_links before insert or update on public.focus_sessions for each row execute function public.check_links_owner();

-- profiles -------------------------------------------------------------------------
alter table public.profiles add column tour_done jsonb not null default '{}'::jsonb;
alter table public.profiles add column pomodoro jsonb;
alter table public.profiles add column density text not null default 'comfortable' check (density in ('comfortable', 'compact'));

-- day note (Evening Review: one line about the day)
alter table public.day_entries add column note text check (char_length(note) <= 500);

-- one mood per day: keep the goals' moods where the day has none yet
insert into public.day_entries (user_id, day, mood)
select distinct on (user_id, day) user_id, day, mood from public.goal_entries where mood is not null order by user_id, day
on conflict (user_id, day) do update set mood = coalesce(public.day_entries.mood, excluded.mood);
