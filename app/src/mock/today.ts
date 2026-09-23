/*
 * Example data from VeyrArc Today.dc.html `state` / renderVals(). Stage 2 renders
 * these; stage 4 replaces them with Supabase data. Text is user content, so it
 * carries both languages here (EN from project/i18n.js).
 */
import type { IconName } from '../ui/Icon';

export type L = { ru: string; en: string };

export type TodayHabit =
  | { id: string; type: 'binary'; icon: IconName; title: L; cat: L; streak: number; checked: boolean; dots: number[] }
  | { id: string; type: 'counter'; icon: IconName; title: L; cat: L; streak: number; count: number; goal: number; dots: number[] }
  | { id: string; type: 'duration'; icon: IconName; title: L; cat: L; streak: number; minutes: number; left: number; running: boolean; started: boolean; dots: number[] };

/* The first part of `cat` ("Тело", "Разум", "Дисциплина") drives the analytics split. */
export const todayHabits: TodayHabit[] = [
  { id: 'shower', type: 'binary', icon: 'snow', title: { ru: 'Холодный душ', en: 'Cold shower' }, cat: { ru: 'Тело · утро', en: 'Body · morning' }, streak: 12, checked: true, dots: [1, 1, 1, 1, 0, 0, 0] },
  { id: 'water', type: 'counter', icon: 'drop', title: { ru: 'Вода', en: 'Water' }, cat: { ru: 'Тело · 8 стаканов', en: 'Body · 8 glasses' }, streak: 26, count: 3, goal: 8, dots: [1, 1, 1, 1, 0, 0, 0] },
  { id: 'read', type: 'duration', icon: 'doc', title: { ru: 'Чтение', en: 'Reading' }, cat: { ru: 'Разум · 20 мин', en: 'Mind · 20 min' }, streak: 9, minutes: 20, left: 1200, running: false, started: false, dots: [1, 1, 0, 1, 1, 0, 0] },
  { id: 'rise', type: 'binary', icon: 'sun', title: { ru: 'Ранний подъём', en: 'Early rise' }, cat: { ru: 'Тело · утро', en: 'Body · morning' }, streak: 5, checked: false, dots: [1, 0, 0, 0, 1, 1, 0] },
  { id: 'social', type: 'binary', icon: 'shield', title: { ru: 'Соцсети — стоп', en: 'Social media — stop' }, cat: { ru: 'Дисциплина · утро', en: 'Discipline · morning' }, streak: 3, checked: false, dots: [1, 1, 1, 0, 0, 0, 0] },
];

export type DayState = 'done' | 'freeze' | 'today' | 'empty';
export const weekStates: DayState[] = ['done', 'freeze', 'done', 'today', 'empty', 'empty', 'empty'];

export const plannerToday: { time: L; text: L; accent?: boolean }[] = [
  { time: { ru: '18:00', en: '18:00' }, text: { ru: 'Встреча с командой', en: 'Team meeting' }, accent: true },
  { time: { ru: 'Днём', en: 'Daytime' }, text: { ru: 'Позвонить родителям', en: 'Call my parents' } },
  { time: { ru: 'Днём', en: 'Daytime' }, text: { ru: 'Купить термобельё', en: 'Buy thermal underwear' } },
];

export const todayStats = {
  arcDay: 14,
  arcLength: 90,
  freezesUsed: 0,
  freezesAllowed: 1,
  moodSel: 2,
  focusMinutes: 25,
  session: 2,
  sessionsPerCycle: 4,
  sessionsToday: 3,
  focusBodyMin: 80,
  focusMindMin: 40,
  streak: 14,
  streakRecord: 21,
  streakBars: [1, 1, 1, 1, 1, 1, 0],
  focusTodayMin: 200,
  focusBars: [40, 55, 30, 70, 45, 85, 60],
  focusVsYesterdayMin: 18,
  bestFocusDayMin: 250,
  bestFocusDaysAgo: 3,
  bestFocusGainMin: 50,
  initials: 'AP',
};
