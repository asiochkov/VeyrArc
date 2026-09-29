-- VeyrArc · «Начать новую Arc» (Settings): closes the active arc and opens the next one.
create or replace function public.start_new_arc()
returns public.arcs language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); nxt int; a public.arcs;
begin
  if uid is null then raise exception 'not signed in'; end if;
  update public.arcs set ended_on = current_date where user_id = uid and ended_on is null;
  select coalesce(max(number), 0) + 1 into nxt from public.arcs where user_id = uid;
  insert into public.arcs (user_id, number) values (uid, nxt) returning * into a;
  return a;
end;
$$;
revoke all on function public.start_new_arc() from public, anon;
grant execute on function public.start_new_arc() to authenticated;
