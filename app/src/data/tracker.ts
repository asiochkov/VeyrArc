import { translate, type Lang } from '../i18n';
import type { L } from '../mock/today';
import type { GridCell, Refusal, TrackerHabit, WeekMark } from '../mock/tracker';
import type { IconName } from '../ui/Icon';
import { addDays, habitBest, habitStreak, indexLogs, isLogged, scheduled, weekStart, type HabitRowDb, type LogRow, type QuitRow } from './model';

export type TrackerRaw = { day: string; habits: HabitRowDb[]; logs: LogRow[]; quits: QuitRow[]; relapses: { quit_id: string }[] };

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
      id: h.id, required: h.core, name: { ru: h.name, en: h.name }, icon: h.icon as IconName, hue: h.hue,
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

