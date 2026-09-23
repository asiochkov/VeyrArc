/* Example data from VeyrArc Calendar.dc.html `state` / renderVals(). */
import type { L } from './today';

export type EvColor = 'blue' | 'green' | 'red' | 'purple';
export type CalEvent = { id: string; d: number; s: number; e: number; t: L; c: EvColor; n?: L };

export const EV_FILL: Record<EvColor, string> = { blue: '#4E86BE', green: '#43A483', red: '#C25749', purple: '#8670C4' };
export const EV_CAT: Record<EvColor, { tag: 'meeting' | 'work' | 'deadline' | 'review'; hue: string }> = {
  blue: { tag: 'meeting', hue: '#5B9BD5' },
  green: { tag: 'work', hue: '#5FBF9B' },
  red: { tag: 'deadline', hue: '#D96A5B' },
  purple: { tag: 'review', hue: '#9B87D6' },
};

export const ROW = 64;       // desktop px per hour
export const ROW_M = 66;     // mobile px per hour
export const H0 = 7;
export const H1 = 21;

export const calEvents: CalEvent[] = [
  { id: 'e1', d: 0, s: 8, e: 8.83, t: { ru: 'Созвон с клиентом', en: 'Client call' }, c: 'blue' },
  { id: 'e2', d: 0, s: 10, e: 11, t: { ru: 'Тест сценариев', en: 'Scenario testing' }, c: 'green' },
  { id: 'e3', d: 1, s: 8, e: 10, t: { ru: 'Подготовка презентации', en: 'Presentation prep' }, c: 'green' },
  { id: 'e4', d: 1, s: 11, e: 12, t: { ru: 'Дизайн-ревью', en: 'Design review' }, c: 'purple' },
  { id: 'e5', d: 1, s: 13, e: 14, t: { ru: 'Синк с разработкой', en: 'Dev sync' }, c: 'red' },
  { id: 'e6', d: 2, s: 8, e: 8.83, t: { ru: 'Созвон с клиентом', en: 'Client call' }, c: 'blue' },
  { id: 'e7', d: 2, s: 9, e: 10, t: { ru: 'Подготовка к встрече', en: 'Meeting prep' }, c: 'red' },
  { id: 'e8', d: 3, s: 8, e: 9, t: { ru: 'Ретро команды', en: 'Team retro' }, c: 'green' },
  { id: 'e9', d: 3, s: 13, e: 14.5, t: { ru: 'Веду воркшоп', en: 'Running a workshop' }, c: 'red' },
  { id: 'meet', d: 4, s: 11, e: 12, t: { ru: 'Встреча с командой', en: 'Team meeting' }, c: 'blue', n: { ru: 'Собрать статусы по спринту, принести макеты главного экрана.', en: 'Collect sprint statuses, bring the home screen mockups.' } },
  { id: 'e11', d: 4, s: 8, e: 8.83, t: { ru: 'Созвон с клиентом', en: 'Client call' }, c: 'blue' },
  { id: 'e12', d: 4, s: 14, e: 15, t: { ru: 'Анимации интерфейса', en: 'UI animations' }, c: 'green' },
  { id: 'e13', d: 5, s: 9, e: 10, t: { ru: 'Работа над дизайн-системой', en: 'Design system work' }, c: 'green' },
  { id: 'e14', d: 6, s: 8, e: 8.83, t: { ru: 'Созвон с клиентом', en: 'Client call' }, c: 'blue' },
];

/* The visible week: Mon 11 … Sun 17; Tue 12 is "today". */
export const weekDates = [11, 12, 13, 14, 15, 16, 17];
export const TODAY_IDX = 1;
export const MONTH = { days: 30, sel: 12, today: 11 };

export const upcoming = [
  { name: { ru: 'Презентация проекта', en: 'Project presentation' }, time: '08:30', done: true },
  { name: { ru: 'Дизайн-ревью', en: 'Design review' }, time: '11:40', done: false },
  { name: { ru: 'Обед', en: 'Lunch' }, time: '12:00', done: false },
  { name: { ru: 'Воркшоп', en: 'Workshop' }, time: '13:00', done: false },
];

export const breakdown = [
  { label: { ru: 'Встречи', en: 'Meetings' }, hours: 6, c: '#5B9BD5', w: 78 },
  { label: { ru: 'Проекты', en: 'Projects' }, hours: 4, c: '#5FBF9B', w: 55 },
  { label: { ru: 'События', en: 'Events' }, hours: 2, c: '#E8A54B', w: 34 },
  { label: { ru: 'Ревью', en: 'Reviews' }, hours: 1, c: '#9B87D6', w: 22 },
];

export const mobileStats = [
  { value: '82%', key: 'habitsDone', hue: '#5FBF9B', icon: 'check', span: 2 },
  { value: '12', key: 'daysInRow', hue: '#E8A54B', icon: 'flameTall', span: 1 },
  { value: '3', key: 'daysToGoal', hue: '#9B87D6', icon: 'target', span: 1 },
] as const;

export const TZ_LABEL = 'GMT +4';
export const TASKS_TODAY = 3;
