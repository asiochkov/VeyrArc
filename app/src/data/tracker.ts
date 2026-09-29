import { translate, type Lang } from '../i18n';
import { isoDay } from '../lib/day';
import { db } from '../lib/supabase';
import type { L } from '../mock/today';
import type { GridCell, Refusal, TrackerHabit, WeekMark } from '../mock/tracker';
import type { IconName } from '../ui/Icon';
import type { HabitDraft, QuitDraft } from '../pages/tracker/ComposerOptions';
import { addDays, habitBest, habitStreak, indexLogs, isLogged, scheduled, weekStart, type HabitRowDb, type LogRow, type QuitRow } from './model';

export type TrackerRaw = { day: string; habits: HabitRowDb[]; logs: LogRow[]; quits: QuitRow[]; relapses: { quit_id: string }[] };

export async function fetchTracker(): Promise<TrackerRaw> {
  const day = isoDay();
  const [h, l, q, r] = await Promise.all([
    db().from('habits').select('*').is('archived_at', null).order('sort').order('created_at'),
    db().from('habit_logs').select('habit_id, day, value, done').gte('day', addDays(day, -400)),
    db().from('quits').select('*').is('archived_at', null).order('created_at'),
    db().from('quit_relapses').select('quit_id'),
  ]);
  for (const x of [h, l, q, r]) if (x.error) throw x.error;
  return { day, habits: h.data as HabitRowDb[], logs: l.data as LogRow[], quits: q.data as QuitRow[], relapses: r.data as { quit_id: string }[] };
}

const both = (fn: (lang: Lang) => string): L => ({ ru: fn('ru'), en: fn('en') });

export function cadenceLabel(h: Pick<HabitRowDb, 'type' | 'target' | 'unit' | 'minutes' | 'cadence'>): L {
  return both((lang) => (h.type === 'counter' ? `${h.target ?? ''}${h.unit ? ' ' + h.unit : ''}`
    : h.type === 'duration' ? translate(lang, 'units.min', { m: h.minutes ?? 0 })
      : translate(lang, `tracker.cadences.${h.cadence}` as never)));
}

export function buildTracker(raw: TrackerRaw): { habits: TrackerHabit[]; refusals: Refusal[] } {
  const { day } = raw;
  const ix = indexLogs(raw.logs);
  const mon = weekStart(day);
  const gridStart = addDays(mon, -77); // 12 weeks, Monday-aligned
  const habits: TrackerHabit[] = raw.habits.map((h) => {
    const created = h.created_at.slice(0, 10);
    const week: WeekMark[] = Array.from({ length: 7 }, (_, i) => {
      const d = addDays(mon, i);
      const done = isLogged(ix, h.id, d);
      if (d === day) return done ? 'today-done' : 'today';
      if (d > day) return 'future';
      if (done) return 'done';
      return d >= created && scheduled(h, d) ? 'miss' : 'empty';
    });
    let due = 0, hit = 0;
    const grid: GridCell[] = Array.from({ length: 84 }, (_, i) => {
      const d = addDays(gridStart, i);
      if (d > day) return 'future';
      if (d < created || !scheduled(h, d)) return 'empty';
      due++;
      if (isLogged(ix, h.id, d)) { hit++; return 'done'; }
      return d === day ? 'empty' : 'miss';
    });
    return {
      id: h.id, required: h.required, name: { ru: h.name, en: h.name }, icon: h.icon as IconName, hue: h.hue,
      cadence: cadenceLabel(h), streak: habitStreak(h, ix, day), best: habitBest(h, ix, day),
      total: raw.logs.filter((l) => l.habit_id === h.id && l.done).length, week,
      type: h.type, target: h.target ?? undefined, unit: h.unit ?? undefined, minutes: h.minutes ?? undefined, category: h.category,
      grid, rate: due ? Math.round((hit / due) * 100) : 0,
    };
  });
  const refusals: Refusal[] = raw.quits.map((q) => ({
    id: q.id, name: { ru: q.name, en: q.name }, icon: q.icon as IconName, hue: q.hue, quit: q.clean_since,
    savedLabel: q.unit ? undefined : 'slips', unit: q.unit ?? undefined, savedUnit: Number(q.per_day),
    relapses: raw.relapses.filter((r) => r.quit_id === q.id).length, best: q.best_days, goalDays: q.goal_days ?? undefined,
  }));
  return { habits, refusals };
}

/* ---- writes ---- */
const ok = <T extends { error: unknown }>(r: T) => { if (r.error) throw r.error; return r; };

export async function addHabit(name: string, d: HabitDraft, required: boolean, sort: number) {
  ok(await db().from('habits').insert({
    name, icon: d.icon, hue: d.hue, type: d.type, category: d.category, cadence: d.cadence, required, sort,
    target: d.type === 'counter' ? d.target : null, unit: d.type === 'counter' ? d.unit.trim() || null : null,
    minutes: d.type === 'duration' ? d.minutes : null,
  }));
}
export const archiveHabit = async (id: string) => { ok(await db().from('habits').update({ archived_at: new Date().toISOString() }).eq('id', id)); };
export async function addQuit(name: string, d: QuitDraft, hue: string) {
  ok(await db().from('quits').insert({ name, hue, icon: 'ban', unit: d.unit.trim() || null, per_day: d.norm }));
}
export const archiveQuit = async (id: string) => { ok(await db().from('quits').update({ archived_at: new Date().toISOString() }).eq('id', id)); };
export const relapse = async (id: string) => { ok(await db().rpc('log_relapse', { p_quit: id })); };
export const setQuitGoal = async (id: string, g: number) => { ok(await db().from('quits').update({ goal_days: g }).eq('id', id)); };
