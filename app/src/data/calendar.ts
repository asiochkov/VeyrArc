import { db } from '../lib/supabase';
import type { EvColor } from '../mock/calendar';
import type { PlanRow } from './model';

type CatRow = { id: string; key: string | null; hue: string };
const KEY_COLOR: Record<string, EvColor> = { meeting: 'blue', work: 'green', deadline: 'red', review: 'purple' };
export const COLOR_KEY: Record<EvColor, string> = { blue: 'meeting', green: 'work', red: 'deadline', purple: 'review' };

/** A planner item as the calendar works with it: hours as fractions, s = null for a task without time. */
export type Ev = { id: string; day: string; s: number | null; e: number | null; title: string; c: EvColor; note: string; done: boolean };
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
    return { id: p.id, day: p.day, s, e: s == null ? null : p.ends_at ? toH(p.ends_at) : s + 1, title: p.title, c: KEY_COLOR[key] ?? 'green', note: p.note ?? '', done: p.done };
  });
}

/* ---- writes ---- */
const ok = <T extends { error: unknown }>(r: T) => { if (r.error) throw r.error; return r; };
const row = (cats: CatRow[], ev: Ev) => ({
  day: ev.day, title: ev.title.slice(0, 120), note: ev.note || null, done: ev.done,
  starts_at: ev.s == null ? null : fromH(ev.s), ends_at: ev.s == null || ev.e == null ? null : fromH(ev.e),
  category_id: cats.find((x) => x.key === COLOR_KEY[ev.c])?.id ?? null,
});
export async function createItem(cats: CatRow[], ev: Ev) { ok(await db().from('plan_items').insert({ id: ev.id, ...row(cats, ev) })); }
export async function saveItem(cats: CatRow[], ev: Ev) { ok(await db().from('plan_items').update(row(cats, ev)).eq('id', ev.id)); }
export const setDone = async (id: string, done: boolean) => { ok(await db().from('plan_items').update({ done }).eq('id', id)); };
export const deleteItem = async (id: string) => { ok(await db().from('plan_items').delete().eq('id', id)); };
