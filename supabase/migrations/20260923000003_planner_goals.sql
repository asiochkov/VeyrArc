-- VeyrArc · 3/3 · planner (Calendar) and goals

-- Planner categories. user_id null = the 4 built-in ones from the design
-- (Встреча / Работа / Дедлайн / Ревью); user rows are allowed if B8 says so.
create table public.plan_categories (
  id       uuid primary key default gen_random_uuid(),
  user_id  uuid references auth.users (id) on delete cascade,
  key      text,                       -- built-ins: meeting / work / deadline / review
  name     text check (char_length(name) <= 40),
  hue      text not null check (hue ~ '^#[0-9A-Fa-f]{6}$'),
  sort     int not null default 0,
  unique (user_id, key)
);
insert into public.plan_categories (key, hue, sort) values
  ('meeting',  '#5B9BD5', 0),
  ('work',     '#5FBF9B', 1),
  ('deadline', '#D96A5B', 2),
  ('review',   '#9B87D6', 3);

-- Calendar tasks / events. starts_at null = untimed («Днём», B3).
create table public.plan_items (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title        text not null check (char_length(title) between 1 and 120),
  category_id  uuid references public.plan_categories (id) on delete set null,
  day          date not null,
  starts_at    time,
  ends_at      time,
  note         text check (char_length(note) <= 2000),
  done         boolean not null default false,
  created_at   timestamptz not null default now(),
  check (ends_at is null or starts_at is null or ends_at > starts_at)
);
create index plan_items_user_day on public.plan_items (user_id, day);

-- Goals (Цели) ------------------------------------------------------------------
create table public.goals (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title        text not null check (char_length(title) between 1 and 80),
  hue          text not null default '#E8A54B' check (hue ~ '^#[0-9A-Fa-f]{6}$'),
  type         text not null default 'process' check (type in ('process', 'number')),
  deadline     date,
  started_on   date not null default current_date,
  status       text not null default 'active' check (status in ('active', 'completed')),
  completed_at timestamptz,
  best_streak  int not null default 0,
  created_at   timestamptz not null default now()
);

-- Daily tasks of a goal («Пройти урок в приложении»)
create table public.goal_tasks (
  id        uuid primary key default gen_random_uuid(),
  goal_id   uuid not null references public.goals (id) on delete cascade,
  user_id   uuid not null default auth.uid() references auth.users (id) on delete cascade,
  text      text not null check (char_length(text) between 1 and 160),
  detail    text check (char_length(detail) <= 300),
  sort      int not null default 0
);

-- One entry per goal per day: diary + mood; task checks in done_task_ids (B13)
create table public.goal_entries (
  goal_id        uuid not null references public.goals (id) on delete cascade,
  user_id        uuid not null default auth.uid() references auth.users (id) on delete cascade,
  day            date not null,
  done_task_ids  uuid[] not null default '{}',
  diary          text check (char_length(diary) <= 4000),
  mood           smallint check (mood between 1 and 5),
  primary key (goal_id, day)
);

-- RLS --------------------------------------------------------------------------
alter table public.plan_categories enable row level security;
create policy "built-in and own categories: read" on public.plan_categories
  for select using (user_id is null or user_id = (select auth.uid()));
create policy "own categories: write" on public.plan_categories
  for all using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

do $$
declare t text;
begin
  foreach t in array array['plan_items', 'goals', 'goal_tasks', 'goal_entries'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format(
      'create policy "own rows" on public.%I for all using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))', t);
  end loop;
end $$;

-- children must point at the user's own goal
create or replace function public.check_goal_owner()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if not exists (select 1 from public.goals where id = new.goal_id and user_id = new.user_id) then
    raise exception 'goal does not belong to user';
  end if;
  return new;
end;
$$;
create trigger goal_tasks_owner   before insert or update on public.goal_tasks   for each row execute function public.check_goal_owner();
create trigger goal_entries_owner before insert or update on public.goal_entries for each row execute function public.check_goal_owner();
