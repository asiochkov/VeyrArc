-- VeyrArc · 2/3 · daily tracking: habits, quits, day entries, freezes, focus

-- Habits (Today list, Tracker → Привычки; composer fields = A5) -------------
create table public.habits (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name        text not null check (char_length(name) between 1 and 80),
  icon        text not null default 'doc',
  hue         text not null default '#5B9BD5' check (hue ~ '^#[0-9A-Fa-f]{6}$'),
  type        text not null default 'binary' check (type in ('binary', 'counter', 'duration')),
  target      numeric check (target > 0),            -- counter: 8 (стаканов)
  unit        text check (char_length(unit) <= 20),  -- counter: «стаканов»
  minutes     int check (minutes > 0),               -- duration: 20
  cadence     text not null default 'daily' check (cadence in ('daily', 'weekdays', 'weekends')),
  category    public.category not null default 'body',
  required    boolean not null default false,        -- «в стрике»
  sort        int not null default 0,
  archived_at timestamptz,
  created_at  timestamptz not null default now()
);
create index habits_user on public.habits (user_id) where archived_at is null;

-- One row per habit per day. value: 1 for binary, count or minutes otherwise.
create table public.habit_logs (
  habit_id  uuid not null references public.habits (id) on delete cascade,
  user_id   uuid not null default auth.uid() references auth.users (id) on delete cascade,
  day       date not null,
  value     numeric not null default 1 check (value >= 0),
  done      boolean not null default true,
  primary key (habit_id, day)
);
create index habit_logs_user_day on public.habit_logs (user_id, day);

-- Quits (Tracker → Отказы; relapse counter and record = A6) ----------------
create table public.quits (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name         text not null check (char_length(name) between 1 and 80),
  icon         text not null default 'ban',
  hue          text not null default '#D96A5B' check (hue ~ '^#[0-9A-Fa-f]{6}$'),
  unit         text check (char_length(unit) <= 20), -- «сигарет», null → «срывов»
  per_day      numeric not null default 1 check (per_day >= 0),
  clean_since  timestamptz not null default now(),   -- timer start, reset on relapse
  best_days    int not null default 0,
  goal_days    int check (goal_days in (3, 7, 14, 30, 90)),
  archived_at  timestamptz,
  created_at   timestamptz not null default now()
);

create table public.quit_relapses (
  id       uuid primary key default gen_random_uuid(),
  quit_id  uuid not null references public.quits (id) on delete cascade,
  user_id  uuid not null default auth.uid() references auth.users (id) on delete cascade,
  at       timestamptz not null default now()
);
create index quit_relapses_quit on public.quit_relapses (quit_id);

-- Relapse: record the slip, keep the best clean run, restart the timer.
create or replace function public.log_relapse(p_quit uuid)
returns public.quits language plpgsql security invoker set search_path = '' as $$
declare q public.quits;
begin
  update public.quits
     set best_days = greatest(best_days, (extract(epoch from now() - clean_since) / 86400)::int),
         clean_since = now()
   where id = p_quit and user_id = auth.uid()
  returning * into q;
  if q.id is null then raise exception 'quit not found'; end if;
  insert into public.quit_relapses (quit_id) values (p_quit);
  return q;
end;
$$;

-- Day-level data: mood, water, freeze (Today) --------------------------------
create table public.day_entries (
  user_id  uuid not null default auth.uid() references auth.users (id) on delete cascade,
  day      date not null,
  mood     smallint check (mood between 1 and 5),
  water    smallint not null default 0 check (water between 0 and 40), -- glasses
  frozen   boolean not null default false,  -- streak freeze used (limits: stage 5)
  primary key (user_id, day)
);

-- Pomodoro sessions (Today → Фокус; «Тело 1ч20 · Разум 40м») -------------------
create table public.focus_sessions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  started_at  timestamptz not null default now(),
  minutes     int not null check (minutes between 1 and 240),
  category    public.category,
  completed   boolean not null default true
);
create index focus_sessions_user on public.focus_sessions (user_id, started_at);

-- RLS: owner-only, all operations --------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['habits', 'habit_logs', 'quits', 'quit_relapses', 'day_entries', 'focus_sessions'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format(
      'create policy "own rows" on public.%I for all using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))', t);
  end loop;
end $$;

-- a log / relapse may only point at the user's own habit / quit
create or replace function public.check_habit_owner()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if not exists (select 1 from public.habits where id = new.habit_id and user_id = new.user_id) then
    raise exception 'habit does not belong to user';
  end if;
  return new;
end;
$$;
create or replace function public.check_quit_owner()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if not exists (select 1 from public.quits where id = new.quit_id and user_id = new.user_id) then
    raise exception 'quit does not belong to user';
  end if;
  return new;
end;
$$;
create trigger habit_logs_owner before insert or update on public.habit_logs for each row execute function public.check_habit_owner();
create trigger quit_relapses_owner before insert or update on public.quit_relapses for each row execute function public.check_quit_owner();
