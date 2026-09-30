-- VeyrArc · relapse note and 5-minute undo (UX audit 3.4 / 5.9)
alter table public.quit_relapses
  add column note text check (char_length(note) <= 500),
  add column prev_clean_since timestamptz,
  add column prev_best int;

drop function if exists public.log_relapse(uuid);
create or replace function public.log_relapse(p_quit uuid, p_note text default null)
returns public.quit_relapses language plpgsql security invoker set search_path = '' as $$
declare q public.quits; r public.quit_relapses;
begin
  select * into q from public.quits where id = p_quit and user_id = auth.uid();
  if q.id is null then raise exception 'quit not found'; end if;
  update public.quits
     set best_days = greatest(best_days, (extract(epoch from now() - clean_since) / 86400)::int),
         clean_since = now()
   where id = p_quit;
  insert into public.quit_relapses (quit_id, note, prev_clean_since, prev_best)
  values (p_quit, nullif(trim(p_note), ''), q.clean_since, q.best_days)
  returning * into r;
  return r;
end;
$$;

-- Undo within 5 minutes: the timer and the record come back, the slip disappears.
create or replace function public.undo_relapse(p_relapse uuid)
returns boolean language plpgsql security invoker set search_path = '' as $$
declare r public.quit_relapses;
begin
  select * into r from public.quit_relapses where id = p_relapse and user_id = auth.uid() and at > now() - interval '5 minutes';
  if r.id is null or r.prev_clean_since is null then return false; end if;
  update public.quits set clean_since = r.prev_clean_since, best_days = r.prev_best where id = r.quit_id;
  delete from public.quit_relapses where id = r.id;
  return true;
end;
$$;
