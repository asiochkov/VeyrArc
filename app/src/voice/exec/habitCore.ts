import { DAYS_ALL } from '../../data/model';
import { HABIT_PALETTE } from '../../mock/tracker';
import { createHabit, logHabit, setEventDone } from '../../state/actions';
import { rankEntities } from '../nlp/parse/engine';
import { R } from '../reply';
import { activeHabits, logOf, markHabit, openHabits, plural, q } from './common';
import { register, execute, type ExecCtx } from './index';
import { openPool } from './planner';
import { withTarget } from './resolve';
import type { Parsed } from '../nlp/types';
import type { Reply, UndoOp } from './types';

/* The everyday commands: mark, unmark, mark everything, add a habit. A phrase names a habit, a task or a quit; the best match wins. */
const ALL = /^(?:все|всё|everything|all|all of it|it all)$/;
const best = (c: ExecCtx, query: string) => {
  const h = rankEntities(query, activeHabits(c), (x) => x.id, (x) => x.name, 0.5)[0];
  const t = rankEntities(query, openPool(c), (x) => x.id, (x) => x.title, 0.5)[0];
  const u = rankEntities(query, c.sys?.quits.filter((x) => !(x as { archived_at?: string | null }).archived_at) ?? [], (x) => x.id, (x) => x.name, 0.62)[0];
  return { h, t, u };
};

register('habit.doneAll', (_p, c) => doneAll(c));
function doneAll(c: ExecCtx): Reply {
  const open = openHabits(c);
  if (!open.length) return R.info(c.ru ? 'Все привычки на сегодня уже отмечены' : 'All habits are already done');
  const ops: UndoOp[] = [];
  for (const h of open) ops.push(...markHabit(c, h, { full: true }).ops);
  return R.done(c.ru ? `Отметил ${open.length} ${plural(open.length, 'привычку', 'привычки', 'привычек')}: ${open.map((h) => h.name).join(', ')}` : `Marked ${open.length} habits`, { undo: ops });
}

register('habit.done', (p, c) => {
  const query = String(p.slots.query ?? '').trim();
  if (ALL.test(query)) return doneAll(c);
  if (typeof p.slots.day === 'string' && p.slots.day !== c.day) return execute({ ...p, kind: 'habit.markPast' } as Parsed, c);
  const { h, t, u } = best(c, query);
  // a quit named on its own is a slip, never logged on a guess: the quit handler asks
  if (u && (!h || u.sim > h.sim) && (!t || u.sim > t.sim)) return execute({ ...p, kind: 'quit.relapse', slots: { ...p.slots, id: u.id } } as Parsed, c);
  if (t && (!h || t.sim > h.sim + 0.05)) {
    return withTarget(c, { ...p, slots: { ...p.slots, id: t.id } }, openPool(c), (x) => x.title, 'task', (task) => {
      setEventDone(task.id, true);
      return R.done(c.ru ? `Вычеркнул: ${task.title}` : `Crossed off: ${task.title}`, { undo: [{ t: 'event.done', id: task.id, prev: false }] });
    });
  }
  if (!h && !query) return R.error(c.ru ? 'Что отметить?' : 'What should I mark?');
  return withTarget(c, p, activeHabits(c), (x) => x.name, 'habit', (habit) => {
    const m = markHabit(c, habit, { amount: typeof p.slots.amount === 'number' ? p.slots.amount : null, minutes: typeof p.slots.minutes === 'number' ? p.slots.minutes : null });
    return m.changed ? R.done(m.text, { undo: m.ops }) : R.info(m.text);
  });
});

register('habit.undone', (p, c) => {
  const query = String(p.slots.query ?? '').trim();
  const { h, t } = best(c, query);
  // «убери X» may be a task to delete rather than a mark to take off
  if (!h || h.sim < 0.62) {
    if (t && t.sim >= 0.88) return execute({ ...p, kind: 'task.delete', slots: { ...p.slots, id: t.id } } as Parsed, c);
  }
  return withTarget(c, p, activeHabits(c), (x) => x.name, 'habit', (habit) => {
    const prev = logOf(c, habit.id);
    if (!prev?.value && !prev?.done) return R.info(c.ru ? `${habit.name} и так не отмечена` : `“${habit.name}” is not marked anyway`);
    logHabit(habit.id, 0, false, c.day);
    return R.done(c.ru ? `Снял отметку: ${habit.name}` : `Unmarked: ${habit.name}`, { undo: [{ t: 'habit.log', habitId: habit.id, day: c.day, prev: { value: prev.value, done: prev.done } }] });
  });
});

register('habit.add', (p, c) => {
  const title = String(p.slots.title ?? '').trim();
  if (!title) return R.error(c.ru ? 'Как назвать привычку?' : 'What should the habit be called?');
  const exist = rankEntities(title, activeHabits(c), (x) => x.id, (x) => x.name, 0.85)[0];
  if (exist) return R.info(c.ru ? `Привычка ${q(exist.item.name)} уже есть` : `“${exist.item.name}” already exists`);
  const list = activeHabits(c), core = list.filter((h) => h.core).length;
  const minutes = typeof p.slots.minutes === 'number' ? p.slots.minutes : null, target = typeof p.slots.target === 'number' ? p.slots.target : null;
  const type = minutes ? 'duration' : target ? 'counter' : 'binary';
  const h = createHabit({
    id: crypto.randomUUID(), name: title.slice(0, 60), icon: 'doc', hue: HABIT_PALETTE[list.length % HABIT_PALETTE.length], type,
    target, unit: null, minutes, days: DAYS_ALL, category: 'body', core: core < 3,
  });
  const what = type === 'counter' ? ` — ${target} в день` : type === 'duration' ? ` — ${minutes} мин в день` : '';
  return R.done(c.ru ? `Добавил привычку ${q(h.name)}${what}${h.core ? ', это Core' : ''}. Каждый день` : `Habit “${h.name}” added${h.core ? ' as a core habit' : ''}`, { undo: [{ t: 'habit.create', id: h.id }] });
});
