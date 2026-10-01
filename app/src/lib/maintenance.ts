import type { QueryClient } from '@tanstack/react-query';
import { daysBetween } from '../data/model';
import { arcSummary } from '../state/compute';
import { activeArc, fetchSystem, SYSTEM_KEY } from '../state/system';
import { isoDay } from './day';
import { db } from './supabase';

/*
 * Runs once per session: an arc past its 90 days is closed with its discipline index
 * (the Arc Recap screen shows it once, from Today) and the next one starts.
 * A missed day is no longer frozen automatically — the Today recovery banner asks (RC-9).
 */
export async function runMaintenance(qc: QueryClient) {
  const today = isoDay();
  const sys = await qc.fetchQuery({ queryKey: SYSTEM_KEY, queryFn: fetchSystem });
  const arc = activeArc(sys);
  if (arc && daysBetween(arc.started_on, today) >= arc.length_days) {
    const summary = arcSummary(sys, { ...arc, ended_on: null }, today);
    const r = await db().rpc('start_new_arc', { p_summary: summary, p_auto: true });
    if (!r.error) {
      setPendingRecap(arc.id);
      await qc.invalidateQueries({ queryKey: SYSTEM_KEY });
    }
  }
}

/* The arc that just ended waits here until its Recap has been seen (Master Changeset F14). */
const PENDING = 'veyrarc.pendingRecap';
export function setPendingRecap(id: string | null) {
  try { if (id) localStorage.setItem(PENDING, id); else localStorage.removeItem(PENDING); } catch { /* storage off */ }
  if (id) window.dispatchEvent(new Event('veyrarc:recap'));
}
export function pendingRecap(): string | null {
  try { return localStorage.getItem(PENDING); } catch { return null; }
}
