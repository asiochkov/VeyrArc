import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../lib/auth';
import { isoDay } from '../lib/day';
import { db, hasBackend } from '../lib/supabase';
import { todayStats } from '../mock/today';
import { daysBetween, type ArcRow } from './model';

export async function fetchArc() {
  const r = await db().from('arcs').select('*').is('ended_on', null).maybeSingle();
  if (r.error) throw r.error;
  return r.data as ArcRow | null;
}

/** «День N» of the active arc and the avatar initials, for screen headers. */
export function useHeader() {
  const { session, profile } = useAuth();
  const q = useQuery({ queryKey: ['arc'], queryFn: fetchArc, enabled: hasBackend && !!session });
  if (!hasBackend) return { arcDay: todayStats.arcDay, arcLength: todayStats.arcLength, initials: todayStats.initials };
  const arc = q.data;
  const initials = ((profile?.first_name?.[0] ?? '') + (profile?.last_name?.[0] ?? '')).toUpperCase() || (session?.user.email?.[0] ?? '·').toUpperCase();
  return {
    arcDay: arc ? Math.min(arc.length_days, daysBetween(arc.started_on, isoDay()) + 1) : 1,
    arcLength: arc?.length_days ?? 90,
    initials,
  };
}
