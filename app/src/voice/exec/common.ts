import { DAYS_ALL, indexLogs, scheduled, streaks, type HabitRowDb, type LogRow, type PlanRow } from '../../data/model';
import { logHabit } from '../../state/actions';
import type { ExecCtx } from './index';
import type { UndoOp } from './types';

/* What several executors share: today's habits, marking one, the plan of a day, small wording helpers. Writes go through actions.ts only. */
export const q = (s: string) => `«${s}»`;
export const plural = (n: number, one: string, few: string, many: string) => {
  const a = Math.abs(n) % 100, b = a % 10;
  return a > 10 && a < 20 ? many : b === 1 ? one : b >= 2 && b <= 4 ? few : many;
};
export const hm = (t: string | null | undefined) => (t ? t.slice(0, 5) : '');
export const toMin = (t: string) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
export const fromMin = (m: number) => `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

export const activeHabits = (c: ExecCtx): HabitRowDb[] => (c.sys?.habits ?? []).filter((h) => !h.archived_at);
export const habitsToday = (c: ExecCtx, day = c.day) => activeHabits(c).filter((h) => scheduled(h, day));
export const logOf = (c: ExecCtx, id: string, day = c.day): LogRow | undefined => c.sys?.logs.find((l) => l.habit_id === id && l.day === day);
export const openHabits = (c: ExecCtx, day = c.day) => habitsToday(c, day).filter((h) => !logOf(c, h.id, day)?.done).sort((a, b) => Number(b.core) - Number(a.core) || a.sort - b.sort);
export const tasksOf = (c: ExecCtx, from = c.day, to = from): PlanRow[] => (c.sys?.plan ?? []).filter((p) => p.day >= from && p.day <= to);
export const sortedByTime = (ps: PlanRow[]) => [...ps].sort((a, b) => (a.starts_at ?? '99').localeCompare(b.starts_at ?? '99') || a.title.localeCompare(b.title));
export const taskLine = (p: PlanRow) => `${p.starts_at ? hm(p.starts_at) : '—'} · ${p.title}`;

export function currentStreak(c: ExecCtx): { current: number; best: number } {
  if (!c.sys) return { current: 0, best: 0 };
  const frozen = new Set(c.sys.days.filter((d) => d.frozen).map((d) => d.day));
  return streaks(activeHabits(c), indexLogs(c.sys.logs), c.day, frozen);
}

export type Marked = { text: string; ops: UndoOp[]; changed: boolean; done: boolean };
/** mark a habit by its own rules: a yes/no is done, a counter goes up (to its target), a timed one gets its minutes */
export function markHabit(c: ExecCtx, h: HabitRowDb, o: { amount?: number | null; minutes?: number | null; day?: string; full?: boolean } = {}): Marked {
  const day = o.day ?? c.day;
  const prev = logOf(c, h.id, day);
  const op: UndoOp = { t: 'habit.log', habitId: h.id, day, prev: prev ? { value: prev.value, done: prev.done } : null };
  const { ru } = c;
  if (h.type === 'counter') {
    const goal = h.target ?? 1;
    const v = o.full ? goal : Math.min(goal, (prev?.value ?? 0) + (o.amount ?? 1));
    if (prev?.done && v === prev.value) return { text: ru ? `${h.name} уже выполнена: ${goal} из ${goal}` : `${h.name} is already done`, ops: [], changed: false, done: true };
    logHabit(h.id, v, v >= goal, day);
    return { text: ru ? `${h.name}: ${v} из ${goal}${v >= goal ? '. Готово!' : ''}` : `${h.name}: ${v} of ${goal}${v >= goal ? '. Done!' : ''}`, ops: [op], changed: true, done: v >= goal };
  }
  if (h.type === 'duration') {
    const need = h.minutes ?? 1;
    const total = o.minutes ? Math.min(need * 4, (prev?.value ?? 0) + o.minutes) : need;
    if (prev?.done && !o.minutes) return { text: ru ? `${h.name} уже отмечена` : `${h.name} is already done`, ops: [], changed: false, done: true };
    logHabit(h.id, total, total >= need, day);
    return { text: total >= need ? (ru ? `Отметил: ${h.name}${o.minutes ? `, ${total} мин` : ''}` : `Done: ${h.name}`) : (ru ? `${h.name}: ${total} из ${need} минут` : `${h.name}: ${total} of ${need} min`), ops: [op], changed: true, done: total >= need };
  }
  if (prev?.done) return { text: ru ? `${h.name} уже отмечена${day === c.day ? ' сегодня' : ''}` : `${h.name} is already done`, ops: [], changed: false, done: true };
  logHabit(h.id, 1, true, day);
  return { text: ru ? `Отметил: ${h.name}` : `Done: ${h.name}`, ops: [op], changed: true, done: true };
}

export const everyDay = (h: Pick<HabitRowDb, 'days'>) => h.days === DAYS_ALL;
