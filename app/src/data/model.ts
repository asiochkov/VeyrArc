/* Row types and shared calculations over the Supabase tables (see supabase/migrations). */
import { isoDay } from '../lib/day';

export type Category = 'body' | 'mind' | 'disc' | 'prod' | 'quit';
export type HabitRowDb = {
  id: string; name: string; icon: string; hue: string; type: 'binary' | 'counter' | 'duration';
  target: number | null; unit: string | null; minutes: number | null; cadence: 'daily' | 'weekdays' | 'weekends';
  category: Category; required: boolean; sort: number; created_at: string;
};
export type LogRow = { habit_id: string; day: string; value: number; done: boolean };
export type DayRow = { day: string; mood: number | null; water: number; frozen: boolean };
export type FocusRow = { id: string; started_at: string; minutes: number; category: Category | null; completed: boolean };
export type PlanRow = { id: string; title: string; category_id: string | null; day: string; starts_at: string | null; ends_at: string | null; note: string | null; done: boolean };
export type ArcRow = { id: string; number: number; started_on: string; length_days: number; ended_on: string | null; summary: unknown };
export type QuitRow = { id: string; name: string; icon: string; hue: string; unit: string | null; per_day: number; clean_since: string; best_days: number; goal_days: number | null; created_at: string };

/* ---- dates (local calendar days as YYYY-MM-DD) ---- */
export const parseDay = (d: string) => { const [y, m, dd] = d.split('-').map(Number); return new Date(y, m - 1, dd); };
export const addDays = (d: string, n: number) => { const x = parseDay(d); x.setDate(x.getDate() + n); return isoDay(x); };
export const daysBetween = (a: string, b: string) => Math.round((parseDay(b).getTime() - parseDay(a).getTime()) / 86400000);
/** Monday of the week that contains `d`. */
export const weekStart = (d: string) => { const x = parseDay(d); const wd = (x.getDay() + 6) % 7; x.setDate(x.getDate() - wd); return isoDay(x); };

export function scheduled(h: Pick<HabitRowDb, 'cadence'>, day: string) {
  const wd = parseDay(day).getDay(); // 0 = Sunday
  if (h.cadence === 'weekdays') return wd >= 1 && wd <= 5;
  if (h.cadence === 'weekends') return wd === 0 || wd === 6;
  return true;
}
const existed = (h: HabitRowDb, day: string) => h.created_at.slice(0, 10) <= day;

export type LogIndex = Map<string, LogRow>; // key `${habit_id}|${day}`
export const indexLogs = (logs: LogRow[]): LogIndex => new Map(logs.map((l) => [l.habit_id + '|' + l.day, l]));
export const isLogged = (ix: LogIndex, habitId: string, day: string) => !!ix.get(habitId + '|' + day)?.done;

/**
 * A day is kept when every habit marked «в стрике» that was scheduled that day
 * is done; with no such habits, when at least one habit was done. A streak
 * freeze keeps the day as well.
 */
export function dayKept(habits: HabitRowDb[], ix: LogIndex, day: string, frozen: Set<string>) {
  if (frozen.has(day)) return true;
  const live = habits.filter((h) => existed(h, day) && scheduled(h, day));
  const req = live.filter((h) => h.required);
  if (req.length) return req.every((h) => isLogged(ix, h.id, day));
  return live.some((h) => isLogged(ix, h.id, day));
}

/** Current streak (up to yesterday, plus today when kept) and the best run in the window. */
export function streaks(habits: HabitRowDb[], ix: LogIndex, today: string, frozen: Set<string>, windowDays = 400) {
  let run = 0;
  for (let i = 1; i <= windowDays; i++) {
    const d = addDays(today, -i);
    if (!habits.some((h) => existed(h, d))) break;
    if (!dayKept(habits, ix, d, frozen)) break;
    run++;
  }
  const current = run + (dayKept(habits, ix, today, frozen) ? 1 : 0);
  let best = current, cur = 0;
  for (let i = windowDays; i >= 1; i--) {
    const d = addDays(today, -i);
    if (habits.some((h) => existed(h, d)) && dayKept(habits, ix, d, frozen)) { cur++; best = Math.max(best, cur); } else cur = 0;
  }
  return { current, best };
}

/** Per-habit streak over its scheduled days. */
export function habitStreak(h: HabitRowDb, ix: LogIndex, today: string, windowDays = 400) {
  let n = 0;
  for (let i = 1; i <= windowDays; i++) {
    const d = addDays(today, -i);
    if (!existed(h, d)) break;
    if (!scheduled(h, d)) continue;
    if (!isLogged(ix, h.id, d)) break;
    n++;
  }
  return n + (isLogged(ix, h.id, today) ? 1 : 0);
}

export function habitBest(h: HabitRowDb, ix: LogIndex, today: string, windowDays = 400) {
  let best = 0, cur = 0;
  for (let i = windowDays; i >= 0; i--) {
    const d = addDays(today, -i);
    if (!existed(h, d) || !scheduled(h, d)) continue;
    if (isLogged(ix, h.id, d)) { cur++; best = Math.max(best, cur); } else cur = 0;
  }
  return best;
}

export const hhmm = (t: string | null) => (t ? t.slice(0, 5) : null);
export const today = () => isoDay();
