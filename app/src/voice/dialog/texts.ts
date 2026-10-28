import type { Parsed } from '../nlp/types';

const str = (v: unknown): string => (typeof v === 'string' ? v : '');

/* ---------- the words of a confirmation ---------- */
const VERB: Record<string, [string, string]> = {
  'habit.done': ['Отметить', 'Mark'], 'habit.undone': ['Снять отметку с', 'Unmark'], 'task.delete': ['Удалить', 'Delete'], 'task.move': ['Перенести', 'Move'],
  'task.add': ['Добавить задачу', 'Add task'], 'habit.remove': ['Удалить привычку', 'Delete habit'], 'habit.add': ['Добавить привычку', 'Add habit'], 'goal.complete': ['Завершить цель', 'Complete goal'],
  'goal.add': ['Создать цель', 'Create goal'], 'quit.relapse': ['Записать срыв', 'Log a slip'], 'task.moveBulk': ['Перенести все задачи', 'Move all tasks'], 'export.data': ['Выгрузить все данные', 'Export all data'],
  'mood.set': ['Записать настроение', 'Log mood'], 'habit.doneAll': ['Отметить все привычки', 'Mark all habits'], 'task.doneAll': ['Закрыть все задачи', 'Close all tasks'],
};
export function previewOf(p: Parsed, l: 'ru' | 'en'): string {
  const [ru, en] = VERB[p.kind] ?? ['Выполнить', 'Do'];
  const what = [p.slots.title, p.slots.query, p.slots.text].find((x) => typeof x === 'string' && x && x !== 'все') as string | undefined;
  const when = str(p.slots.day) ? ` → ${str(p.slots.day)}${p.slots.time ? ' ' + str(p.slots.time) : ''}` : '';
  return `${l === 'ru' ? ru : en}${what ? ` «${what}»` : ''}${when}?`;
}

