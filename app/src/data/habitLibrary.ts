import type { Category, HabitRowDb } from './model';
import { DAYS_ALL, DAYS_WEEKDAYS } from './model';

/*
 * Habit library (audit 1.6.2): ready habits per direction with the right kind (yes/no, count,
 * minutes), a default rhythm and a one-line «why». Tap — and it is set up properly.
 */
export type HabitTemplate = {
  key: string; cat: Exclude<Category, 'quit'>; icon: string; type: HabitRowDb['type'];
  target?: number; unit?: string; minutes?: number; days?: number;
  name: { ru: string; en: string }; why: { ru: string; en: string };
};
const T = (key: string, cat: HabitTemplate['cat'], icon: string, type: HabitTemplate['type'], ru: string, en: string, wru: string, wen: string, extra: Partial<HabitTemplate> = {}): HabitTemplate =>
  ({ key, cat, icon, type, name: { ru, en }, why: { ru: wru, en: wen }, ...extra });

export const HABIT_LIBRARY: HabitTemplate[] = [
  T('water', 'body', 'drop', 'counter', 'Вода', 'Water', 'База самочувствия', 'The base of feeling well', { target: 8, unit: 'стаканов' }),
  T('walk', 'body', 'sun', 'duration', 'Прогулка', 'Walk', 'Голова проясняется на ходу', 'A clear head comes on foot', { minutes: 30 }),
  T('run', 'body', 'bolt', 'duration', 'Пробежка', 'Run', 'Запускает утро', 'Starts the morning', { minutes: 20 }),
  T('stretch', 'body', 'lotus', 'duration', 'Растяжка', 'Stretching', 'Разблокирует тело', 'Unlocks the body', { minutes: 10 }),
  T('workout', 'body', 'flame', 'binary', 'Тренировка', 'Workout', 'Сила — это уверенность', 'Strength is confidence', { days: 0b0010101 }),
  T('shower', 'body', 'snow', 'binary', 'Холодный душ', 'Cold shower', 'Бодрость за две минуты', 'Awake in two minutes'),
  T('sleep', 'body', 'moon', 'binary', 'Отбой до 23:00', 'In bed by 11 pm', 'Основа всего', 'The base of everything'),
  T('steps', 'body', 'pulse', 'counter', 'Шаги', 'Steps', 'Движение без спортзала', 'Movement without a gym', { target: 8, unit: 'тыс.' }),
  T('read', 'mind', 'doc', 'duration', 'Чтение', 'Reading', 'Вместо ленты соцсетей', 'Instead of the feed', { minutes: 20 }),
  T('meditate', 'mind', 'lotus', 'duration', 'Медитация', 'Meditation', 'Увидеть свои мысли', 'See your thoughts', { minutes: 10 }),
  T('pages', 'mind', 'pencil', 'binary', 'Утренние страницы', 'Morning pages', 'Выгрузить голову', 'Empty your head'),
  T('gratitude', 'mind', 'spark', 'counter', 'Благодарность', 'Gratitude', 'Переключает фокус на хорошее', 'Turns focus to the good', { target: 3, unit: 'вещи' }),
  T('language', 'mind', 'globe', 'duration', 'Иностранный язык', 'A language', 'Пятнадцать минут каждый день', 'Fifteen minutes a day', { minutes: 15 }),
  T('learn', 'mind', 'target', 'duration', 'Учёба', 'Study', 'Один шаг к навыку', 'One step toward a skill', { minutes: 30, days: DAYS_WEEKDAYS }),
  T('noPhoneAm', 'disc', 'phone', 'binary', 'Утро без телефона', 'No phone in the morning', 'Первый час — твой', 'The first hour is yours'),
  T('plan', 'disc', 'clipboard', 'binary', 'План на день', 'Plan the day', 'Решить заранее — проще сделать', 'Decided early, easier done'),
  T('review', 'disc', 'moon', 'binary', 'Итоги дня', 'Daily review', 'Закрыть день, а не бросить', 'Close the day, don’t drop it'),
  T('bed', 'disc', 'bedTracker', 'binary', 'Заправить кровать', 'Make the bed', 'Первая победа дня', 'The first win of the day'),
  T('deep', 'prod', 'bolt', 'duration', 'Глубокая работа', 'Deep work', 'Главное — до обеда', 'The main thing before lunch', { minutes: 90, days: DAYS_WEEKDAYS }),
  T('inbox', 'prod', 'mail', 'binary', 'Разобрать входящие', 'Inbox zero', 'Чистая голова к вечеру', 'A clear head by evening', { days: DAYS_WEEKDAYS }),
  T('mit', 'prod', 'target', 'binary', 'Главная задача дня', 'Most important task', 'Одна вещь, которая двигает', 'One thing that moves you'),
  T('callFamily', 'disc', 'person', 'binary', 'Позвонить близким', 'Call family', 'Связь, которая держит', 'The bond that holds', { days: 0b1000000 }),
];
export const libraryDays = (t: HabitTemplate) => t.days ?? DAYS_ALL;
