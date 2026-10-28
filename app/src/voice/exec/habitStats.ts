import { addDays, scheduled, type HabitRowDb } from '../../data/model';
import type { ExecCtx } from './index';
import { activeHabits } from './common';

/* Counting from the person's own marks (ТЗ 6.10.2): a habit's rate over its scheduled days, where it dropped, how it is spread over the week. */
export { periodIn, type Period } from '../nlp/period';
import type { Period } from '../nlp/period';
export function rangeOf(p: Period, c: ExecCtx): { from: string; to: string; ru: string; en: string } {
  const today = c.day;
  const d = new Date(today + 'T12:00:00');
  const mon = (d.getDay() + 6) % 7;
  if (p === 'day') return { from: today, to: today, ru: 'сегодня', en: 'today' };
  if (p === 'week') return { from: addDays(today, -mon), to: today, ru: 'на этой неделе', en: 'this week' };
  if (p === 'month') return { from: today.slice(0, 8) + '01', to: today, ru: 'в этом месяце', en: 'this month' };
  if (p === '30') return { from: addDays(today, -29), to: today, ru: 'за 30 дней', en: 'in the last 30 days' };
  return { from: '0000-01-01', to: today, ru: 'за всё время', en: 'overall' };
}

const created = (h: HabitRowDb) => h.created_at.slice(0, 10);
export function rate(c: ExecCtx, h: HabitRowDb, from: string, to: string): { done: number; due: number; pct: number } {
  const start = from > created(h) ? from : created(h);
  let due = 0, done = 0;
  for (let d = start; d <= to; d = addDays(d, 1)) {
    if (!scheduled(h, d)) continue;
    due++;
    if (c.sys?.logs.some((l) => l.habit_id === h.id && l.day === d && l.done)) done++;
  }
  return { done, due, pct: due ? Math.round((done / due) * 100) : 0 };
}
/** the sum of a counter habit's values in a range */
export function total(c: ExecCtx, h: HabitRowDb, from: string, to: string): number {
  return (c.sys?.logs ?? []).filter((l) => l.habit_id === h.id && l.day >= from && l.day <= to).reduce((a, l) => a + l.value, 0);
}
export const daysSince = (h: HabitRowDb, c: ExecCtx) => Math.max(0, Math.round((new Date(c.day).getTime() - new Date(created(h)).getTime()) / 86400000));

export type Ranked = { h: HabitRowDb; pct: number; due: number; done: number };
/** every habit with at least `min` scheduled days in the last `days` days, best first */
export function ranking(c: ExecCtx, days = 28, min = 7): Ranked[] {
  const from = addDays(c.day, -(days - 1));
  return activeHabits(c).map((h) => ({ h, ...rate(c, h, from, c.day) })).filter((x) => x.due >= min).sort((a, b) => b.pct - a.pct || b.done - a.done);
}
/** the two halves of the last 28 days: where the rate fell by 15 points or more */
export function drops(c: ExecCtx): { h: HabitRowDb; was: number; now: number }[] {
  const mid = addDays(c.day, -14);
  return activeHabits(c).map((h) => {
    const a = rate(c, h, addDays(c.day, -27), addDays(mid, -1)), b = rate(c, h, mid, c.day);
    return { h, was: a.pct, now: b.pct, ok: a.due >= 4 && b.due >= 4 };
  }).filter((x) => x.ok && x.was - x.now >= 15).sort((a, b) => (b.was - b.now) - (a.was - a.now));
}
/** per weekday (Mon = 0): how often a habit was done on its scheduled days */
export function byWeekday(c: ExecCtx, h: HabitRowDb, days = 56): { due: number; done: number }[] {
  const out = Array.from({ length: 7 }, () => ({ due: 0, done: 0 }));
  for (let i = 0; i < days; i++) {
    const d = addDays(c.day, -i);
    if (d < created(h) || !scheduled(h, d)) continue;
    const k = (new Date(d + 'T12:00:00').getDay() + 6) % 7;
    out[k].due++;
    if (c.sys?.logs.some((l) => l.habit_id === h.id && l.day === d && l.done)) out[k].done++;
  }
  return out;
}
