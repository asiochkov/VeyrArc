import { useAuth } from '../lib/auth';
import { isoDay } from '../lib/day';
import { hasBackend } from '../lib/supabase';
import { todayStats } from '../mock/today';
import { activeArc, useSystem } from '../state/system';
import { daysBetween } from './model';

/** «День N» of the active arc, its oath and the avatar initials, for screen headers. */
export function useHeader() {
  const { session, profile } = useAuth();
  const q = useSystem(activeArc);
  if (!hasBackend) return { arcDay: todayStats.arcDay, arcLength: todayStats.arcLength, arcNumber: 2, oath: '', initials: todayStats.initials };
  const arc = q.data ?? null;
  const initials = ((profile?.first_name?.[0] ?? '') + (profile?.last_name?.[0] ?? '')).toUpperCase() || (session?.user.email?.[0] ?? '·').toUpperCase();
  return {
    arcDay: arc ? Math.min(arc.length_days, daysBetween(arc.started_on, isoDay()) + 1) : 1,
    arcLength: arc?.length_days ?? 90,
    arcNumber: arc?.number ?? 1,
    oath: arc?.oath ?? '',
    initials,
  };
}
