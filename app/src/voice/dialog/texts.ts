import type { Parsed } from '../nlp/types';

const str = (v: unknown): string => (typeof v === 'string' ? v : '');

/* ---------- the words of a confirmation ---------- */
const VERB: Record<string, [string, string]> = {
  'habit.done': ['Отметить', 'Mark'], 'habit.undone': ['Снять отметку с', 'Unmark'], 'task.delete': ['Удалить', 'Delete'], 'task.move': ['Перенести', 'Move'],
  'task.add': ['Добавить задачу', 'Add task'], 'habit.remove': ['Удалить привычку', 'Delete habit'], 'habit.add': ['Добавить привычку', 'Add habit'], 'goal.complete': ['Завершить цель', 'Complete goal'],
  'goal.add': ['Создать цель', 'Create goal'], 'quit.relapse': ['Записать срыв', 'Log a slip'], 'task.moveBulk': ['Перенести все задачи', 'Move all tasks'], 'export.data': ['Выгрузить все данные', 'Export all data'],
  'habit.markGroup': ['Отметить группу привычек', 'Mark the habit group'], 'habit.markPast': ['Отметить задним числом', 'Mark for a past day'], 'counter.set': ['Установить значение', 'Set the value'],
  'habit.addFromLibrary': ['Добавить из библиотеки', 'Add from the library'], 'habit.rename': ['Переименовать привычку', 'Rename habit'], 'habit.schedule': ['Изменить дни привычки', 'Change habit days'],
  'habit.target': ['Изменить норму привычки', 'Change habit target'], 'habit.core': ['Изменить важность привычки', 'Change habit priority'], 'habit.pause': ['Поставить на паузу привычку', 'Pause habit'],
  'habit.restore': ['Вернуть привычку', 'Restore habit'], 'habit.reorder': ['Переместить привычку', 'Move habit'], 'habit.simplify': ['Упростить привычку', 'Make the habit easier'],
  'habit.harden': ['Усложнить привычки', 'Make habits harder'], 'habit.chain': ['Связать привычки', 'Chain habits'], 'quit.add': ['Добавить отказ', 'Add quit'], 'quit.goal': ['Поставить цель по отказу', 'Set a quit goal'],
  'quit.archive': ['Убрать отказ', 'Archive the quit'], 'goal.addFull': ['Создать цель с шагами', 'Create goal with steps'], 'goal.step.add': ['Добавить шаг', 'Add step'], 'goal.split': ['Разбить цель на шаги', 'Split the goal'],
  'goal.deadline': ['Поставить срок цели', 'Set goal deadline'], 'goal.rename': ['Переименовать цель', 'Rename goal'], 'goal.step.rename': ['Переименовать шаг', 'Rename step'], 'goal.step.delete': ['Удалить шаг', 'Delete step'],
  'goal.link': ['Привязать к цели', 'Link to the goal'], 'goal.diary.add': ['Записать в дневник цели', 'Write to goal diary'], 'goal.markAll': ['Отметить все шаги', 'Mark all steps'],
  'task.addMany': ['Добавить задачи', 'Add tasks'], 'task.addRecurring': ['Добавить повторяющуюся задачу', 'Add recurring task'], 'task.deleteSeries': ['Удалить серию задач', 'Delete the series'],
  'task.duration': ['Изменить длительность', 'Change duration'], 'task.category': ['Изменить категорию', 'Change category'], 'task.note': ['Добавить заметку к задаче', 'Add a task note'], 'task.duplicate': ['Скопировать', 'Copy'],
  'task.deepBlock': ['Поставить блок глубокой работы', 'Add a deep-work block'], 'plan.autoSchedule': ['Расставить задачи по окнам', 'Schedule tasks into free windows'], 'plan.moveToFree': ['Перенести в свободное окно', 'Move to a free window'],
  'plan.buffer': ['Добавить буферы между делами', 'Add buffers'], 'arc.oath.set': ['Записать обещание', 'Save the promise'], 'arc.new': ['Начать новый сезон', 'Start a new season'],
  'settings.reminder': ['Поставить напоминание', 'Set the reminder'], 'settings.quiet': ['Включить тихие часы', 'Set quiet hours'], 'account.delete': ['Удалить аккаунт', 'Delete account'], 'profile.name': ['Сменить имя', 'Change the name'],
  'prefs.macro.add': ['Сохранить быструю команду', 'Save the shortcut'], 'wins.add': ['Записать победу', 'Save the win'], 'ritual.create': ['Создать ритуал', 'Create ritual'], 'ritual.edit': ['Изменить ритуал', 'Edit ritual'],
  'template.save': ['Сохранить шаблон', 'Save template'], 'template.apply': ['Применить шаблон', 'Apply template'], 'template.delete': ['Удалить шаблон', 'Delete template'],
  'mood.set': ['Записать настроение', 'Log mood'], 'habit.doneAll': ['Отметить все привычки', 'Mark all habits'], 'task.doneAll': ['Закрыть все задачи', 'Close all tasks'],
};
export function previewOf(p: Parsed, l: 'ru' | 'en'): string {
  const [ru, en] = VERB[p.kind] ?? ['Выполнить', 'Do'];
  const what = [p.slots.title, p.slots.query, p.slots.text].find((x) => typeof x === 'string' && x && x !== 'все') as string | undefined;
  const when = str(p.slots.day) ? ` → ${str(p.slots.day)}${p.slots.time ? ' ' + str(p.slots.time) : ''}` : '';
  return `${l === 'ru' ? ru : en}${what ? ` «${what}»` : ''}${when}?`;
}

