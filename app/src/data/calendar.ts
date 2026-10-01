import { db } from '../lib/supabase';
import type { EvColor } from '../mock/calendar';
import type { PlanRow } from './model';

type CatRow = { id: string; key: string | null; hue: string };
const KEY_COLOR: Record<string, EvColor> = { meeting: 'blue', work: 'green', deadline: 'red', review: 'purple' };
export const COLOR_KEY: Record<EvColor, string> = { blue: 'meeting', green: 'work', red: 'deadline', purple: 'review' };

/** A planner item as the calendar works with it: hours as fractions, s = null for a task without time. */
export type Ev = {
  id: string; day: string; s: number | null; e: number | null; title: string; c: EvColor; note: string; done: boolean;
  linkedGoalId?: string | null; linkedHabitId?: string | null; focus?: boolean;
};
export type CalRaw = { items: PlanRow[]; cats: CatRow[] };

export async function fetchCalendar(from: string, to: string): Promise<CalRaw> {
  const [c, i] = await Promise.all([
    db().from('plan_categories').select('id, key, hue'),
    db().from('plan_items').select('*').gte('day', from).lte('day', to).order('starts_at', { nullsFirst: false }),
  ]);
  for (const x of [c, i]) if (x.error) throw x.error;
  return { items: i.data as PlanRow[], cats: c.data as CatRow[] };
}

const toH = (t: string) => { const [h, m] = t.split(':').map(Number); return h + m / 60; };
export const fromH = (x: number) => { const h = Math.floor(x); const m = Math.round((x - h) * 60); return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`; };

export function toEvents(raw: CalRaw): Ev[] {
  return raw.items.map((p) => {
    const s = p.starts_at ? toH(p.starts_at) : null;
    const key = raw.cats.find((c) => c.id === p.category_id)?.key ?? 'work';
    return {
      id: p.id, day: p.day, s, e: s == null ? null : p.ends_at ? toH(p.ends_at) : s + 1, title: p.title, c: KEY_COLOR[key] ?? 'green', note: p.note ?? '', done: p.done,
      linkedGoalId: p.linked_goal_id ?? null, linkedHabitId: p.linked_habit_id ?? null, focus: !!p.focus,
    };
  });
}

/** A calendar event back into a planner row (the system state and the database use rows). */
export function toRow(cats: CatRow[], ev: Ev): PlanRow {
  return {
    id: ev.id, day: ev.day, title: ev.title.slice(0, 120), note: ev.note || null, done: ev.done,
    starts_at: ev.s == null ? null : fromH(ev.s), ends_at: ev.s == null || ev.e == null ? null : fromH(Math.min(ev.e, 23.99)),
    category_id: cats.find((x) => x.key === COLOR_KEY[ev.c])?.id ?? null,
    linked_goal_id: ev.linkedGoalId ?? null, linked_habit_id: ev.linkedHabitId ?? null, focus: !!ev.focus,
  };
}
