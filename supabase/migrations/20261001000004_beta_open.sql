-- Beta: everything is open to everyone. Turn off with
--   update private.flags set beta = false;
-- and is_pro() goes back to the subscription.
create schema if not exists private;
create table if not exists private.flags (id boolean primary key default true check (id), beta boolean not null default true);
insert into private.flags (id, beta) values (true, true) on conflict (id) do update set beta = true;

create or replace function public.is_pro(uid uuid default auth.uid())
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((select f.beta from private.flags f limit 1), false) or exists (
    select 1 from public.subscriptions s
    where s.user_id = uid and s.plan = 'pro' and s.status = 'active'
      and (s.renews_at is null or s.renews_at > now())
  );
$$;
