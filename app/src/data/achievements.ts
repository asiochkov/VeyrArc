import type { IconName } from '../ui/Icon';
import { addDays, indexLogs, streaks } from './model';
import type { SystemRaw } from '../state/system';

/*
 * Achievements as a collection (audit 1.9.4 / 2.5.3): tiers, progress toward each, and an unlock
 * moment (see AchievementWatcher). Computed from the data — nothing extra is stored on the server.
 */
export type Tier = 'bronze' | 'silver' | 'gold';
export type Achievement = { id: string; icon: IconName; tier: Tier; label: { ru: string; en: string }; cur: number; max: number; unlocked: boolean };

const A = (id: string, icon: IconName, tier: Tier, ru: string, en: string, cur: number, max: number): Achievement =>
  ({ id, icon, tier, label: { ru, en }, cur: Math.min(cur, max), max, unlocked: cur >= max });

export function computeAchievements(sys: SystemRaw, today: string): Achievement[] {
  const habits = sys.habits.filter((h) => !h.archived_at);
  const ix = indexLogs(sys.logs);
  const frozen = new Set(sys.days.filter((d) => d.frozen).map((d) => d.day));
  const { current, best } = streaks(habits, ix, today, frozen);
  const run = Math.max(current, best);
  const checks = sys.logs.filter((l) => l.done).length;
  const focusH = sys.focus.filter((f) => f.completed && (f.session_type ?? 'focus') === 'focus').reduce((a, f) => a + f.minutes, 0) / 60;
  const goalsDone = sys.goals.filter((g) => g.status === 'completed').length;
  const clean = Math.max(0, ...sys.quits.map((q) => Math.max(q.best_days, Math.floor((Date.now() - new Date(q.clean_since).getTime()) / 86400000))));
  const moods = sys.days.filter((d) => d.mood != null && d.day > addDays(today, -30)).length;
  const arcsDone = sys.arcs.filter((a) => a.ended_on).length;
  return [
    A('first', 'check', 'bronze', 'Первая отметка', 'First check', checks, 1),
    A('streak3', 'flame', 'bronze', '3 дня подряд', '3 days in a row', run, 3),
    A('streak7', 'flame', 'silver', 'Неделя в ритме', 'A week in rhythm', run, 7),
    A('streak21', 'flame', 'silver', '21 день', '21 days', run, 21),
    A('streak30', 'flameTall', 'gold', 'Месяц подряд', 'A month in a row', run, 30),
    A('checks100', 'checklist', 'silver', '100 отметок', '100 checks', checks, 100),
    A('checks500', 'checklist', 'gold', '500 отметок', '500 checks', checks, 500),
    A('focus1', 'bolt', 'bronze', 'Первый час фокуса', 'First hour of focus', focusH, 1),
    A('focus10', 'bolt', 'silver', '10 часов фокуса', '10 hours of focus', focusH, 10),
    A('goal1', 'target', 'silver', 'Цель достигнута', 'A goal reached', goalsDone, 1),
    A('clean30', 'shield', 'gold', '30 дней без срыва', '30 days clean', clean, 30),
    A('mood20', 'spark', 'bronze', 'Слышу себя: 20 дней настроения', 'In tune: 20 days of mood', moods, 20),
    A('arc1', 'trophy', 'gold', 'Арка пройдена', 'An arc completed', arcsDone, 1),
  ];
}
