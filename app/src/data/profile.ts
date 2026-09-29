import { isoDay } from '../lib/day';
import { db } from '../lib/supabase';
import * as M from '../mock/profile';
import type { L } from '../mock/today';
import { addDays, daysBetween, dayKept, indexLogs, isLogged, scheduled, streaks, type ArcRow, type DayRow, type FocusRow, type HabitRowDb, type LogRow, type PlanRow, type QuitRow } from './model';

/* Everything the Profile screen shows, in the shapes of mock/profile.ts. */
export type ProfileData = {
  PERIOD_DATA: Record<M.Period, { value: number; delta: number }>;
  habitsCard: { streakAvg: number; total: number; types: readonly { key: 'body' | 'mind' | 'disc' | 'total'; pct: number }[] };
  habitsSpark: number[];
  quitCard: { streak: number; best: number; relapses: number; days: number[] };
  focusCard: { sessions: number; bodyMin: number; mindMin: number; history: number[] };
  goalsCard: { active: number; avgPct: number; nearestDeadline: L };
  plannerCard: { done: number; planned: number; pct: number; overdue: number };
  heatBestStreak: number; heatLevels: number[];
  achievements: typeof M.achievements;
  correlation: L;
  arcCompare: { current: number; previous: number; delta: number; currentPct: number; previousPct: number; currentN: number; previousN: number };
  HIST: Record<M.HistRange, number[]>;
  recommendations: typeof M.recommendations;
  PROFILE_IS_PRO: boolean;
  initials: string;
};

export const MOCK_PROFILE: ProfileData = {
  PERIOD_DATA: M.PERIOD_DATA, habitsCard: M.habitsCard, habitsSpark: M.habitsSpark, quitCard: M.quitCard, focusCard: M.focusCard,
  goalsCard: M.goalsCard, plannerCard: M.plannerCard, heatBestStreak: M.heatBestStreak, heatLevels: M.heatLevels, achievements: M.achievements,
  correlation: M.correlation, arcCompare: { ...M.arcCompare, currentN: 2, previousN: 1 }, HIST: M.HIST, recommendations: M.recommendations,
  PROFILE_IS_PRO: M.PROFILE_IS_PRO, initials: 'AP',
};

type GoalRow = { id: string; title: string; status: string; deadline: string | null; started_on: string };
type Raw = {
  day: string; habits: HabitRowDb[]; logs: LogRow[]; days: DayRow[]; quits: QuitRow[]; relapses: { quit_id: string; at: string }[];
  goals: GoalRow[]; tasks: { id: string; goal_id: string }[]; entries: { goal_id: string; day: string; done_task_ids: string[] }[];
  plan: PlanRow[]; focus: FocusRow[]; arcs: ArcRow[];
};

export async function fetchProfile(): Promise<Raw> {
  const day = isoDay();
  const from = addDays(day, -400);
  const q = await Promise.all([
    db().from('habits').select('*').is('archived_at', null),
    db().from('habit_logs').select('habit_id, day, value, done').gte('day', from),
    db().from('day_entries').select('day, mood, water, frozen').gte('day', from),
    db().from('quits').select('*').is('archived_at', null),
    db().from('quit_relapses').select('quit_id, at'),
    db().from('goals').select('id, title, status, deadline, started_on'),
    db().from('goal_tasks').select('id, goal_id'),
    db().from('goal_entries').select('goal_id, day, done_task_ids').gte('day', from),
    db().from('plan_items').select('*').gte('day', from),
    db().from('focus_sessions').select('*').gte('started_at', from),
    db().from('arcs').select('*').order('number'),
  ]);
  for (const r of q) if (r.error) throw r.error;
  const [h, l, d, qu, rl, g, t, e, p, f, a] = q.map((r) => r.data as never[]);
  return { day, habits: h, logs: l, days: d, quits: qu, relapses: rl, goals: g, tasks: t, entries: e, plan: p, focus: f, arcs: a };
}

const ratio = (a: number, b: number) => (b > 0 ? a / b : null);

/**
 * Discipline index 0…1000 over [from, to] — weights proposed in docs/stage-0.md §5:
 * habits .35, kept days .15, quits .15, goals .15, planner .10, focus .05, mood logging .05.
 * Parts without data are left out and the rest re-weighted.
 */
export function disciplineIndex(r: Raw, from: string, to: string) {
  const ix = indexLogs(r.logs);
  const frozen = new Set(r.days.filter((x) => x.frozen).map((x) => x.day));
  let due = 0, hit = 0, kept = 0, days = 0, moodDays = 0, clean = 0, cleanDue = 0, gDone = 0, gDue = 0, focusMin = 0;
  const slipDays = new Set(r.relapses.map((x) => x.quit_id + '|' + isoDay(new Date(x.at))));
  for (let d = from; d <= to; d = addDays(d, 1)) {
    const live = r.habits.filter((h) => h.created_at.slice(0, 10) <= d);
    if (!live.length && !r.quits.length) continue;
    days++;
    for (const h of live) if (scheduled(h, d)) { due++; if (isLogged(ix, h.id, d)) hit++; }
    if (live.length && dayKept(r.habits, ix, d, frozen)) kept++;
    if (r.days.find((x) => x.day === d && x.mood)) moodDays++;
    for (const q of r.quits) if (q.created_at.slice(0, 10) <= d) { cleanDue++; if (!slipDays.has(q.id + '|' + d)) clean++; }
    for (const g of r.goals) if (g.started_on <= d && g.status === 'active') {
      const n = r.tasks.filter((t) => t.goal_id === g.id).length;
      gDue++;
      const e = r.entries.find((x) => x.goal_id === g.id && x.day === d);
      if (n && e && e.done_task_ids.length >= n) gDone++;
    }
  }
  const plan = r.plan.filter((p) => p.day >= from && p.day <= to);
  for (const f of r.focus) { const d = isoDay(new Date(f.started_at)); if (f.completed && d >= from && d <= to) focusMin += f.minutes; }
  const parts: [number, number | null][] = [
    [0.35, ratio(hit, due)], [0.15, ratio(kept, days)], [0.15, ratio(clean, cleanDue)], [0.15, ratio(gDone, gDue)],
    [0.10, ratio(plan.filter((p) => p.done).length, plan.length)], [0.05, days ? Math.min(1, focusMin / days / 50) : null], [0.05, ratio(moodDays, days)],
  ];
  const used = parts.filter(([, v]) => v != null) as [number, number][];
  const w = used.reduce((a, [x]) => a + x, 0);
  return w ? Math.round((1000 * used.reduce((a, [x, v]) => a + x * v, 0)) / w) : 0;
}

export function buildProfile(r: Raw, opts: { pro: boolean; initials: string }): ProfileData {
  const { day } = r;
  const ix = indexLogs(r.logs);
  const frozen = new Set(r.days.filter((x) => x.frozen).map((x) => x.day));
  const arc = r.arcs.find((a) => !a.ended_on);
  const period = (len: number) => {
    const value = disciplineIndex(r, addDays(day, -(len - 1)), day);
    return { value, delta: value - disciplineIndex(r, addDays(day, -(2 * len - 1)), addDays(day, -len)) };
  };
  const arcLen = arc ? daysBetween(arc.started_on, day) + 1 : 30;
  const PERIOD_DATA = { week: period(7), month: period(30), year: period(365), arc: period(arcLen) };

  const d30 = addDays(day, -29);
  const byCat = (cat?: string) => {
    let due = 0, hit = 0;
    for (let d = d30; d <= day; d = addDays(d, 1)) for (const h of r.habits) {
      if ((cat && h.category !== cat) || h.created_at.slice(0, 10) > d || !scheduled(h, d)) continue;
      due++; if (isLogged(ix, h.id, d)) hit++;
    }
    return due ? Math.round((hit / due) * 100) : 0;
  };
  const dayPct = (d: string) => {
    const live = r.habits.filter((h) => h.created_at.slice(0, 10) <= d && scheduled(h, d));
    return live.length ? Math.round((live.filter((h) => isLogged(ix, h.id, d)).length / live.length) * 100) : 0;
  };
  const { current, best } = streaks(r.habits, ix, day, frozen);
  const habitStreaks = r.habits.map((h) => { let n = 0; for (let d = day; n < 400; d = addDays(d, -1)) { if (!scheduled(h, d)) { n++; continue; } if (!isLogged(ix, h.id, d)) break; n++; } return n; });

  const cleanDays = r.quits.map((q) => Math.floor((Date.now() - new Date(q.clean_since).getTime()) / 86400000));
  const slipDays = new Set(r.relapses.map((x) => isoDay(new Date(x.at))));
  const focus30 = r.focus.filter((f) => f.completed && isoDay(new Date(f.started_at)) >= d30);
  const minOn = (d: string) => r.focus.filter((f) => f.completed && isoDay(new Date(f.started_at)) === d).reduce((a, f) => a + f.minutes, 0);

  const active = r.goals.filter((g) => g.status === 'active');
  const goalPct = (g: GoalRow) => {
    const n = r.tasks.filter((t) => t.goal_id === g.id).length;
    const total = daysBetween(g.started_on, day) + 1;
    const done = r.entries.filter((e) => e.goal_id === g.id && n && e.done_task_ids.length >= n).length;
    return total > 0 ? Math.round((done / total) * 100) : 0;
  };
  const next = active.filter((g) => g.deadline && g.deadline >= day).sort((a, b) => a.deadline!.localeCompare(b.deadline!))[0];
  const dl = (lang: 'ru' | 'en') => next ? `${new Date(next.deadline! + 'T00:00:00').toLocaleDateString(lang === 'en' ? 'en-US' : 'ru-RU', { day: 'numeric', month: 'short' })} · ${next.title}` : '';
  const plan30 = r.plan.filter((p) => p.day >= d30 && p.day <= day);

  const heatStart = addDays(day, -83);
  const heatLevels = Array.from({ length: 84 }, (_, i) => { const p = dayPct(addDays(heatStart, i)); return p === 0 ? 0 : p < 25 ? 1 : p < 50 ? 2 : p < 75 ? 3 : 4; });

  const prevArc = r.arcs.filter((a) => a.ended_on).pop();
  const curIdx = PERIOD_DATA.arc.value;
  const prevIdx = prevArc ? disciplineIndex(r, prevArc.started_on, prevArc.ended_on!) : 0;
  const hist = (points: number, step: number, win: number) => Array.from({ length: points }, (_, i) => { const end = addDays(day, -(points - 1 - i) * step); return disciplineIndex(r, addDays(end, -(win - 1)), end); });

  return {
    PERIOD_DATA,
    habitsCard: {
      streakAvg: habitStreaks.length ? Math.round(habitStreaks.reduce((a, b) => a + b, 0) / habitStreaks.length) : 0,
      total: byCat(),
      types: [{ key: 'body', pct: byCat('body') }, { key: 'mind', pct: byCat('mind') }, { key: 'disc', pct: byCat('disc') }, { key: 'total', pct: byCat() }],
    },
    habitsSpark: Array.from({ length: 7 }, (_, i) => dayPct(addDays(day, i - 6))),
    quitCard: {
      streak: cleanDays.length ? Math.max(...cleanDays) : 0,
      best: Math.max(0, ...r.quits.map((q, i) => Math.max(q.best_days, cleanDays[i]))),
      relapses: r.relapses.filter((x) => isoDay(new Date(x.at)) >= d30).length,
      days: Array.from({ length: 14 }, (_, i) => (slipDays.has(addDays(day, i - 13)) ? 0 : 1)),
    },
    focusCard: {
      sessions: focus30.length,
      bodyMin: focus30.filter((f) => f.category === 'body').reduce((a, f) => a + f.minutes, 0),
      mindMin: focus30.filter((f) => f.category === 'mind').reduce((a, f) => a + f.minutes, 0),
      history: Array.from({ length: 7 }, (_, i) => minOn(addDays(day, i - 6))),
    },
    goalsCard: { active: active.length, avgPct: active.length ? Math.round(active.reduce((a, g) => a + goalPct(g), 0) / active.length) : 0, nearestDeadline: { ru: dl('ru'), en: dl('en') } },
    plannerCard: {
      done: plan30.filter((p) => p.done).length, planned: plan30.length,
      pct: plan30.length ? Math.round((plan30.filter((p) => p.done).length / plan30.length) * 100) : 0,
      overdue: plan30.filter((p) => !p.done && p.day < day).length,
    },
    heatBestStreak: Math.max(best, current), heatLevels,
    achievements: [
      { ...M.achievements[0], unlocked: Math.max(best, current) >= 7 },
      { ...M.achievements[1], unlocked: r.goals.length > 0 },
      { ...M.achievements[2], unlocked: r.quits.some((q, i) => Math.max(q.best_days, cleanDays[i]) >= 30) },
      { ...M.achievements[3], unlocked: r.logs.filter((l) => l.done).length >= 100 },
    ],
    correlation: {
      ru: 'Паттерны появятся, когда наберётся хотя бы 2 недели отметок и настроения.',
      en: 'Patterns appear once you have at least 2 weeks of check-ins and mood.',
    },
    arcCompare: {
      current: curIdx, previous: prevIdx, delta: curIdx - prevIdx,
      currentPct: Math.round(curIdx / 10), previousPct: Math.round(prevIdx / 10),
      currentN: arc?.number ?? 1, previousN: prevArc?.number ?? Math.max(1, (arc?.number ?? 2) - 1),
    },
    HIST: { '3m': hist(6, 15, 15), '6m': hist(12, 15, 15), '1y': hist(12, 30, 30) },
    recommendations: [M.recommendations[0], M.recommendations[2], M.recommendations[3]],
    PROFILE_IS_PRO: opts.pro,
    initials: opts.initials,
  };
}
