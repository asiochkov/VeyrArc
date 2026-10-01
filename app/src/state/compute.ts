import { isoDay } from '../lib/day';
import {
  addDays, dayKept, daysBetween, hhmm, indexLogs, isLogged, scheduled,
  type DayRow, type FocusRow, type HabitRowDb, type LogRow, type PlanRow,
} from '../data/model';

/* Derived values of the system (Master Changeset RC-1, RC-4, RC-13, task 10). Pure functions. */

type IndexInput = {
  habits: HabitRowDb[]; logs: LogRow[]; days: DayRow[]; focus: FocusRow[];
  goals: { id: string; status: string; started_on: string }[];
  tasks: { id: string; goal_id: string }[];
  entries: { goal_id: string; day: string; done_task_ids: string[] }[];
};

const existed = (h: HabitRowDb, d: string) => h.created_at.slice(0, 10) <= d;
const frozenSet = (days: DayRow[]) => new Set(days.filter((x) => x.frozen).map((x) => x.day));

/** Gini coefficient of non-negative values (0 = even, 1 = all in one bucket). */
function gini(xs: number[]) {
  const n = xs.length, sum = xs.reduce((a, x) => a + x, 0);
  if (!n || !sum) return 1;
  let acc = 0;
  for (const a of xs) for (const b of xs) acc += Math.abs(a - b);
  return acc / (2 * n * n * (sum / n));
}

export const INDEX_WEIGHTS = { discipline: 400, habits: 200, focus: 150, goals: 150, consistency: 100 } as const;
export type IndexParts = Record<keyof typeof INDEX_WEIGHTS, number | null>;

/**
 * Discipline Index 0…1000 over [from, to]:
 *   400·discipline (share of days with every Core habit done; a freeze counts)
 * + 200·habits     (done / planned, Core and Extra)
 * + 150·focus      (min(focus sessions per day, 4) / 4)
 * + 150·goals      (goal daily steps done / planned)
 * + 100·consistency(1 − Gini of activity across weekdays)
 * A part with no data in the period (no goals, say) is left out and the rest re-weighted.
 */
export function computeIndex(r: IndexInput, from: string, to: string): { index: number; parts: IndexParts } {
  const ix = indexLogs(r.logs);
  const frozen = frozenSet(r.days);
  let days = 0, kept = 0, due = 0, hit = 0, sessions = 0, gDue = 0, gDone = 0;
  const byWeekday = [0, 0, 0, 0, 0, 0, 0];
  const focusDays = new Map<string, number>();
  for (const f of r.focus) if (f.completed && (f.session_type ?? 'focus') === 'focus') { const d = isoDay(new Date(f.started_at)); focusDays.set(d, (focusDays.get(d) ?? 0) + 1); }
  const doneByDay = new Map(r.entries.map((e) => [e.goal_id + '|' + e.day, new Set(e.done_task_ids)]));
  for (let d = from; d <= to; d = addDays(d, 1)) {
    const live = r.habits.filter((h) => existed(h, d));
    if (!live.length) continue;
    days++;
    if (dayKept(r.habits, ix, d, frozen)) kept++;
    let n = 0;
    for (const h of live) if (scheduled(h, d)) { due++; if (isLogged(ix, h.id, d)) { hit++; n++; } }
    byWeekday[(new Date(d + 'T12:00:00').getDay() + 6) % 7] += n;
    sessions += focusDays.get(d) ?? 0;
    for (const g of r.goals) {
      if (g.started_on > d || g.status !== 'active') continue;
      const ts = r.tasks.filter((t) => t.goal_id === g.id);
      gDue += ts.length;
      const done = doneByDay.get(g.id + '|' + d);
      if (done) gDone += ts.filter((t) => done.has(t.id)).length;
    }
  }
  const parts: IndexParts = {
    discipline: days ? kept / days : null,
    habits: due ? hit / due : null,
    focus: days ? Math.min(sessions / days, 4) / 4 : null,
    goals: gDue ? gDone / gDue : null,
    consistency: days >= 7 ? 1 - gini(byWeekday) : days ? (hit ? 1 : 0) : null,
  };
  let w = 0, v = 0;
  for (const k of Object.keys(INDEX_WEIGHTS) as (keyof IndexParts)[]) {
    const p = parts[k];
    if (p == null) continue;
    w += INDEX_WEIGHTS[k]; v += INDEX_WEIGHTS[k] * p;
  }
  return { index: w ? Math.round((v / w) * 1000) : 0, parts };
}

/** Today Score 0…100 (the index formula for today alone) and its contribution to the arc's index. */
export function todayScore(r: IndexInput, day: string, arcStart: string | null) {
  const one = computeIndex(r, day, day);
  // for a single day consistency is simply «the day is earned»
  const ix = indexLogs(r.logs);
  const earned = r.habits.some((h) => existed(h, day)) && dayKept(r.habits, ix, day, frozenSet(r.days));
  const parts = { ...one.parts, consistency: one.parts.discipline == null ? null : earned ? 1 : 0 };
  let w = 0, v = 0;
  for (const k of Object.keys(INDEX_WEIGHTS) as (keyof IndexParts)[]) { const p = parts[k]; if (p == null) continue; w += INDEX_WEIGHTS[k]; v += INDEX_WEIGHTS[k] * p; }
  const score = w ? Math.round((v / w) * 100) : 0;
  const start = arcStart && arcStart <= day ? arcStart : day;
  const withToday = computeIndex(r, start, day).index;
  const before = start < day ? computeIndex(r, start, addDays(day, -1)).index : 0;
  return { score, parts, index: withToday, delta: withToday - before };
}

/* ---- day status for the streak (RC-4) ---- */
export type DayStatus = 'earned' | 'frozen' | 'broken' | 'none' | 'open' | 'at-risk' | 'future';
export function dayStatus(r: Pick<IndexInput, 'habits' | 'logs' | 'days'>, day: string, today = isoDay(), hour = new Date().getHours()): DayStatus {
  if (day > today) return 'future';
  const frozen = frozenSet(r.days);
  if (frozen.has(day)) return 'frozen';
  if (!r.habits.some((h) => existed(h, day))) return 'none';
  const ix = indexLogs(r.logs);
  if (dayKept(r.habits, ix, day, frozen)) return 'earned';
  if (day < today) return 'broken';
  return hour >= 20 ? 'at-risk' : 'open';
}

/* ---- time of day (RC-13) ---- */
export type Period = 'dawn' | 'morning' | 'midday' | 'evening' | 'night';
export function periodOf(d = new Date()): Period {
  const h = d.getHours();
  if (h >= 5 && h < 8) return 'dawn';
  if (h >= 8 && h < 12) return 'morning';
  if (h >= 12 && h < 17) return 'midday';
  if (h >= 17 && h < 22) return 'evening';
  return 'night';
}

/* ---- Now Card: the one next action (section 4, from exact to rough) ---- */
export type NowAction =
  | { kind: 'oath'; oath: string }
  | { kind: 'event'; event: PlanRow; inMin: number }
  | { kind: 'habit'; habit: HabitRowDb; core: boolean }
  | { kind: 'review' }
  | { kind: 'tomorrow'; event: PlanRow }
  | { kind: 'closed' };

export function nowAction(r: { habits: HabitRowDb[]; logs: LogRow[]; plan: PlanRow[]; arcStart: string | null; oath: string | null }, now = new Date(), reviewDone = false): NowAction {
  const day = isoDay(now);
  const hm = now.toTimeString().slice(0, 5);
  const ix = indexLogs(r.logs);
  const live = r.habits.filter((h) => existed(h, day) && scheduled(h, day));
  const anyLogToday = r.logs.some((l) => l.day === day && l.done);
  // Day 1 of an arc, nothing ticked yet: the promise first
  if (r.arcStart === day && !anyLogToday && !r.logs.some((l) => l.day < day)) return { kind: 'oath', oath: r.oath ?? '' };
  // 1. an event starts within 15 minutes
  const toMin = (t: string) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
  const nowMin = toMin(hm);
  const soon = r.plan
    .filter((p) => p.day === day && !p.done && p.starts_at)
    .map((p) => ({ p, d: toMin(hhmm(p.starts_at)!) - nowMin }))
    .filter((x) => x.d >= 0 && x.d <= 15)
    .sort((a, b) => a.d - b.d)[0];
  if (soon) return { kind: 'event', event: soon.p, inMin: soon.d };
  // 2–3. the first open Core habit (then any habit when there is no Core)
  const core = live.filter((h) => h.core);
  const openCore = core.find((h) => !isLogged(ix, h.id, day));
  if (openCore) return { kind: 'habit', habit: openCore, core: true };
  if (!core.length) {
    const open = live.find((h) => !isLogged(ix, h.id, day));
    if (open && !live.some((h) => isLogged(ix, h.id, day))) return { kind: 'habit', habit: open, core: false };
  }
  // 4. evening: close the day
  if (now.getHours() >= 17 && !reviewDone) return { kind: 'review' };
  // 5. tomorrow's first event within 12 hours
  const tomorrow = addDays(day, 1);
  const first = r.plan.filter((p) => p.day === tomorrow && p.starts_at).sort((a, b) => a.starts_at!.localeCompare(b.starts_at!))[0];
  if (first && toMin(hhmm(first.starts_at)!) + 24 * 60 - nowMin <= 12 * 60) return { kind: 'tomorrow', event: first };
  return reviewDone ? { kind: 'closed' } : { kind: 'review' };
}

export const arcDayOf = (start: string, length: number, day = isoDay()) => Math.min(length, daysBetween(start, day) + 1);

/*
 * Arc Recap numbers (Master Changeset task 22): share of kept days, the best run of kept days,
 * focus hours and goals completed within the arc. For the running arc the range ends today.
 */
export type ArcSummary = { index: number; pct: number; daysPct: number; bestStreak: number; focusMin: number; goalsDone: number };
export function arcSummary(
  r: Omit<IndexInput, 'goals'> & { goals: { id: string; status: string; started_on: string; completed_at?: string | null }[] },
  arc: { started_on: string; length_days: number; ended_on: string | null },
  today = isoDay(),
): ArcSummary {
  const from = arc.started_on;
  const lastDay = addDays(from, arc.length_days - 1);
  const to = arc.ended_on ? (arc.ended_on < lastDay ? arc.ended_on : lastDay) : (today < lastDay ? today : lastDay);
  const ix = indexLogs(r.logs);
  const frozen = frozenSet(r.days);
  let days = 0, kept = 0, run = 0, best = 0;
  for (let d = from; d <= to; d = addDays(d, 1)) {
    if (!r.habits.some((h) => existed(h, d))) { run = 0; continue; }
    days++;
    if (dayKept(r.habits, ix, d, frozen)) { kept++; run++; best = Math.max(best, run); } else run = 0;
  }
  const focusMin = r.focus
    .filter((f) => f.completed && (f.session_type ?? 'focus') === 'focus')
    .filter((f) => { const d = isoDay(new Date(f.started_at)); return d >= from && d <= to; })
    .reduce((a, f) => a + f.minutes, 0);
  const goalsDone = r.goals.filter((g) => g.status === 'completed' && (!g.completed_at || (g.completed_at.slice(0, 10) >= from && g.completed_at.slice(0, 10) <= to))).length;
  const { index } = computeIndex(r, from, to);
  const daysPct = days ? Math.round((kept / days) * 100) : 0;
  return { index, pct: Math.round(index / 10), daysPct, bestStreak: best, focusMin, goalsDone };
}
