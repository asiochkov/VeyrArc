import type { QueryClient } from '@tanstack/react-query';
import { fetchArc } from '../data/header';
import { addDays, dayKept, daysBetween, indexLogs } from '../data/model';
import { disciplineIndex, fetchProfile } from '../data/profile';
import { fetchToday } from '../data/today';
import { isoDay } from './day';
import { db } from './supabase';

/*
 * Runs once per session (stage 5):
 *  - an arc past its 90 days is closed with its discipline index and the next one starts;
 *  - a missed yesterday that breaks a running streak uses the week's freeze
 *    (1 on Free, 2 on Pro; the server checks the allowance).
 */
export async function runMaintenance(qc: QueryClient) {
  let changed = false;
  const today = isoDay();

  const arc = await fetchArc();
  if (arc && daysBetween(arc.started_on, today) >= arc.length_days) {
    const raw = await fetchProfile();
    const index = disciplineIndex(raw, arc.started_on, addDays(arc.started_on, arc.length_days - 1));
    const r = await db().rpc('start_new_arc', { p_summary: { index, pct: Math.round(index / 10) }, p_auto: true });
    if (!r.error) changed = true;
  }

  const t = await fetchToday();
  const y = addDays(today, -1);
  const ix = indexLogs(t.logs);
  const frozen = new Set(t.days.filter((d) => d.frozen).map((d) => d.day));
  const existed = t.habits.some((h) => h.created_at.slice(0, 10) <= addDays(y, -1));
  if (existed && !dayKept(t.habits, ix, y, frozen) && dayKept(t.habits, ix, addDays(y, -1), frozen)) {
    const r = await db().rpc('use_freeze', { p_day: y });
    if (!r.error && r.data) changed = true;
  }

  if (changed) await qc.invalidateQueries();
}
