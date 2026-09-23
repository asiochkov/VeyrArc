/* Example data from VeyrArc Tracker.dc.html `state`. */
import type { IconName } from '../ui/Icon';
import type { L } from './today';

export type WeekMark = 'done' | 'miss' | 'today' | 'today-done' | 'future' | 'empty';

export type HabitType = 'binary' | 'counter' | 'duration';
export type Cadence = 'daily' | 'weekdays' | 'weekends';
export type Category = 'body' | 'mind' | 'disc' | 'prod' | 'quit';

export type TrackerHabit = {
  id: string; required?: boolean; name: L; icon: IconName; hue: string; cadence: L;
  streak: number; best: number; total: number; week: WeekMark[];
  /* A5: fields the composer now sets (not shown on the card in the design) */
  type?: HabitType; target?: number; unit?: string; minutes?: number; category?: Category;
};

export type Refusal = {
  id: string; name: L; icon: IconName; hue: string; quit: string;
  /* preset label key, or a custom unit typed in the composer (A6) */
  savedLabel?: 'cigs' | 'kcal' | 'min' | 'slips'; unit?: string; savedUnit: number;
  /* A6: slip counter and best clean run, in days */
  relapses: number; best: number;
};

export const trackerHabits: TrackerHabit[] = [
  { id: 'bed', required: true, name: { ru: 'Заправить кровать', en: 'Make the bed' }, icon: 'bedTracker', hue: '#E8A54B', cadence: { ru: 'каждый день', en: 'every day' }, streak: 12, best: 34, total: 96, week: ['done', 'done', 'done', 'today-done', 'future', 'future', 'future'] },
  { id: 'water', required: true, name: { ru: 'Пить воду', en: 'Drink water' }, icon: 'drop', hue: '#5B9BD5', cadence: { ru: '2 л в день', en: '2 l a day' }, streak: 26, best: 41, total: 178, week: ['done', 'done', 'done', 'today-done', 'future', 'future', 'future'] },
  { id: 'train', required: true, name: { ru: 'Ранний подъём', en: 'Early rise' }, icon: 'sun', hue: '#D96A5B', cadence: { ru: 'каждый день', en: 'every day' }, streak: 5, best: 18, total: 64, week: ['done', 'miss', 'done', 'today', 'future', 'future', 'future'] },
  { id: 'read', name: { ru: 'Чтение 20 мин', en: 'Reading 20 min' }, icon: 'doc', hue: '#5FBF9B', cadence: { ru: 'вечером', en: 'evening' }, streak: 9, best: 22, total: 71, week: ['done', 'done', 'miss', 'today', 'future', 'future', 'future'] },
  { id: 'med', name: { ru: 'Медитация', en: 'Meditation' }, icon: 'lotus', hue: '#9B87D6', cadence: { ru: 'утром', en: 'morning' }, streak: 3, best: 15, total: 40, week: ['done', 'done', 'done', 'today', 'future', 'future', 'future'] },
];

export const refusals: Refusal[] = [
  { id: 'smoke', name: { ru: 'Сигареты', en: 'Cigarettes' }, icon: 'ban', hue: '#D96A5B', quit: '2026-08-30T08:00:00', savedLabel: 'cigs', savedUnit: 24, relapses: 1, best: 24 },
  { id: 'sugar', name: { ru: 'Сахар', en: 'Sugar' }, icon: 'nosugar', hue: '#E8A54B', quit: '2026-09-07T09:00:00', savedLabel: 'kcal', savedUnit: 320, relapses: 2, best: 34 },
  { id: 'social', name: { ru: 'Соцсети до сна', en: 'Social media before bed' }, icon: 'phone', hue: '#5B9BD5', quit: '2026-09-09T22:30:00', savedLabel: 'min', savedUnit: 55, relapses: 0, best: 13 },
];

export const HABIT_PALETTE = ['#5B9BD5', '#E8A54B', '#D96A5B', '#5FBF9B', '#9B87D6', '#6FA0D6'];
export const QUIT_GOALS = [3, 7, 14, 30, 90];
export const HABIT_ICONS: IconName[] = ['doc', 'drop', 'sun', 'snow', 'shield', 'bedTracker', 'lotus', 'flameDrop', 'target', 'bolt'];
export const CATEGORIES: Category[] = ['body', 'mind', 'disc', 'prod', 'quit'];

/* Deterministic 12-week history grid, same generator as the prototype's seed()/buildGrid(). */
function seed(str: string) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return () => {
    h += 0x6D2B79F5;
    let t = h;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export type GridCell = 'done' | 'miss' | 'empty' | 'future';
export function buildGrid(h: TrackerHabit): GridCell[] {
  const rnd = seed(h.id);
  const rate = h.streak > 15 ? 0.86 : h.streak > 7 ? 0.7 : 0.55;
  const out: GridCell[] = [];
  for (let i = 0; i < 84; i++) {
    if (i >= 80) out.push('future');
    else out.push(rnd() < rate ? 'done' : rnd() < 0.5 ? 'miss' : 'empty');
  }
  return out;
}
export const habitRate = (h: TrackerHabit) => (h.streak > 15 ? 86 : h.streak > 7 ? 70 : 55);
