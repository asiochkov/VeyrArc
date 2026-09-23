/* Example data from VeyrArc Training.dc.html (goals section) `state`. */
import type { L } from './today';

export type GoalTask = { id: string; text: L; detail: L };
export type Goal = {
  id: string; title: L; hue: string; status: 'active' | 'completed'; startDate: string; bestStreak: number;
  type?: 'process' | 'number'; deadline?: string; tasks: GoalTask[];
};
export type Entry = { tasksDone: Record<string, boolean>; diary: L | string; mood: number | null };

export const GOALS_TODAY = '2026-09-22';
export const FREE_GOAL_LIMIT = 3;
export const GOAL_HUES = ['#E8A54B', '#5B9BD5', '#9B87D6', '#5FBF9B', '#D96A5B'];

const E = { ru: '', en: '' };

export const goals: Goal[] = [
  { id: 'travel', title: { ru: 'Накопить на путешествие', en: 'Save for a trip' }, hue: '#E8A54B', status: 'active', startDate: '2026-09-15', bestStreak: 4,
    tasks: [{ id: 'a', text: { ru: 'Отложить часть дохода и обновить сумму в трекере накоплений', en: 'Set aside part of your income and update the savings tracker' }, detail: { ru: 'Даже небольшая сумма — двигает дедлайн ближе.', en: 'Even a small amount moves the deadline closer.' } }] },
  { id: 'car', title: { ru: 'Купить машину', en: 'Buy a car' }, hue: '#5B9BD5', status: 'active', startDate: '2026-09-13', bestStreak: 2,
    tasks: [{ id: 'a', text: { ru: 'Изучить один вариант авто', en: 'Research one car option' }, detail: { ru: 'Тест-драйв, отзывы или сравнение цены — что угодно, что продвигает выбор.', en: 'Test drive, reviews or a price check — anything that moves the choice forward.' } }] },
  { id: 'english', title: { ru: 'Выучить английский', en: 'Learn English' }, hue: '#9B87D6', status: 'active', startDate: '2026-09-17', bestStreak: 6,
    tasks: [{ id: 'a', text: { ru: 'Пройти урок в приложении', en: 'Do a lesson in the app' }, detail: E }, { id: 'b', text: { ru: 'Повторить 10 новых слов', en: 'Review 10 new words' }, detail: E }] },
];

const d = (ru: string, en: string): L => ({ ru, en });
export const entries: Record<string, Entry> = {
  'travel|2026-09-15': { tasksDone: { a: true }, diary: d('Открыла отдельный счёт для накоплений и перевела первую сумму.', 'Opened a separate savings account and moved the first amount.'), mood: 3 },
  'travel|2026-09-16': { tasksDone: { a: true }, diary: '', mood: null },
  'travel|2026-09-18': { tasksDone: { a: true }, diary: d('Нашла более выгодный вклад — прогресс пойдёт быстрее.', 'Found a better deposit — progress will speed up.'), mood: 3 },
  'travel|2026-09-19': { tasksDone: { a: true }, diary: '', mood: null },
  'travel|2026-09-20': { tasksDone: { a: false }, diary: '', mood: null },
  'travel|2026-09-21': { tasksDone: { a: true }, diary: d('Сравнила билеты на март — сумма почти собрана.', 'Compared March tickets — the amount is almost there.'), mood: 4 },
  'car|2026-09-13': { tasksDone: { a: true }, diary: d('Посчитала бюджет с учётом страховки — сократила список до трёх моделей.', 'Worked out the budget with insurance — narrowed it to three models.'), mood: 2 },
  'car|2026-09-16': { tasksDone: { a: true }, diary: '', mood: null },
  'car|2026-09-20': { tasksDone: { a: true }, diary: d('Съездила на тест-драйв Solaris и Rio. Rio понравился больше по посадке.', 'Test-drove Solaris and Rio. Liked the Rio’s seating more.'), mood: 3 },
  'car|2026-09-21': { tasksDone: { a: false }, diary: '', mood: null },
  'english|2026-09-17': { tasksDone: { a: true, b: true }, diary: d('Прошла модуль про Present Perfect, наконец разобралась.', 'Finished the Present Perfect module, finally got it.'), mood: 3 },
  'english|2026-09-18': { tasksDone: { a: true, b: true }, diary: '', mood: null },
  'english|2026-09-19': { tasksDone: { a: true, b: false }, diary: '', mood: null },
  'english|2026-09-20': { tasksDone: { a: true, b: true }, diary: '', mood: null },
  'english|2026-09-21': { tasksDone: { a: true, b: true }, diary: d('Досмотрела серию без субтитров — почти всё понятно.', 'Watched an episode without subtitles — understood almost everything.'), mood: 4 },
};
