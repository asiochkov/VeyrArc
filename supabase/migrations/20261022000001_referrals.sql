-- VeyrArc · invite a friend: a personal link; when the friend makes their first check-in,
-- both get one bonus streak freeze. Everything is written by the server (security definer):
-- the client can only read its own rows and call my_referral() / claim_referral().

create table if not exists public.referral_codes (
  user_id uuid primary key references auth.users (id) on delete cascade,
  code    text not null unique
);
create table if not exists public.referrals (
  referred    uuid primary key references auth.users (id) on delete cascade,   -- a person is invited once
  referrer    uuid not null references auth.users (id) on delete cascade,
  created_at  timestamptz not null default now(),
  rewarded_at timestamptz
);
create index if not exists referrals_referrer on public.referrals (referrer);
create table if not exists public.referral_bonus (
  user_id uuid primary key references auth.users (id) on delete cascade,
  freezes int not null default 0 check (freezes >= 0)
);

alter table public.referral_codes enable row level security;
alter table public.referrals      enable row level security;
alter table public.referral_bonus enable row level security;
drop policy if exists referral_codes_own on public.referral_codes;
drop policy if exists referrals_own on public.referrals;
drop policy if exists referral_bonus_own on public.referral_bonus;
create policy referral_codes_own on public.referral_codes for select to authenticated using (user_id = auth.uid());
create policy referrals_own      on public.referrals      for select to authenticated using (referrer = auth.uid() or referred = auth.uid());
create policy referral_bonus_own on public.referral_bonus for select to authenticated using (user_id = auth.uid());
revoke insert, update, delete on public.referral_codes, public.referrals, public.referral_bonus from anon, authenticated;

-- limits: a person can earn at most 10 rewards for invites, and hold at most 5 bonus freezes
create or replace function public.my_referral()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); c text;
begin
  if uid is null then raise exception 'not signed in'; end if;
  select code into c from public.referral_codes where user_id = uid;
  if c is null then
    loop
      c := substr(md5(random()::text || clock_timestamp()::text), 1, 8);
      begin
        insert into public.referral_codes (user_id, code) values (uid, c);
        exit;
      exception when unique_violation then
        select code into c from public.referral_codes where user_id = uid;
        exit when c is not null;   -- another call created it meanwhile; otherwise the code collided: try again
      end;
    end loop;
  end if;
  return jsonb_build_object(
    'code', c,
    'invited',  (select count(*) from public.referrals where referrer = uid),
    'rewarded', (select count(*) from public.referrals where referrer = uid and rewarded_at is not null),
    'bonus',    coalesce((select freezes from public.referral_bonus where user_id = uid), 0));
end;
$$;

-- a new person arrives with a code: remember who invited them (only recent accounts, never oneself)
create or replace function public.claim_referral(p_code text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); inviter uuid; born timestamptz;
begin
  if uid is null then raise exception 'not signed in'; end if;
  select user_id into inviter from public.referral_codes where code = lower(trim(p_code));
  if inviter is null or inviter = uid then return false; end if;
  select created_at into born from auth.users where id = uid;
  if born < now() - interval '7 days' then return false; end if;
  insert into public.referrals (referred, referrer) values (uid, inviter) on conflict (referred) do nothing;
  return found;
end;
$$;

-- the friend's first check-in rewards both
create or replace function public.referral_reward()
returns trigger language plpgsql security definer set search_path = '' as $$
declare r public.referrals;
begin
  if not new.done then return new; end if;
  select * into r from public.referrals where referred = new.user_id and rewarded_at is null for update;
  if r.referred is null then return new; end if;
  if (select count(*) from public.referrals where referrer = r.referrer and rewarded_at is not null) >= 10 then
    update public.referrals set rewarded_at = now() where referred = r.referred;   -- over the cap: closed without a reward for the inviter
    insert into public.referral_bonus (user_id, freezes) values (new.user_id, 1)
      on conflict (user_id) do update set freezes = least(5, public.referral_bonus.freezes + 1);
    return new;
  end if;
  update public.referrals set rewarded_at = now() where referred = r.referred;
  insert into public.referral_bonus (user_id, freezes) values (r.referrer, 1), (new.user_id, 1)
    on conflict (user_id) do update set freezes = least(5, public.referral_bonus.freezes + 1);
  return new;
end;
$$;
drop trigger if exists habit_logs_referral on public.habit_logs;
create trigger habit_logs_referral after insert or update of done on public.habit_logs
  for each row when (new.done) execute function public.referral_reward();

-- a bonus freeze is spent once the week's own freezes are used up
create or replace function public.use_freeze(p_day date)
returns boolean language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); used int; allowed int;
begin
  if uid is null then raise exception 'not signed in'; end if;
  if p_day >= current_date or p_day < current_date - 7 then return false; end if;
  allowed := case when public.is_pro(uid) then 2 else 1 end;
  select count(*) into used from public.day_entries
   where user_id = uid and frozen and date_trunc('week', day) = date_trunc('week', p_day::timestamp);
  if used >= allowed then
    update public.referral_bonus set freezes = freezes - 1 where user_id = uid and freezes > 0;
    if not found then return false; end if;
  end if;
  insert into public.day_entries (user_id, day, frozen) values (uid, p_day, true)
  on conflict (user_id, day) do update set frozen = true;
  return true;
end;
$$;

revoke all on function public.my_referral() from public, anon;
revoke all on function public.claim_referral(text) from public, anon;
revoke all on function public.referral_reward() from public, anon, authenticated;
grant execute on function public.my_referral() to authenticated;
grant execute on function public.claim_referral(text) to authenticated;
