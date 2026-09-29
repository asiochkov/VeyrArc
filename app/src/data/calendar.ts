import { isoDay } from '../lib/day';
import { db } from '../lib/supabase';
import type { CalEvent, EvColor } from '../mock/calendar';
import { addDays, daysBetween, parseDay, weekStart, type PlanRow } from './model';

type CatRow = { id: string; key: string | null; hue: string };
const KEY_COLOR: Record<string, EvColor> = { meeting: 'blue', work: 'green', deadline: 'red', review: 'purple' };
export const COLOR_KEY: Record<EvColor, string> = { blue: 'meeting', green: 'work', red: 'deadline', purple: 'review' };

export type CalRaw = { day: string; week0: string; monthStart: string; items: PlanRow[]; cats: CatRow[] };

export async function fetchCalendar(): Promise<CalRaw> {
  const day = isoDay();
  const week0 = weekStart(day);
  const d = parseDay(day);
  const monthStart = isoDay(new Date(d.getFullYear(), d.getMonth(), 1));
  const monthEnd = isoDay(new Date(d.getFullYear(), d.getMonth() + 1, 0));
  const from = week0 < monthStart ? week0 : monthStart;
  const to = addDays(week0, 6) > monthEnd ? addDays(week0, 6) : monthEnd;
  const [c, i] = await Promise.all([
    db().from('plan_categories').select('id, key, hue'),
    db().from('plan_items').select('*').gte('day', from).lte('day', to).order('starts_at', { nullsFirst: false }),
  ]);
  for (const x of [c, i]) if (x.error) throw x.error;
  return { day, week0, monthStart, items: i.data as PlanRow[], cats: c.data as CatRow[] };
}

const toH = (t: string) => { const [h, m] = t.split(':').map(Number); return h + m / 60; };
export const fromH = (x: number) => { const h = Math.floor(x); const m = Math.round((x - h) * 60); return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`; };

export function colorOf(raw: CalRaw, p: PlanRow): EvColor {
  const key = raw.cats.find((c) => c.id === p.category_id)?.key ?? 'work';
  return KEY_COLOR[key] ?? 'green';
}

/** Timed items of the visible week as grid events (d = 0…6, Monday first). */
export function weekEvents(raw: CalRaw): CalEvent[] {
  return raw.items
    .filter((p) => p.starts_at && p.day >= raw.week0 && p.day <= addDays(raw.week0, 6))
    .map((p) => {
      const s = toH(p.starts_at!);
      return { id: p.id, d: daysBetween(raw.week0, p.day), s, e: p.ends_at ? toH(p.ends_at) : s + 1, t: { ru: p.title, en: p.title }, c: colorOf(raw, p), n: p.note ? { ru: p.note, en: p.note } : undefined };
    });
}

/* ---- writes ---- */
const ok = <T extends { error: unknown }>(r: T) => { if (r.error) throw r.error; return r; };
export async function createItem(raw: CalRaw, id: string, day: string, s: number, e: number, title: string, c: EvColor) {
  const cat = raw.cats.find((x) => x.key === COLOR_KEY[c]);
  ok(await db().from('plan_items').insert({ id, day, title, starts_at: fromH(s), ends_at: fromH(e), category_id: cat?.id ?? null }));
}
export const updateTimes = async (id: string, s: number, e: number) => { ok(await db().from('plan_items').update({ starts_at: fromH(s), ends_at: fromH(e) }).eq('id', id)); };
export const updateNote = async (id: string, note: string) => { ok(await db().from('plan_items').update({ note }).eq('id', id)); };
export const setDone = async (id: string, done: boolean) => { ok(await db().from('plan_items').update({ done }).eq('id', id)); };
export const deleteItem = async (id: string) => { ok(await db().from('plan_items').delete().eq('id', id)); };
