import { addDays, daysBetween } from '../../data/model';
import { addQuit, archiveQuit, logRelapse, takeRelapseOp, updateQuit } from '../../state/actions';
import { R } from '../reply';
import { plural } from './common';
import { register, type ExecCtx } from './index';
import { withTarget } from './resolve';
import type { QuitRow } from '../../data/model';
import type { Parsed } from '../nlp/types';
import type { Reply, UndoOp } from './types';

/* WP5.3 — quits: adding, counting days, a slip with kindness, goals, archive (catalog 22–28, 165). */
const KNOWN: [RegExp, string, string | null][] = [
  [/кур|сигарет|smok|cigarette/, 'Курение', 'сигарет'], [/сладк|sweet|sugar|сахар/, 'Сладкое', null], [/кофе|coffee/, 'Кофе', 'чашек'], [/алкогол|пить|пива|вина|alcohol|drink/, 'Алкоголь', 'бокалов'],
  [/соцсет|social/, 'Соцсети', null], [/фастфуд|fast ?food/, 'Фастфуд', null],
];
export const quitName = (title: string): { name: string; unit: string | null } => {
  const t = title.toLowerCase();
  for (const [re, name, unit] of KNOWN) if (re.test(t)) return { name, unit };
  return { name: title.charAt(0).toUpperCase() + title.slice(1), unit: null };
};
const iso = (day: string) => { const [y, m, d] = day.split('-').map(Number); return new Date(y, m - 1, d).toISOString(); };
const daysClean = (q: QuitRow, c: ExecCtx) => Math.max(0, daysBetween(q.clean_since.slice(0, 10), c.day));
const quitsOf = (c: ExecCtx) => c.sys?.quits ?? [];

/** the quit a phrase means; with one quit and no name it is that one, with several and no name it asks */
function quitOf(c: ExecCtx, p: Parsed, run: (q: QuitRow) => Reply): Reply {
  const list = quitsOf(c);
  if (!list.length) return R.info(c.ru ? 'У вас пока нет отказов. Скажите: «хочу бросить курить» или «добавь отказ от сладкого»' : 'You have no quits yet. Say: “I want to quit smoking”');
  if (p.slots.query || p.slots.id) return withTarget(c, p, list, (q) => q.name, 'quit', run);
  if (list.length === 1) return run(list[0]);
  return R.ask(c.ru ? 'По какому отказу?' : 'Which quit?', { choices: list.slice(0, 4).map((q) => ({ label: q.name, run: () => run(q) })), expect: { windowMs: 8000 } });
}

register('quit.add', (p, c) => {
  const raw = String(p.slots.title ?? '').trim();
  if (!raw) return R.error(c.ru ? 'От чего отказываемся?' : 'What are you quitting?');
  const { name, unit } = quitName(raw);
  if (quitsOf(c).some((q) => q.name.toLowerCase() === name.toLowerCase())) return R.info(c.ru ? `Отказ «${name}» уже есть` : `“${name}” is already there`);
  const since = typeof p.slots.since === 'string' ? p.slots.since : c.day;
  const id = crypto.randomUUID();
  addQuit({ id, name, hue: '#D96A5B', icon: 'ban', unit, per_day: 1, clean_since: iso(since) });
  return R.done(since === c.day ? (c.ru ? `Записал отказ: ${name}. Отсчёт идёт с сегодняшнего дня` : `Quit added: ${name}. The count starts today`) : (c.ru ? `Записал отказ: ${name}. Отсчёт с ${since.slice(8)}.${since.slice(5, 7)}` : `Quit added: ${name}, counting from ${since}`), { undo: [{ t: 'quit.add', id }] });
});
register('quit.days', (p, c) => quitOf(c, p, (q) => {
  const n = daysClean(q, c), goal = q.goal_days;
  const best = Math.max(q.best_days, n);
  return R.answer(c.ru ? `${q.name}: ${n} ${plural(n, 'день', 'дня', 'дней')} без срыва. Лучший результат — ${best}${goal ? `. До цели в ${goal} дней осталось ${Math.max(0, goal - n)}` : ''}` : `${q.name}: ${n} days clean. Best: ${best}${goal ? `. ${Math.max(0, goal - n)} days to your goal of ${goal}` : ''}`);
}));
register('quit.avoided', (p, c) => quitOf(c, p, (q) => {
  const n = daysClean(q, c) * (q.per_day || 1);
  return R.answer(c.ru ? `За ${daysClean(q, c)} ${plural(daysClean(q, c), 'день', 'дня', 'дней')} по вашей норме — это ${n}${q.unit ? ' ' + q.unit : ''}, которых не было` : `Over ${daysClean(q, c)} days at your daily rate that is ${n}${q.unit ? ' ' + q.unit : ''} avoided`);
}));
register('quit.goal', (p, c) => quitOf(c, p, (q) => {
  const d = Math.round(Number(p.slots.days));
  if (!d || d < 1 || d > 3650) return R.error(c.ru ? 'На сколько дней цель?' : 'How many days?');
  const prev = { goal_days: q.goal_days };
  updateQuit(q.id, { goal_days: d });
  return R.done(c.ru ? `Цель по отказу «${q.name}»: ${d} ${plural(d, 'день', 'дня', 'дней')}` : `Goal for “${q.name}”: ${d} days`, { undo: [{ t: 'quit.patch', id: q.id, prev }] });
}));
register('quit.relapse', (p, c) => quitOf(c, p, (q) => {
  const note = typeof p.slots.note === 'string' ? p.slots.note : '';
  const best = Math.max(q.best_days, daysClean(q, c));
  logRelapse(q.id, note);
  const op = takeRelapseOp();
  const ops: UndoOp[] = op ? [{ t: 'relapse.undo', ...op }] : [];
  return R.done(c.ru ? `Записал. Лучший результат — ${best} ${plural(best, 'день', 'дня', 'дней')} — остаётся с вами. Один шаг на сегодня: просто начните отсчёт заново. Это часть пути` : `Logged. Your best of ${best} days stays with you. One step for today: start the count again. It’s part of the way`, { undo: ops });
}));
register('quit.archive', (p, c) => quitOf(c, p, (q) => {
  archiveQuit(q.id, true);
  return R.done(c.ru ? `Убрал отказ «${q.name}» в архив` : `Archived “${q.name}”`, { undo: [{ t: 'quit.archive', id: q.id, prev: false, row: q }] });
}));
register('quit.when', (p, c) => quitOf(c, p, (q) => {
  const rel = (c.sys?.relapses ?? []).filter((r) => r.quit_id === q.id);
  if (rel.length < 3) return R.info(c.ru ? 'Пока мало срывов для закономерности: нужно хотя бы три записи' : 'Too few slips to see a pattern: I need at least three');
  const wd = Array(7).fill(0), hr = Array(24).fill(0);
  for (const r of rel) { const d = new Date(r.at); wd[(d.getDay() + 6) % 7]++; hr[d.getHours()]++; }
  const w = wd.indexOf(Math.max(...wd)), h = hr.indexOf(Math.max(...hr));
  const names = c.ru ? ['понедельникам', 'вторникам', 'средам', 'четвергам', 'пятницам', 'субботам', 'воскресеньям'] : ['Mondays', 'Tuesdays', 'Wednesdays', 'Thursdays', 'Fridays', 'Saturdays', 'Sundays'];
  return R.answer(c.ru ? `Срывы по «${q.name}» чаще всего по ${names[w]}, около ${String(h).padStart(2, '0')}:00. Это подсказка, когда быть внимательнее` : `Slips for “${q.name}” cluster on ${names[w]} around ${String(h).padStart(2, '0')}:00. A hint for when to be careful`);
}));

export { addDays };
