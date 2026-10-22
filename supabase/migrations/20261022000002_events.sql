-- VeyrArc · product analytics in our own database (free, no third party): which step people drop at,
-- who comes back on D1/D7/D30, which push brings people in. Clients can only add their own events;
-- reading is for the owner (SQL editor / service role) — see docs/release/ANALYTICS.md.

create table if not exists public.app_events (
  id      bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name    text not null check (char_length(name) between 1 and 40),
  props   jsonb not null default '{}'::jsonb check (pg_column_size(props) < 1024),
  at      timestamptz not null default now()
);
create index if not exists app_events_name_at on public.app_events (name, at);
create index if not exists app_events_user_at on public.app_events (user_id, at);
alter table public.app_events enable row level security;
drop policy if exists app_events_insert on public.app_events;
create policy app_events_insert on public.app_events for insert to authenticated with check (user_id = auth.uid());
revoke select, update, delete on public.app_events from anon, authenticated;
grant insert on public.app_events to authenticated;
