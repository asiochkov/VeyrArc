import { addDays, daysBetween, DAYS_ALL } from '../../data/model';
import { config } from '../../config';
import { isProPlan, useAuth } from '../../lib/auth';
import { GOAL_HUES } from '../../mock/goals';
import { addGoalStep, appendGoalDiary, createGoal, createHabit, deleteGoalStep, logGoalTask, renameGoalStep, updateGoal } from '../../state/actions';
import type { GoalDb, TaskDb } from '../../state/system';
import { usePrefs } from '../prefs';
import { R } from '../reply';
import { activeHabits, plural } from './common';
import { register, type ExecCtx } from './index';
import { withTarget } from './resolve';
import type { Parsed } from '../nlp/types';
import type { Reply, UndoOp } from './types';

/* WP5.4 — goals and their steps (catalog 29–39, 173, 177–184). Steps are daily: a step is done per day. */
const goalsOf = (c: ExecCtx): GoalDb[] => (c.sys?.goals ?? []).filter((g) => g.status === 'active');
const stepsOf = (c: ExecCtx, goalId: string): TaskDb[] => (c.sys?.tasks ?? []).filter((t) => t.goal_id === goalId).sort((a, b) => a.sort - b.sort);
const doneOn = (c: ExecCtx, goalId: string, day = c.day): string[] => c.sys?.entries.find((e) => e.goal_id === goalId && e.day === day)?.done_task_ids ?? [];
const daysKept = (c: ExecCtx, goalId: string, n = 14) => { let k = 0; for (let i = 0; i < n; i++) if (doneOn(c, goalId, addDays(c.day, -i)).length) k++; return k; };
const dLeft = (g: GoalDb, c: ExecCtx) => (g.deadline ? daysBetween(c.day, g.deadline) : null);
const prio = (g: GoalDb) => usePrefs.getState().goalPriority[g.id] === 'high';
const MONTHS = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];

/** the goal a phrase means; with one active goal and no name, that one */
function goalOf(c: ExecCtx, p: Parsed, run: (g: GoalDb) => Reply): Reply {
  const list = goalsOf(c);
  if (!list.length) return R.info(c.ru ? 'У вас пока нет целей. Скажите: «создай цель накопить на машину»' : 'You have no goals yet. Say: “create a goal save for a car”');
  if (p.slots.query || p.slots.id) return withTarget(c, p, list, (g) => g.title, 'goal', run);
  if (list.length === 1) return run(list[0]);
  return R.ask(c.ru ? 'По какой цели?' : 'Which goal?', { choices: list.slice(0, 4).map((g) => ({ label: g.title, run: () => run(g) })), expect: { windowMs: 8000 } });
}
const no = (c: ExecCtx): Reply => R.info(c.ru ? 'Хорошо, ничего не меняю' : 'Okay, nothing changed');
const yesNo = (c: ExecCtx, say: string, yes: () => Reply): Reply => R.confirm(say, { choices: [{ label: c.ru ? 'Да' : 'Yes', yes: true, run: yes }, { label: c.ru ? 'Нет' : 'No', yes: false, run: () => no(c) }] });
const goalLimit = () => (isProPlan(useAuth.getState().plan) ? Infinity : config.limits.free.goals);
const hue = (c: ExecCtx) => GOAL_HUES[(c.sys?.goals.length ?? 0) % GOAL_HUES.length];
const eom = (month: number, now: Date) => { let y = now.getFullYear(); if (new Date(y, month + 1, 0) < now) y++; const d = new Date(y, month + 1, 0); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

register('goal.add', (p, c) => {
  const title = String(p.slots.title ?? '').trim().slice(0, 80);
  if (!title) return R.error(c.ru ? 'Как назвать цель?' : 'What is the goal?');
  if (goalsOf(c).length >= goalLimit()) return R.error(c.ru ? `Активных целей может быть ${goalLimit()}. Завершите одну из них.` : `You can have ${goalLimit()} active goals. Finish one first.`);
  const id = crypto.randomUUID();
  createGoal({ id, title, hue: hue(c), deadline: null, linkedCoreHabitId: null, steps: [] });
  return R.done(c.ru ? `Создал цель «${title}». Добавьте шаги: «добавь шаг … в цель ${title}»` : `Goal “${title}” created. Add steps: “add a step … to the goal ${title}”`, { undo: [{ t: 'goal.create', id }] });
});
register('goal.addFull', (p, c) => {
  const title = String(p.slots.title ?? '').trim().slice(0, 80);
  if (!title) return R.error(c.ru ? 'Как назвать цель?' : 'What is the goal?');
  if (goalsOf(c).length >= goalLimit()) return R.error(c.ru ? `Активных целей может быть ${goalLimit()}. Завершите одну из них.` : `You can have ${goalLimit()} active goals. Finish one first.`);
  const steps = (Array.isArray(p.slots.steps) ? (p.slots.steps as string[]) : []).map((s) => s.trim()).filter(Boolean).slice(0, 12);
  const deadline = typeof p.slots.day === 'string' ? p.slots.day : null;
  const id = crypto.randomUUID();
  createGoal({ id, title, hue: hue(c), deadline, linkedCoreHabitId: null, steps });
  return R.done(c.ru ? `Создал цель «${title}»${deadline ? ` до ${deadline.slice(8)}.${deadline.slice(5, 7)}` : ''}${steps.length ? ` и ${steps.length} ${plural(steps.length, 'шаг', 'шага', 'шагов')}` : ''}` : `Goal “${title}” created${steps.length ? ` with ${steps.length} steps` : ''}`, { undo: [{ t: 'goal.create', id }] });
});
register('goal.step.add', (p, c) => goalOf(c, { ...p, slots: { ...p.slots, query: p.slots.goal } }, (g) => {
  const text = String(p.slots.text ?? '').trim().slice(0, 80);
  if (!text) return R.error(c.ru ? 'Какой шаг добавить?' : 'Which step?');
  const id = addGoalStep(g.id, text);
  return R.done(c.ru ? `Добавил шаг «${text}» в цель «${g.title}»` : `Added the step “${text}” to “${g.title}”`, { undo: [{ t: 'step.add', id }] });
}));
register('goal.split', (p, c) => goalOf(c, p, (g) => {
  const items = (Array.isArray(p.slots.steps) ? (p.slots.steps as string[]) : []).map((s) => s.trim()).filter(Boolean).slice(0, 12);
  if (!items.length) return R.error(c.ru ? 'Назовите шаги через запятую' : 'Name the steps, separated by commas');
  const ops: UndoOp[] = items.map((t) => ({ t: 'step.add', id: addGoalStep(g.id, t.slice(0, 80)) }));
  return R.done(c.ru ? `Добавил ${items.length} ${plural(items.length, 'шаг', 'шага', 'шагов')} в цель «${g.title}»` : `Added ${items.length} steps to “${g.title}”`, { undo: ops, list: items });
}));

register('goal.next', (p, c) => {
  const pick = (g: GoalDb) => {
    const left = stepsOf(c, g.id).filter((s) => !doneOn(c, g.id).includes(s.id));
    if (!left.length) return R.answer(c.ru ? `По цели «${g.title}» на сегодня всё сделано` : `Everything for “${g.title}” is done today`);
    return R.answer(c.ru ? `Следующий шаг по «${g.title}»: ${left[0].text}` : `Next step for “${g.title}”: ${left[0].text}`, { chips: [{ label: c.ru ? 'Отметить' : 'Mark done', say: c.ru ? `отметь ${left[0].text}` : `mark ${left[0].text}` }] });
  };
  if (!p.slots.query && goalsOf(c).length > 1) {
    const g = [...goalsOf(c)].sort((a, b) => Number(prio(b)) - Number(prio(a)) || (dLeft(a, c) ?? 9999) - (dLeft(b, c) ?? 9999))[0];
    return pick(g);
  }
  return goalOf(c, p, pick);
});
const facts = (g: GoalDb, c: ExecCtx) => {
  const left = dLeft(g, c), kept = daysKept(c, g.id), steps = stepsOf(c, g.id), done = doneOn(c, g.id).length;
  return { left, kept, steps: steps.length, done, pct: Math.round((kept / 14) * 100) };
};
register('goal.progress', (p, c) => goalOf(c, p, (g) => {
  const f = facts(g, c);
  return R.answer(c.ru ? `Цель «${g.title}»: сегодня ${f.done} из ${f.steps} шагов. За 14 дней шаги отмечались в ${f.kept} днях.${f.left != null ? ` До срока ${f.left} ${plural(f.left, 'день', 'дня', 'дней')}.` : ''}` : `Goal “${g.title}”: ${f.done} of ${f.steps} steps today; ${f.kept} of the last 14 days.${f.left != null ? ` ${f.left} days to the deadline.` : ''}`);
}));
register('goal.pace', (p, c) => goalOf(c, p, (g) => {
  const f = facts(g, c);
  if (f.left == null) return R.answer(c.ru ? `У цели «${g.title}» нет срока. За 14 дней шаги отмечались в ${f.kept} днях (${f.pct}%).` : `“${g.title}” has no deadline. Steps were marked on ${f.kept} of the last 14 days (${f.pct}%).`);
  return R.answer(c.ru ? `До срока по «${g.title}» ${f.left} ${plural(f.left, 'день', 'дня', 'дней')}. За последние 14 дней шаги отмечались в ${f.kept} из 14 дней (${f.pct}%).` : `${f.left} days left for “${g.title}”. In the last 14 days steps were marked on ${f.kept} of 14 days (${f.pct}%).`);
}));
register('goal.deadline', (p, c) => goalOf(c, p, (g) => {
  const day = String(p.slots.day ?? '');
  if (!day) return R.error(c.ru ? 'На какую дату срок?' : 'Which date?');
  const prev = { deadline: g.deadline };
  updateGoal(g.id, { deadline: day });
  return R.done(c.ru ? `Срок цели «${g.title}»: ${day.slice(8)}.${day.slice(5, 7)}.${day.slice(0, 4)}` : `Deadline for “${g.title}”: ${day}`, { undo: [{ t: 'goal.patch', id: g.id, prev }] });
}));
register('goal.complete', (p, c) => goalOf(c, p, (g) => {
  const prev = { status: g.status, completed_at: g.completed_at ?? null };
  updateGoal(g.id, { status: 'completed' });
  return R.done(c.ru ? `Цель «${g.title}» завершена. Поздравляю — это большая работа!` : `Goal “${g.title}” completed. Congratulations — that’s real work!`, { undo: [{ t: 'goal.patch', id: g.id, prev }] });
}));
register('goal.rename', (p, c) => goalOf(c, p, (g) => {
  const to = String(p.slots.to ?? '').trim().slice(0, 80);
  if (!to) return R.error(c.ru ? 'Как назвать?' : 'New name?');
  updateGoal(g.id, { title: to });
  return R.done(c.ru ? `Переименовал цель «${g.title}» в «${to}»` : `Renamed “${g.title}” to “${to}”`, { undo: [{ t: 'goal.patch', id: g.id, prev: { title: g.title } }] });
}));
const allSteps = (c: ExecCtx) => goalsOf(c).flatMap((g) => stepsOf(c, g.id));
register('goal.step.rename', (p, c) => withTarget(c, p, allSteps(c), (s) => s.text, 'step', (s) => {
  const to = String(p.slots.to ?? '').trim().slice(0, 80);
  if (!to) return R.error(c.ru ? 'Как назвать шаг?' : 'New name?');
  renameGoalStep(s.id, to);
  return R.done(c.ru ? `Переименовал шаг «${s.text}» в «${to}»` : `Renamed the step “${s.text}” to “${to}”`, { undo: [{ t: 'step.rename', id: s.id, prev: s.text }] });
}));
register('goal.step.delete', (p, c) => withTarget(c, p, allSteps(c), (s) => s.text, 'step', (s) => {
  deleteGoalStep(s.id);
  return R.done(c.ru ? `Удалил шаг «${s.text}»` : `Deleted the step “${s.text}”`, { undo: [{ t: 'step.restore', row: { id: s.id, goal_id: s.goal_id, text: s.text, sort: s.sort } }] });
}));
register('goal.link', (p, c) => goalOf(c, p, (g) => {
  const h = activeHabits(c).filter((x) => x.core).find((x) => String(p.slots.habit ?? '').toLowerCase().slice(0, 4) && x.name.toLowerCase().includes(String(p.slots.habit).toLowerCase().slice(0, 4)));
  if (!h) return R.error(c.ru ? 'Привязать можно только к главной привычке. Какую?' : 'You can link only to a core habit. Which one?', { chips: activeHabits(c).filter((x) => x.core).slice(0, 4).map((x) => ({ label: x.name, say: `привяжи цель ${g.title} к ${x.name}` })) });
  updateGoal(g.id, { linked_core_habit_id: h.id });
  return R.done(c.ru ? `Привязал цель «${g.title}» к «${h.name}»: шаги будут отмечаться вместе с ней` : `Linked “${g.title}” to “${h.name}”: its steps follow that habit`, { undo: [{ t: 'goal.patch', id: g.id, prev: { linked_core_habit_id: g.linked_core_habit_id ?? null } }] });
}));

register('goal.diary.add', (p, c) => goalOf(c, p, (g) => {
  const text = String(p.slots.text ?? '').trim();
  if (!text) return R.error(c.ru ? 'Что записать в дневник?' : 'What should I write?');
  const prev = c.sys?.entries.find((e) => e.goal_id === g.id && e.day === c.day)?.diary ?? null;
  appendGoalDiary(g.id, c.day, text);
  return R.done(c.ru ? `Записал в дневник цели «${g.title}»` : `Added to the diary of “${g.title}”`, { undo: [{ t: 'diary', goalId: g.id, day: c.day, prev }] });
}));
register('goal.diary.read', (p, c) => goalOf(c, p, (g) => {
  const day = typeof p.slots.day === 'string' ? p.slots.day : null;
  const entries = (c.sys?.entries ?? []).filter((e) => e.goal_id === g.id && e.diary && (!day || e.day === day)).sort((a, b) => b.day.localeCompare(a.day));
  const e = entries[0];
  if (!e) return R.info(c.ru ? `В дневнике цели «${g.title}» ${day ? 'за этот день ' : ''}записей нет` : `No diary entries for “${g.title}”`);
  return R.answer(`${e.day.slice(8)}.${e.day.slice(5, 7)}: ${e.diary}`, { speech: (e.diary ?? '').slice(0, 220) });
}));

register('goal.hot', (_p, c) => {
  const hot = goalsOf(c).map((g) => ({ g, left: dLeft(g, c), kept7: daysKept(c, g.id, 7) })).filter((x) => (x.left != null && x.left <= 14) || x.kept7 === 0);
  if (!hot.length) return R.answer(c.ru ? 'Ничего не горит: сроки не близко, и шаги отмечаются' : 'Nothing is burning: no close deadlines, and steps are being marked');
  return R.answer(c.ru ? 'Внимания требуют:' : 'Needs attention:', { list: hot.map((x) => `${x.g.title}${x.left != null && x.left <= 14 ? ` — срок через ${x.left} дн.` : ''}${x.kept7 === 0 ? ' — без отметок 7 дней' : ''}`), speech: hot.slice(0, 3).map((x) => x.g.title).join(', ') });
});
register('goal.stepsLeft', (p, c) => goalOf(c, p, (g) => {
  const left = stepsOf(c, g.id).filter((s) => !doneOn(c, g.id).includes(s.id));
  return R.answer(left.length ? (c.ru ? `В цели «${g.title}» сегодня осталось ${left.length} ${plural(left.length, 'шаг', 'шага', 'шагов')}` : `${left.length} steps left in “${g.title}” today`) : (c.ru ? `В цели «${g.title}» на сегодня всё сделано` : `Everything in “${g.title}” is done today`), { list: left.map((s) => s.text) });
}));
register('goal.markAll', (p, c) => goalOf(c, p, (g) => {
  const left = stepsOf(c, g.id).filter((s) => !doneOn(c, g.id).includes(s.id));
  if (!left.length) return R.info(c.ru ? 'Все шаги уже отмечены' : 'All steps are already done');
  const ops: UndoOp[] = left.map((s) => ({ t: 'goal.task', goalId: g.id, taskId: s.id, day: c.day, prev: false }));
  for (const s of left) logGoalTask(g.id, s.id, true, c.day);
  return R.done(c.ru ? `Отметил ${left.length} ${plural(left.length, 'шаг', 'шага', 'шагов')} цели «${g.title}»` : `Marked ${left.length} steps of “${g.title}”`, { undo: ops });
}));
register('goal.closest', (_p, c) => {
  const x = goalsOf(c).map((g) => { const s = stepsOf(c, g.id); return { g, r: s.length ? doneOn(c, g.id).length / s.length : 0, left: dLeft(g, c) ?? 9999 }; }).sort((a, b) => b.r - a.r || a.left - b.left)[0];
  return x ? R.answer(c.ru ? `Ближе всего к завершению «${x.g.title}»: сегодня ${Math.round(x.r * 100)}% шагов${x.left < 9999 ? `, до срока ${x.left} дн.` : ''}` : `Closest to done: “${x.g.title}” (${Math.round(x.r * 100)}% of today’s steps)`) : R.info(c.ru ? 'Активных целей нет' : 'No active goals');
});
register('goal.stalled', (_p, c) => {
  const st = goalsOf(c).filter((g) => daysKept(c, g.id, 7) === 0);
  return st.length ? R.answer(c.ru ? 'Без движения за неделю:' : 'No movement this week:', { list: st.map((g) => g.title), speech: st.map((g) => g.title).join(', ') }) : R.answer(c.ru ? 'Все цели двигаются: шаги отмечались за последнюю неделю' : 'All goals are moving');
});
register('goal.priority', (p, c) => goalOf(c, p, (g) => {
  const prev = usePrefs.getState().goalPriority;
  const level = p.slots.level === 'normal' ? 'normal' : 'high';
  usePrefs.getState().set({ goalPriority: { ...prev, [g.id]: level } });
  return R.done(c.ru ? `Приоритет цели «${g.title}»: ${level === 'high' ? 'высокий' : 'обычный'}` : `Priority of “${g.title}”: ${level}`, { undo: [{ t: 'prefs', key: 'goalPriority', prev }] });
}));
register('goal.suggestHabit', (p, c) => {
  const title = String(p.slots.title ?? '').trim();
  const times = Math.max(1, Math.min(7, Number(p.slots.times) || 3));
  const MASK: Record<number, number> = { 1: 1, 2: 0b0001010, 3: 0b0010101, 4: 0b0011011, 5: 31, 6: 63, 7: DAYS_ALL };
  const mask = MASK[times];
  const days = ['пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'вс'].filter((_, i) => mask & (1 << i)).join(', ');
  if (!title) return R.error(c.ru ? 'Какую привычку?' : 'Which habit?');
  return yesNo(c, c.ru ? `Создать привычку «${title}» на ${days}?` : `Create the habit “${title}” on ${days}?`, () => {
    const row = createHabit({ id: crypto.randomUUID(), name: title.charAt(0).toUpperCase() + title.slice(1), icon: 'pulse', hue: '#10B981', type: 'binary', target: null, unit: null, minutes: null, days: mask, category: 'body', core: false });
    return R.done(c.ru ? `Создал привычку «${row.name}»: ${days}` : `Created “${row.name}”: ${days}`, { undo: [{ t: 'habit.create', id: row.id }] });
  });
});
register('goal.challenge', (_p, c) => {
  const weak = activeHabits(c).slice(0, 3).map((h) => h.name);
  const steps = weak.length ? weak : [c.ru ? 'Один полезный шаг в день' : 'One useful step a day'];
  return yesNo(c, c.ru ? `Предлагаю челлендж на 7 дней: ${steps.join(', ')}. Создать?` : `A 7-day challenge: ${steps.join(', ')}. Create it?`, () => {
    const id = crypto.randomUUID();
    createGoal({ id, title: c.ru ? 'Челлендж недели' : 'Weekly challenge', hue: hue(c), deadline: addDays(c.day, 7), linkedCoreHabitId: null, steps });
    return R.done(c.ru ? 'Создал цель «Челлендж недели» на 7 дней' : 'Created the “Weekly challenge” goal for 7 days', { undo: [{ t: 'goal.create', id }] });
  });
});
export { MONTHS, eom };
