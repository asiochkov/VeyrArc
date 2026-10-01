import { isoDay } from '../lib/day';
import { addDays, daysBetween, indexLogs, isLogged, scheduled } from '../data/model';
import type { SystemRaw } from './system';

/*
 * Insights (Master Changeset section 17 «JARVIS principle»): plain rules over the user's own data,
 * no model. Each insight names a fact and, where it makes sense, one action.
 *  1 focus ↔ mood   2 missed Core ↔ mood   3 a habit untouched for 3+ days
 *  4 overplanning   5 a new best focus day 6 arc checkpoints (30 / 60 days)
 */
export type Insight = {
  id: string;
  kind: 'correlation' | 'habit' | 'plan' | 'record' | 'checkpoint';
  text: { key: string; vars?: Record<string, string | number> };
  action?: { key: string; to: string };
};

const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

export function computeInsights(r: SystemRaw, today = isoDay()): Insight[] {
  const out: Insight[] = [];
  const ix = indexLogs(r.logs);
  const from = addDays(today, -13);
  const moodOf = (d: string) => r.days.find((x) => x.day === d)?.mood ?? null;
  const focusDays = new Set(r.focus.filter((f) => f.completed && (f.session_type ?? 'focus') === 'focus').map((f) => isoDay(new Date(f.started_at))));
  const habits = r.habits.filter((h) => !h.archived_at);

  // 1. focus ↔ mood over 14 days
  const withF: number[] = [], without: number[] = [];
  for (let d = from; d <= today; d = addDays(d, 1)) { const m = moodOf(d); if (m == null) continue; (focusDays.has(d) ? withF : without).push(m); }
  if (withF.length >= 3 && without.length >= 3 && avg(withF) - avg(without) >= 0.5) {
    out.push({ id: 'focus-mood', kind: 'correlation', text: { key: 'insights.focusMood', vars: { n: Math.round(((avg(withF) - avg(without)) / Math.max(1, avg(without))) * 100) } } });
  }
  // 2. missed Core ↔ mood
  const core = habits.filter((h) => h.core);
  if (core.length) {
    const badDays: number[] = [];
    for (let d = from; d < today; d = addDays(d, 1)) {
      const missed = core.filter((h) => h.created_at.slice(0, 10) <= d && scheduled(h, d) && !isLogged(ix, h.id, d)).length;
      const m = moodOf(d);
      if (missed >= 2 && m != null) badDays.push(m);
    }
    if (badDays.length >= 3 && badDays.filter((m) => m <= 2).length / badDays.length >= 0.6) out.push({ id: 'core-mood', kind: 'correlation', text: { key: 'insights.coreMood' } });
  }
  // 3. a habit untouched for 3+ scheduled days
  for (const h of habits) {
    if (daysBetween(h.created_at.slice(0, 10), today) < 3) continue;
    let misses = 0;
    for (let i = 1; i <= 3; i++) { const d = addDays(today, -i); if (scheduled(h, d) && !isLogged(ix, h.id, d)) misses++; }
    if (misses === 3) {
      out.push({
        id: 'miss-' + h.id, kind: 'habit',
        text: { key: h.core ? 'insights.missCore' : 'insights.missExtra', vars: { x: h.name } },
        action: { key: h.core ? 'insights.actionToExtra' : 'insights.actionOpen', to: `/disciplines?open=${h.id}` },
      });
    }
  }
  // 4. overplanning
  const week = r.plan.filter((p) => p.day >= addDays(today, -6) && p.day <= today);
  if (week.length / 7 > 8) out.push({ id: 'overplan', kind: 'plan', text: { key: 'insights.overplan', vars: { n: Math.round(week.length / 7) } }, action: { key: 'insights.actionPlanner', to: '/planner' } });
  // 5. a new best focus day today
  const byDay = new Map<string, number>();
  for (const f of r.focus) if (f.completed) { const d = isoDay(new Date(f.started_at)); byDay.set(d, (byDay.get(d) ?? 0) + f.minutes); }
  const todayMin = byDay.get(today) ?? 0;
  const prevBest = Math.max(0, ...[...byDay.entries()].filter(([d]) => d !== today).map(([, m]) => m));
  if (todayMin > 0 && todayMin > prevBest && prevBest > 0) out.push({ id: 'best-focus', kind: 'record', text: { key: 'insights.bestFocus', vars: { m: todayMin } } });
  // 6. arc checkpoint
  const arc = r.arcs.find((a) => !a.ended_on);
  if (arc) {
    const day = daysBetween(arc.started_on, today) + 1;
    const cp = [30, 60].find((c) => day >= c && day < c + 3);
    if (cp) out.push({ id: 'cp-' + cp, kind: 'checkpoint', text: { key: 'insights.checkpoint', vars: { n: arc.number, d: cp } }, action: { key: 'insights.actionArc', to: '/analytics' } });
  }
  return out;
}
