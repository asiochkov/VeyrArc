import { translate, type Lang } from '../i18n';
import { isoDay } from '../lib/day';
import { db } from '../lib/supabase';
import type { DayState, L, TodayHabit } from '../mock/today';
import type { todayStats } from '../mock/today';
import type { IconName } from '../ui/Icon';
import {
  addDays, dayKept, daysBetween, habitStreak, hhmm, indexLogs, isLogged, scheduled, streaks, weekStart,
  type ArcRow, type DayRow, type FocusRow, type HabitRowDb, type LogRow, type PlanRow,
} from './model';

export type TodayRaw = {
  day: string; habits: HabitRowDb[]; logs: LogRow[]; days: DayRow[]; focus: FocusRow[]; plan: PlanRow[]; arc: ArcRow | null;
};
export type TodayView = {
  habits: TodayHabit[];
  week: DayState[];
  planner: { time: L; text: L; accent?: boolean }[];
  stats: typeof todayStats;
  /** kept-day run up to yesterday, to add today's result live */
  streakBase: number;
  requiredIds: string[];
};

export async function fetchToday(): Promise<TodayRaw> {
  const day = isoDay();
  const from = addDays(day, -400);
  const [h, l, d, f, p, a] = await Promise.all([
    db().from('habits').select('*').is('archived_at', null).order('sort').order('created_at'),
    db().from('habit_logs').select('habit_id, day, value, done').gte('day', from),
    db().from('day_entries').select('day, mood, water, frozen').gte('day', from),
    db().from('focus_sessions').select('*').gte('started_at', addDays(day, -31)),
    db().from('plan_items').select('*').eq('day', day).order('starts_at', { nullsFirst: false }),
    db().from('arcs').select('*').is('ended_on', null).maybeSingle(),
  ]);
  for (const r of [h, l, d, f, p, a]) if (r.error) throw r.error;
  return { day, habits: h.data as HabitRowDb[], logs: l.data as LogRow[], days: d.data as DayRow[], focus: f.data as FocusRow[], plan: p.data as PlanRow[], arc: a.data as ArcRow | null };
}

const both = (fn: (lang: Lang) => string): L => ({ ru: fn('ru'), en: fn('en') });
const same = (s: string): L => ({ ru: s, en: s });

function catLabel(h: HabitRowDb): L {
  return both((lang) => {
    const cat = translate(lang, `categories.${h.category}` as never);
    const detail = h.type === 'counter' ? `${h.target ?? ''}${h.unit ? ' ' + h.unit : ''}`
      : h.type === 'duration' ? translate(lang, 'units.min', { m: h.minutes ?? 0 })
        : translate(lang, `tracker.cadences.${h.cadence}` as never);
    return `${cat} · ${detail}`;
  });
}

export function buildToday(raw: TodayRaw, opts: { initials: string; freezesAllowed: number }): TodayView {
  const { day } = raw;
  const ix = indexLogs(raw.logs);
  const frozen = new Set(raw.days.filter((d) => d.frozen).map((d) => d.day));
  const mon = weekStart(day);
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(mon, i));

  const todays = raw.habits.filter((h) => scheduled(h, day));
  const habits: TodayHabit[] = todays.map((h) => {
    const log = ix.get(h.id + '|' + day);
    const base = {
      id: h.id, icon: h.icon as IconName, title: same(h.name), cat: catLabel(h),
      streak: habitStreak(h, ix, day), dots: weekDays.map((d) => (isLogged(ix, h.id, d) ? 1 : 0)),
    };
    if (h.type === 'counter') return { ...base, type: 'counter', count: Math.round(log?.value ?? 0), goal: Math.max(1, Math.round(h.target ?? 1)) };
    if (h.type === 'duration') {
      const minutes = h.minutes ?? 20;
      return { ...base, type: 'duration', minutes, left: log?.done ? 0 : minutes * 60, running: false, started: false };
    }
    return { ...base, type: 'binary', checked: !!log?.done };
  });

  const { current, best } = streaks(raw.habits, ix, day, frozen);
  const keptToday = raw.habits.length > 0 && dayKept(raw.habits, ix, day, frozen);
  const streakBase = keptToday ? current - 1 : current;

  const week: DayState[] = weekDays.map((d) => {
    if (d === day) return 'today';
    if (d > day) return 'empty';
    if (frozen.has(d)) return 'freeze';
    return raw.habits.length && dayKept(raw.habits, ix, d, frozen) ? 'done' : 'empty';
  });

  const timed = raw.plan.filter((p) => p.starts_at);
  const nowHm = new Date().toTimeString().slice(0, 5);
  const nextTimed = timed.find((p) => (hhmm(p.starts_at) ?? '') >= nowHm) ?? null;
  const planner = raw.plan.slice(0, 3).map((p) => ({
    time: p.starts_at ? same(hhmm(p.starts_at)!) : both((lang) => translate(lang, 'today.daytime' as never)),
    text: same(p.title),
    accent: p === nextTimed,
  }));

  // focus
  const byDay = new Map<string, number>();
  for (const f of raw.focus) if (f.completed) { const d = isoDay(new Date(f.started_at)); byDay.set(d, (byDay.get(d) ?? 0) + f.minutes); }
  const todayFocus = raw.focus.filter((f) => f.completed && isoDay(new Date(f.started_at)) === day);
  const minOn = (d: string) => byDay.get(d) ?? 0;
  const last7 = Array.from({ length: 7 }, (_, i) => minOn(addDays(day, i - 6)));
  const max7 = Math.max(1, ...last7);
  let bestDay = day, bestMin = 0;
  for (const [d, m] of byDay) if (d !== day && m > bestMin) { bestMin = m; bestDay = d; }
  const focusToday = minOn(day);

  const arcDay = raw.arc ? Math.min(raw.arc.length_days, daysBetween(raw.arc.started_on, day) + 1) : 1;
  const mood = raw.days.find((d) => d.day === day)?.mood;
  const freezesUsed = weekDays.filter((d) => frozen.has(d)).length;

  return {
    habits, week, planner, streakBase, requiredIds: raw.habits.filter((h) => h.core).map((h) => h.id),
    stats: {
      arcDay, arcLength: raw.arc?.length_days ?? 90,
      freezesUsed, freezesAllowed: opts.freezesAllowed,
      moodSel: mood ? mood - 1 : 2,
      focusMinutes: 25, session: Math.min(4, (todayFocus.length % 4) + 1), sessionsPerCycle: 4,
      sessionsToday: todayFocus.length,
      focusBodyMin: todayFocus.filter((f) => f.category === 'body').reduce((a, f) => a + f.minutes, 0),
      focusMindMin: todayFocus.filter((f) => f.category === 'mind').reduce((a, f) => a + f.minutes, 0),
      streak: current, streakRecord: best,
      streakBars: Array.from({ length: 7 }, (_, i) => { const d = addDays(day, i - 6); return d === day ? (keptToday ? 1 : 0) : dayKept(raw.habits, ix, d, frozen) ? 1 : 0; }),
      focusTodayMin: focusToday,
      focusBars: last7.map((m) => Math.max(4, Math.round((m / max7) * 100))),
      focusVsYesterdayMin: focusToday - minOn(addDays(day, -1)),
      bestFocusDayMin: bestMin, bestFocusDaysAgo: bestMin ? daysBetween(bestDay, day) : 0,
      bestFocusGainMin: Math.max(0, bestMin - focusToday),
      initials: opts.initials,
    },
  };
}

/* ---- writes ---- */
export async function writeLog(habitId: string, value: number, done: boolean) {
  const day = isoDay();
  const r = value > 0
    ? await db().from('habit_logs').upsert({ habit_id: habitId, day, value, done })
    : await db().from('habit_logs').delete().eq('habit_id', habitId).eq('day', day);
  if (r.error) throw r.error;
}
export async function writeMood(level: number) {
  const r = await db().from('day_entries').upsert({ day: isoDay(), mood: level + 1 }, { onConflict: 'user_id,day' });
  if (r.error) throw r.error;
}
export async function writeFocus(minutes: number) {
  const r = await db().from('focus_sessions').insert({ minutes, started_at: new Date(Date.now() - minutes * 60000).toISOString() });
  if (r.error) throw r.error;
}
