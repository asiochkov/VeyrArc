import { addDays, daysBetween, type PlanRow } from '../../data/model';
import { fromMin, hm, tasksOf, toMin } from './common';
import type { ExecCtx } from './index';

/* Time arithmetic on the planner (ТЗ 6.10.2 exec/calendar.ts): the free windows of a day, clashes, the hours planned. Pure over the data. */
export const WORK_START = 8 * 60, WORK_END = 21 * 60;
export type Span = { from: number; to: number };

/** minutes an event takes: its own end, or an hour when it has none */
export const lengthOf = (p: Pick<PlanRow, 'starts_at' | 'ends_at'>) => (p.starts_at && p.ends_at ? Math.max(15, toMin(hm(p.ends_at)) - toMin(hm(p.starts_at))) : 60);
const spanOf = (p: PlanRow): Span | null => (p.starts_at ? { from: toMin(hm(p.starts_at)), to: toMin(hm(p.starts_at)) + lengthOf(p) } : null);
export const busy = (c: ExecCtx, day: string, skip?: string): Span[] =>
  tasksOf(c, day).filter((p) => p.id !== skip && !p.done).map(spanOf).filter((s): s is Span => !!s).sort((a, b) => a.from - b.from);

/** free windows of at least `min` minutes between the start of the working day (or now + 15 min, rounded up to 5) and its end */
export function freeSlots(c: ExecCtx, day: string, min = 30, skip?: string): Span[] {
  let from = WORK_START;
  if (day === c.day) { const now = c.now.getHours() * 60 + c.now.getMinutes() + 15; from = Math.max(from, Math.ceil(now / 5) * 5); }
  const out: Span[] = [];
  let cur = from;
  for (const b of busy(c, day, skip)) {
    if (b.from - cur >= min) out.push({ from: cur, to: b.from });
    cur = Math.max(cur, b.to);
  }
  if (WORK_END - cur >= min) out.push({ from: cur, to: WORK_END });
  return out;
}
export const slotText = (s: Span) => `${fromMin(s.from)}–${fromMin(s.to)}`;
export const hoursPlanned = (c: ExecCtx, day: string) => tasksOf(c, day).filter((p) => !p.done && p.starts_at).reduce((a, p) => a + lengthOf(p), 0);

/** pairs of events that overlap on a day */
export function conflicts(c: ExecCtx, day: string): [PlanRow, PlanRow][] {
  const ev = tasksOf(c, day).filter((p) => p.starts_at && !p.done).sort((a, b) => a.starts_at!.localeCompare(b.starts_at!));
  const out: [PlanRow, PlanRow][] = [];
  for (let i = 0; i < ev.length; i++) for (let j = i + 1; j < ev.length; j++) {
    const a = spanOf(ev[i])!, b = spanOf(ev[j])!;
    if (b.from < a.to) out.push([ev[i], ev[j]]); else break;
  }
  return out;
}
/** the nearest day (today first) that has a free window of `min` minutes, looking `ahead` days */
export function nearestFree(c: ExecCtx, min: number, ahead = 7, skip?: string): { day: string; slot: Span } | null {
  for (let i = 0; i <= ahead; i++) {
    const d = addDays(c.day, i);
    const s = freeSlots(c, d, min, skip)[0];
    if (s) return { day: d, slot: s };
  }
  return null;
}
export const dayWords = (day: string, c: ExecCtx): string => {
  const n = daysBetween(c.day, day);
  if (n === 0) return c.ru ? 'сегодня' : 'today';
  if (n === 1) return c.ru ? 'завтра' : 'tomorrow';
  if (n === -1) return c.ru ? 'вчера' : 'yesterday';
  const d = new Date(day + 'T12:00:00');
  return c.ru ? `${['в воскресенье', 'в понедельник', 'во вторник', 'в среду', 'в четверг', 'в пятницу', 'в субботу'][d.getDay()]}, ${d.getDate()}.${String(d.getMonth() + 1).padStart(2, '0')}` : d.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
};
