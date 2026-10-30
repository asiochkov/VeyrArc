-- Prepared for an isolated database first. Existing production migration history must be
-- reconciled before this file is applied. Existing user records are preserved.

-- VeyrArc is free. Preserve old records, remove limits and disable commercial APIs.
drop trigger if exists habits_free_limit on public.habits;
drop trigger if exists goals_free_limit on public.goals;
drop trigger if exists habit_logs_referral on public.habit_logs;
create or replace function public.is_pro(uid uuid default auth.uid())
returns boolean language sql stable security invoker set search_path = '' as $$ select true; $$;
revoke execute on function public.is_pro(uuid) from public, anon, authenticated;
revoke execute on function public.enforce_free_limits() from public, anon, authenticated;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
alter function public.touch_updated_at() set search_path = '';

-- New accounts only need their profile and first Arc.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles(id,first_name,last_name,lang) values (
    new.id, new.raw_user_meta_data->>'first_name', new.raw_user_meta_data->>'last_name',
    case when new.raw_user_meta_data->>'lang' = 'en' then 'en' else 'ru' end);
  insert into public.arcs(user_id,number) values (new.id,1);
  return new;
end $$;


do $$
declare f regprocedure;
begin
  for f in select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and (p.proname like 'billing_%' or p.proname in ('start_trial','cancel_auto_renew','my_referral','claim_referral','referral_reward'))
  loop execute format('revoke execute on function %s from public, anon, authenticated, service_role', f); end loop;
  if to_regclass('cron.job') is not null then
    execute 'select cron.unschedule(jobid) from cron.job where jobname = ''billing-renew''';
  end if;
end $$;

-- Same allowance for everyone; no subscription or referral lookup, serialize per account.
create or replace function public.use_freeze(p_day date)
returns boolean language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); used int;
begin
  if uid is null then raise exception 'not signed in'; end if;
  perform pg_advisory_xact_lock(hashtextextended(uid::text, 0));
  if p_day >= current_date or p_day < current_date - 7 then return false; end if;
  if exists (select 1 from public.day_entries where user_id = uid and day = p_day and frozen) then return true; end if;
  select count(*) into used from public.day_entries where user_id = uid and frozen
    and date_trunc('week', day::timestamp) = date_trunc('week', p_day::timestamp);
  if used >= 2 then return false; end if;
  insert into public.day_entries (user_id, day, frozen) values (uid, p_day, true)
    on conflict (user_id, day) do update set frozen = true;
  return true;
end $$;
revoke all on function public.use_freeze(date) from public, anon;
grant execute on function public.use_freeze(date) to authenticated;

-- A receipt and its writes share one transaction. A concurrent retry waits for the first
-- transaction and cannot replay successful operations. All writes still obey the caller's RLS.
create table public.write_receipts (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  id uuid not null,
  created_at timestamptz not null default now(),
  primary key (user_id, id)
);
alter table public.write_receipts enable row level security;
create policy own_receipts on public.write_receipts for select to authenticated using (user_id = (select auth.uid()));
create policy insert_own_receipts on public.write_receipts for insert to authenticated with check (user_id = (select auth.uid()));
grant select, insert on public.write_receipts to authenticated;
revoke update, delete on public.write_receipts from anon, authenticated;

create function public.apply_my_operations(p_id uuid, p_owner uuid, p_ops jsonb)
returns void language plpgsql security invoker set search_path = '' as $$
declare op jsonb; t text; action text; v jsonb; filters jsonb; k text;
  cols text; updates text; conflict_cols text; owner_col text; affected int;
begin
  if p_owner is null or p_owner is distinct from auth.uid() then raise exception 'account changed' using errcode = '42501'; end if;
  if p_id is null or jsonb_typeof(p_ops) is distinct from 'array' or jsonb_array_length(p_ops) > 50000 or pg_column_size(p_ops) > 15000000 then
    raise exception 'invalid operations';
  end if;
  insert into public.write_receipts(user_id, id) values (p_owner, p_id) on conflict do nothing;
  if not found then return; end if;
  for op in select value from jsonb_array_elements(p_ops) loop
    t := op->>'t'; action := op->>'a';
    if t is null or t <> all(array['profiles','habits','habit_logs','day_entries','focus_sessions','plan_items','goals','goal_tasks','goal_entries','quits','quit_relapses','arcs'])
       or action is null or action <> all(array['insert','upsert','update','delete']) then raise exception 'unsupported operation'; end if;
    if t in ('profiles','arcs') and action <> 'update' then raise exception 'unsupported operation'; end if;
    v := coalesce(op->'v', '{}'::jsonb); filters := coalesce(op->'eq', '{}'::jsonb);
    if jsonb_typeof(v) <> 'object' or jsonb_typeof(filters) <> 'object' then raise exception 'invalid operation data'; end if;
    for k in select jsonb_object_keys(v || filters) loop
      if not exists (select 1 from pg_attribute where attrelid = format('public.%I',t)::regclass and attname = k and attnum > 0 and not attisdropped and attgenerated = '' and attidentity = '') then
        raise exception 'unsupported column';
      end if;
    end loop;
    owner_col := case when t = 'profiles' then 'id' else 'user_id' end;
    if action in ('insert','upsert') then
      if v ? 'user_id' and v->>'user_id' is distinct from p_owner::text then raise exception 'invalid owner' using errcode = '42501'; end if;
      v := v || jsonb_build_object('user_id',p_owner);
      select string_agg(format('%I',key),',' order by key) into cols from jsonb_object_keys(v) as x(key);
      conflict_cols := case t when 'habit_logs' then 'habit_id,day' when 'day_entries' then 'user_id,day' when 'goal_entries' then 'goal_id,day' else 'id' end;
      select string_agg(format('%I=excluded.%I',key,key),',' order by key) into updates from jsonb_object_keys(v) as x(key)
        where key <> all(string_to_array(conflict_cols,',')) and key <> 'user_id';
      execute format('insert into public.%I (%s) select %s from jsonb_populate_record(null::public.%I,$1) %s', t, cols, cols, t,
        case when action = 'upsert' and updates is not null then format('on conflict (%s) do update set %s',conflict_cols,updates) else 'on conflict do nothing' end) using v;
    else
      if filters = '{}'::jsonb or v ? 'user_id' or v ? 'id' then raise exception 'invalid update/delete'; end if;
      if action = 'delete' then
        execute format('delete from public.%I as target where %I=$1 and to_jsonb(target.*) @> $2',t,owner_col) using p_owner,filters;
      else
        if v = '{}'::jsonb then raise exception 'empty update'; end if;
        select string_agg(format('%I=r.%I',key,key),',' order by key) into updates from jsonb_object_keys(v) as x(key);
        execute format('update public.%I as target set %s from jsonb_populate_record(null::public.%I,$1) as r where target.%I=$2 and to_jsonb(target.*) @> $3',t,updates,t,owner_col) using v,p_owner,filters;
        get diagnostics affected = row_count;
        if affected = 0 then raise exception 'row not found' using errcode = '42501'; end if;
      end if;
    end if;
  end loop;
end $$;
revoke all on function public.apply_my_operations(uuid,uuid,jsonb) from public, anon;
grant execute on function public.apply_my_operations(uuid,uuid,jsonb) to authenticated;

create function public.import_my_data(p_id uuid, p_rows jsonb, p_owner uuid)
returns void language plpgsql security invoker set search_path = '' as $$
declare t text; ops jsonb := '[]'::jsonb;
begin
  if jsonb_typeof(p_rows) is distinct from 'object' or pg_column_size(p_rows) > 10000000 then raise exception 'invalid import'; end if;
  for t in select jsonb_object_keys(p_rows) loop
    if t <> all(array['habits','habit_logs','quits','quit_relapses','goals','goal_tasks','goal_entries','day_entries','plan_items','focus_sessions']) then raise exception 'unsupported table'; end if;
  end loop;
  foreach t in array array['habits','habit_logs','quits','quit_relapses','goals','goal_tasks','goal_entries','day_entries','plan_items','focus_sessions'] loop
    -- Additive import: an existing entry for the same day is retained.
    ops := ops || coalesce((select jsonb_agg(jsonb_build_object('t',t,'a','insert','v',value))
      from jsonb_array_elements(coalesce(p_rows->t,'[]'::jsonb))), '[]'::jsonb);
  end loop;
  perform public.apply_my_operations(p_id,p_owner,ops);
end $$;
revoke all on function public.import_my_data(uuid,jsonb,uuid) from public, anon;
grant execute on function public.import_my_data(uuid,jsonb,uuid) to authenticated;
