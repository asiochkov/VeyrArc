-- VeyrArc · web push (UX audit 3.6 / 5.7): device subscriptions + a log so each reminder goes out once a day
create table public.push_subscriptions (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  endpoint   text not null unique,
  p256dh     text not null,
  auth       text not null,
  lang       text not null default 'ru' check (lang in ('ru', 'en')),
  created_at timestamptz not null default now()
);
alter table public.push_subscriptions enable row level security;
create policy "own rows" on public.push_subscriptions for all
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- written only by the server (Edge Function with the service role)
create table public.push_log (
  user_id uuid not null references auth.users (id) on delete cascade,
  kind    text not null,
  day     date not null,
  sent_at timestamptz not null default now(),
  primary key (user_id, kind, day)
);
alter table public.push_log enable row level security;

-- last time the user did anything (for the «3 дня тишины» reminder)
alter table public.profiles add column last_seen_at timestamptz;
create or replace function public.touch_last_seen()
returns void language sql security definer set search_path = '' as $$
  update public.profiles set last_seen_at = now() where id = auth.uid();
$$;
revoke all on function public.touch_last_seen() from public, anon;
grant execute on function public.touch_last_seen() to authenticated;
