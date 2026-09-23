-- VeyrArc · 1/3 · core: profiles, subscriptions, arcs, sign-up trigger
-- Every table is per-user. RLS: a user sees and changes only their own rows.
-- Anonymous (guest) users are real auth.users rows (B23), so the same rules
-- apply to them; linking email/Google later keeps the same user id.

create type public.category as enum ('body', 'mind', 'disc', 'prod', 'quit');

-- Settings → Приложение / Уведомления, onboarding answers ----------------
create table public.profiles (
  id              uuid primary key references auth.users (id) on delete cascade,
  first_name      text check (char_length(first_name) <= 60),
  last_name       text check (char_length(last_name) <= 60),
  nickname        text check (char_length(nickname) <= 40),
  lang            text not null default 'ru' check (lang in ('ru', 'en')),
  timezone        text not null default 'Europe/Moscow',
  water_unit      text not null default 'ml' check (water_unit in ('ml', 'oz')),
  directions      public.category[] not null default '{}',   -- onboarding step 1
  reminder_time   time,                                       -- onboarding step 3
  notify_habits   boolean not null default true,              -- Напоминания о привычках
  notify_summary  boolean not null default true,              -- Итог дня
  notify_focus    boolean not null default true,              -- Pomodoro
  notify_arc      boolean not null default true,              -- VeyrArc (начало/конец арки)
  onboarded_at    timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- Pro status. Written only by the server (billing webhook, service role);
-- the client can read its own row but never grant itself Pro.
create table public.subscriptions (
  user_id     uuid primary key references auth.users (id) on delete cascade,
  plan        text not null default 'free' check (plan in ('free', 'pro')),
  period      text check (period in ('monthly', 'yearly')),
  status      text not null default 'active' check (status in ('active', 'canceled', 'expired')),
  renews_at   timestamptz,
  updated_at  timestamptz not null default now()
);

-- 90-day arcs (Today «День 14 из 90», Settings → Архив Arc) ----------------
create table public.arcs (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  number       int  not null check (number > 0),
  started_on   date not null default current_date,
  length_days  int  not null default 90 check (length_days between 1 and 365),
  ended_on     date,                     -- null while active
  summary      jsonb,                    -- frozen stats for the archive / compare (stage 5)
  created_at   timestamptz not null default now(),
  unique (user_id, number)
);
-- at most one active arc per user
create unique index arcs_one_active on public.arcs (user_id) where ended_on is null;

create or replace function public.is_pro(uid uuid default auth.uid())
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.subscriptions s
    where s.user_id = uid and s.plan = 'pro' and s.status = 'active'
      and (s.renews_at is null or s.renews_at > now())
  );
$$;

-- New user (guest or registered): profile, free plan, arc #1 ----------------
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, first_name, last_name, lang)
  values (
    new.id,
    new.raw_user_meta_data ->> 'first_name',
    new.raw_user_meta_data ->> 'last_name',
    coalesce(nullif(new.raw_user_meta_data ->> 'lang', ''), 'ru')
  );
  insert into public.subscriptions (user_id) values (new.id);
  insert into public.arcs (user_id, number) values (new.id, 1);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;
create trigger profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();

-- RLS ------------------------------------------------------------------------
alter table public.profiles      enable row level security;
alter table public.subscriptions enable row level security;
alter table public.arcs          enable row level security;

create policy "own profile: read"   on public.profiles for select using (id = (select auth.uid()));
create policy "own profile: update" on public.profiles for update using (id = (select auth.uid())) with check (id = (select auth.uid()));

create policy "own subscription: read" on public.subscriptions for select using (user_id = (select auth.uid()));

create policy "own arcs: read"   on public.arcs for select using (user_id = (select auth.uid()));
create policy "own arcs: update" on public.arcs for update using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
-- new arcs are started through start_new_arc() (stage 5), not by direct insert
