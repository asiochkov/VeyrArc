-- VeyrArc · paid subscription through YooKassa (monthly / yearly, auto-renew with a saved card).
-- Everything that grants Pro runs on the server (edge function «billing», service role):
-- the client can only read its own subscription and payments and switch auto-renew off.

alter table public.subscriptions
  add column if not exists auto_renew boolean not null default false,
  add column if not exists card text,          -- «Visa •• 4242», shown in Settings
  add column if not exists provider text;      -- 'yookassa'

-- the saved payment method never leaves the server
create table if not exists private.billing_methods (
  user_id     uuid primary key references auth.users (id) on delete cascade,
  method_id   text not null,
  updated_at  timestamptz not null default now()
);

create table if not exists public.payments (
  id          text primary key,                 -- YooKassa payment id
  user_id     uuid not null references auth.users (id) on delete cascade,
  amount      numeric(10, 2) not null,
  currency    text not null,
  period      text not null check (period in ('monthly', 'yearly')),
  kind        text not null check (kind in ('initial', 'renew')),
  status      text not null check (status in ('pending', 'waiting_for_capture', 'succeeded', 'canceled', 'refunded')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists payments_user on public.payments (user_id, created_at desc);
alter table public.payments enable row level security;
drop policy if exists payments_own on public.payments;
create policy payments_own on public.payments for select to authenticated using (user_id = auth.uid());
revoke insert, update, delete on public.payments from anon, authenticated;

-- a payment row as YooKassa reports it (pending / canceled); never downgrades a succeeded one
create or replace function public.billing_record(p_id text, p_user uuid, p_period text, p_kind text, p_amount numeric, p_currency text, p_status text)
returns void language sql security definer set search_path = '' as $$
  insert into public.payments (id, user_id, amount, currency, period, kind, status)
  values (p_id, p_user, p_amount, p_currency, p_period, p_kind, p_status)
  on conflict (id) do update set status = excluded.status, updated_at = now()
    where public.payments.status not in ('succeeded', 'refunded');
$$;

-- a succeeded payment: extend Pro by its period (from the later of now and the current end, so a
-- trial or an early renewal is never lost). Idempotent: the same payment applies once.
create or replace function public.billing_apply(p_id text, p_user uuid, p_period text, p_kind text, p_amount numeric, p_currency text, p_method text, p_card text)
returns public.subscriptions language plpgsql security definer set search_path = '' as $$
declare s public.subscriptions; done boolean;
begin
  select status = 'succeeded' into done from public.payments where id = p_id for update;
  if coalesce(done, false) then select * into s from public.subscriptions where user_id = p_user; return s; end if;
  insert into public.payments (id, user_id, amount, currency, period, kind, status)
  values (p_id, p_user, p_amount, p_currency, p_period, p_kind, 'succeeded')
  on conflict (id) do update set status = 'succeeded', updated_at = now();
  insert into public.subscriptions (user_id) values (p_user) on conflict (user_id) do nothing;
  update public.subscriptions
     set plan = 'pro', status = 'active', period = p_period, provider = 'yookassa',
         renews_at = greatest(coalesce(renews_at, now()), now()) + case when p_period = 'yearly' then interval '1 year' else interval '1 month' end,
         auto_renew = case when p_method is not null then true when p_kind = 'renew' then auto_renew else false end,
         card = coalesce(p_card, card),
         updated_at = now()
   where user_id = p_user
  returning * into s;
  if p_method is not null then
    insert into private.billing_methods (user_id, method_id) values (p_user, p_method)
    on conflict (user_id) do update set method_id = excluded.method_id, updated_at = now();
  end if;
  return s;
end;
$$;

-- a refund: the paid period is taken back
create or replace function public.billing_refund(p_payment text)
returns void language plpgsql security definer set search_path = '' as $$
declare uid uuid;
begin
  update public.payments set status = 'refunded', updated_at = now() where id = p_payment returning user_id into uid;
  if uid is null then return; end if;
  update public.subscriptions set status = 'expired', auto_renew = false, updated_at = now() where user_id = uid;
  delete from private.billing_methods where user_id = uid;
end;
$$;

-- subscriptions to charge now: auto-renew on, ending within a day (or ended up to 3 days ago —
-- retries after a declined card), no renewal attempt in the last 20 hours
create or replace function public.billing_due()
returns table (user_id uuid, method_id text, period text, email text, renews_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select s.user_id, m.method_id, s.period, u.email::text, s.renews_at
    from public.subscriptions s
    join private.billing_methods m on m.user_id = s.user_id
    join auth.users u on u.id = s.user_id
   where s.auto_renew and s.plan = 'pro' and s.period is not null
     and s.renews_at < now() + interval '1 day' and s.renews_at > now() - interval '3 days'
     and not exists (select 1 from public.payments p where p.user_id = s.user_id and p.kind = 'renew' and p.created_at > now() - interval '20 hours');
$$;

revoke all on function public.billing_record(text, uuid, text, text, numeric, text, text) from public, anon, authenticated;
revoke all on function public.billing_apply(text, uuid, text, text, numeric, text, text, text) from public, anon, authenticated;
revoke all on function public.billing_refund(text) from public, anon, authenticated;
revoke all on function public.billing_due() from public, anon, authenticated;
grant execute on function public.billing_record(text, uuid, text, text, numeric, text, text) to service_role;
grant execute on function public.billing_apply(text, uuid, text, text, numeric, text, text, text) to service_role;
grant execute on function public.billing_refund(text) to service_role;
grant execute on function public.billing_due() to service_role;

-- the person switches auto-renew off (Pro stays until the paid date); the saved card is forgotten
create or replace function public.cancel_auto_renew()
returns public.subscriptions language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); s public.subscriptions;
begin
  if uid is null then raise exception 'not signed in'; end if;
  update public.subscriptions set auto_renew = false, updated_at = now() where user_id = uid returning * into s;
  delete from private.billing_methods where user_id = uid;
  return s;
end;
$$;
revoke all on function public.cancel_auto_renew() from public, anon;
grant execute on function public.cancel_auto_renew() to authenticated;
