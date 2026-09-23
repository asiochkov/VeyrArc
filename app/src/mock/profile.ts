/* Example data from VeyrArc Profile.dc.html renderVals(). */
import type { IconName } from '../ui/Icon';
import type { L } from './today';

/* The design currently hard-codes Pro ("пока всё разблокируй"). */
export const PROFILE_IS_PRO = true;

export const PERIOD_DATA = { week: { value: 718, delta: 6 }, month: { value: 742, delta: 18 }, year: { value: 705, delta: 41 }, arc: { value: 690, delta: 52 } } as const;
export type Period = keyof typeof PERIOD_DATA;

export const habitsCard = { streakAvg: 9, total: 82, types: [{ key: 'body', pct: 78 }, { key: 'mind', pct: 65 }, { key: 'disc', pct: 90 }, { key: 'total', pct: 82 }] as const };
export const habitsSpark = [60, 64, 70, 68, 75, 78, 82];
export const quitCard = { streak: 12, best: 34, relapses: 3, days: [1, 1, 1, 0, 1, 1, 1, 1, 0, 1, 1, 1, 1, 1] };
export const focusCard = { sessions: 18, bodyMin: 340, mindMin: 190, history: [40, 55, 30, 70, 45, 85, 60] };
export const goalsCard = { active: 3, avgPct: 54, nearestDeadline: { ru: '12 окт · Купить машину', en: 'Oct 12 · Buy a car' } as L };
export const plannerCard = { done: 42, planned: 50, pct: 84, overdue: 3 };
export const heatBestStreak = 21;
export const heatLevels = Array.from({ length: 84 }, (_, i) => (i * 7 + 3) % 5);
export const HEAT_COLORS = ['rgba(255,255,255,.05)', 'rgba(111,160,214,.28)', 'rgba(111,160,214,.5)', 'rgba(111,160,214,.75)', '#6FA0D6'];

export const achievements: { label: L; icon: IconName; unlocked: boolean }[] = [
  { label: { ru: '7 дней подряд', en: '7 days in a row' }, icon: 'flame', unlocked: true },
  { label: { ru: 'Первая цель', en: 'First goal' }, icon: 'target', unlocked: true },
  { label: { ru: '30 дней без срыва', en: '30 days slip-free' }, icon: 'checklist', unlocked: false },
  { label: { ru: 'Мастер привычек', en: 'Habit master' }, icon: 'trophy', unlocked: false },
];

export const correlation: L = {
  ru: 'Дни с ранним подъёмом повышают индекс дисциплины на 23% — паттерн по последним 30 дням.',
  en: 'Early-rise days lift your discipline index by 23% — pattern over the last 30 days.',
};
export const arcCompare = { current: 742, previous: 690, delta: 52, currentPct: 74, previousPct: 69 };

export const HIST = {
  '3m': [640, 660, 655, 690, 705, 742],
  '6m': [580, 610, 600, 650, 690, 660, 700, 655, 690, 705, 720, 742],
  '1y': [520, 540, 560, 580, 600, 610, 630, 650, 670, 690, 700, 742],
};
export type HistRange = keyof typeof HIST;

export const recommendations: { icon: IconName; title: L; desc: L }[] = [
  { icon: 'bedProfile', title: { ru: 'Добавь сон в привычки', en: 'Add sleep to habits' }, desc: { ru: 'Дни со сном 7+ часов дают на 15% выше индекс.', en: 'Days with 7+ hours of sleep score 15% higher.' } },
  { icon: 'target', title: { ru: 'Заверши «Путешествие»', en: 'Finish “Trip”' }, desc: { ru: 'Дедлайн близко — осталось 2 шага.', en: 'Deadline is close — 2 steps left.' } },
  { icon: 'checklist', title: { ru: 'Проверь план недели', en: 'Review your week plan' }, desc: { ru: 'Разбей планер по дням — так проще держать темп.', en: 'Split the planner by day — easier to keep the pace.' } },
  { icon: 'moonProfile', title: { ru: 'Отметь настроение', en: 'Log your mood' }, desc: { ru: 'Так корреляции станут точнее уже через неделю.', en: 'Correlations get sharper within a week.' } },
];
export const REC_GRADIENTS = ['linear-gradient(150deg,#3a5f7a,#1c2f3d)', 'linear-gradient(150deg,#5a5a2f,#2a2a17)', 'linear-gradient(150deg,#4a3a6b,#231c33)', 'linear-gradient(150deg,#6b4a2f,#332218)'];
