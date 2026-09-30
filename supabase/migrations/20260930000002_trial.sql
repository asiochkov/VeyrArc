-- VeyrArc · 7-day Pro trial without a card (UX audit 4.5 / 5.6); one per account
alter table public.subscriptions add column trial_used_at timestamptz;

create or replace function public.start_trial()
returns public.subscriptions language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); s public.subscriptions;
begin
  if uid is null then raise exception 'not signed in'; end if;
  select * into s from public.subscriptions where user_id = uid;
  if s.trial_used_at is not null then raise exception 'trial:used' using errcode = 'P0001'; end if;
  if public.is_pro(uid) then return s; end if;
  update public.subscriptions
     set plan = 'pro', status = 'active', period = null, renews_at = now() + interval '7 days', trial_used_at = now(), updated_at = now()
   where user_id = uid
  returning * into s;
  return s;
end;
$$;
revoke all on function public.start_trial() from public, anon;
grant execute on function public.start_trial() to authenticated;
