import { addDays, daysBetween, type PlanRow } from '../../data/model';
import { deleteEvent, saveEvent, setEventDone } from '../../state/actions';
import { rankEntities } from '../nlp/parse/engine';
import { dialog } from '../dialog/context';
import { usePrefs } from '../prefs';
import { R } from '../reply';
import { conflicts, dayWords, freeSlots, lengthOf, nearestFree, slotText } from './calendar';
import { fromMin, hm, plural, q, sortedByTime, tasksOf, toMin } from './common';
import { register, type ExecCtx } from './index';
import { withTarget } from './resolve';
import type { Parsed } from '../nlp/types';
import type { Reply, UndoOp } from './types';

/* WP5.5 — writing to the planner (catalog 40, 43, 44, 48–51, 53, 133, 142, 143, 149–151, 195, 198, 201, 203–207). Everything goes through saveEvent / deleteEvent / setEventDone. */
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const LIMIT_EVENTS = 30; // a series is at most this many events (decision #24)
const no = (c: ExecCtx): Reply => R.info(c.ru ? 'Хорошо, ничего не меняю' : 'Okay, nothing changed');
const ask = (c: ExecCtx, say: string, yes: () => Reply): Reply => R.confirm(say, { choices: [{ label: c.ru ? 'Да' : 'Yes', yes: true, run: yes }, { label: c.ru ? 'Нет' : 'No', yes: false, run: () => no(c) }] });
const newEvent = (title: string, day: string, start: string | null, end: string | null, extra: Partial<PlanRow> = {}): PlanRow =>
  ({ id: crypto.randomUUID(), title: cap(title).slice(0, 120), day, starts_at: start, ends_at: end, note: null, done: false, category_id: null, ...extra });
const endFor = (start: string | null, minutes = 60) => (start ? fromMin(Math.min(23 * 60 + 59, toMin(start) + minutes)) : null);
/** open tasks near today: the pool a phrase like «перенеси созвон» searches */
export const openPool = (c: ExecCtx) => tasksOf(c, addDays(c.day, -1), addDays(c.day, 60)).filter((p) => !p.done);
const pickTask = (c: ExecCtx, p: Parsed, run: (t: PlanRow) => Reply, pool = openPool(c)) =>
  withTarget(c, p, [...pool].sort((a, b) => Number(b.day === c.day) - Number(a.day === c.day)), (t) => t.title, 'task', run);

/* ── adding ── */
register('task.add', (p, c) => {
  const title = String(p.slots.title ?? '').trim();
  if (!title) return R.error(c.ru ? 'Что добавить?' : 'What should I add?');
  const day = String(p.slots.day || c.day);
  const start = typeof p.slots.time === 'string' && p.slots.time ? p.slots.time : null;
  const end = typeof p.slots.end === 'string' && p.slots.end ? p.slots.end : endFor(start);
  const ev = newEvent(title, day, start, end);
  const clash = start ? tasksOf(c, day).find((x) => !x.done && x.starts_at && toMin(hm(x.starts_at)) < toMin(end!) && toMin(hm(x.ends_at ?? x.starts_at)) > toMin(start)) : undefined;
  const past = day === c.day && start && toMin(start) < c.now.getHours() * 60 + c.now.getMinutes() - 5;
  const limit = usePrefs.getState().dailyLimit;
  const over = limit && tasksOf(c, day).filter((x) => !x.done).length >= limit;
  saveEvent(ev, true);
  const when = dayWords(day, c);
  const say = (c.ru ? `Добавил «${ev.title}» ${when}${start ? ` в ${start}${p.slots.end ? `–${p.slots.end}` : ''}` : ''}` : `Added “${ev.title}” ${when}${start ? ` at ${start}` : ''}`)
    + (clash ? (c.ru ? `. В это время уже «${clash.title}»` : `. Overlaps “${clash.title}”`) : '')
    + (past ? (c.ru ? '. Это время уже прошло — если нужно на завтра, скажите «перенеси на завтра»' : '. That time has passed') : '')
    + (over ? (c.ru ? `. Дел на этот день уже больше ${limit} — может, что-то перенести?` : `. That is over your limit of ${limit} for the day`) : '');
  return R.done(say, { undo: [{ t: 'event.delete', id: ev.id }] });
});
register('task.addMany', (p, c) => {
  const items = (Array.isArray(p.slots.items) ? p.slots.items : []) as { title: string; time?: string; day?: string }[];
  if (!items.length) return R.error(c.ru ? 'Назовите дела через запятую' : 'Name the tasks, separated by commas');
  const day = String(p.slots.day || c.day);
  const evs = items.slice(0, LIMIT_EVENTS).map((it) => newEvent(it.title, it.day || day, it.time ?? null, it.time ? endFor(it.time) : null));
  for (const ev of evs) saveEvent(ev, true);
  return R.done(c.ru ? `Добавил ${evs.length} ${plural(evs.length, 'задачу', 'задачи', 'задач')} ${dayWords(day, c)}` : `Added ${evs.length} tasks ${dayWords(day, c)}`, { undo: evs.map((e) => ({ t: 'event.delete', id: e.id }) as UndoOp), list: evs.map((e) => `${e.starts_at ? e.starts_at + ' · ' : ''}${e.title}`) });
});

/* ── series: «каждый понедельник в десять созвон» ── */
export type Recur = { freq: 'daily' | 'weekdays' | 'weekly' | 'biweekly' | 'monthly'; days?: number; dom?: number };
export function expandSeries(r: Recur, from: string): string[] {
  const out: string[] = [];
  const wd = (d: string) => (new Date(d + 'T12:00:00').getDay() + 6) % 7;
  const horizon = r.freq === 'daily' || r.freq === 'weekdays' ? 28 : r.freq === 'weekly' ? 56 : r.freq === 'biweekly' ? 112 : 366;
  for (let i = 0; i <= horizon && out.length < LIMIT_EVENTS; i++) {
    const d = addDays(from, i);
    const w = wd(d);
    if (r.freq === 'daily') out.push(d);
    else if (r.freq === 'weekdays' && w < 5) out.push(d);
    else if (r.freq === 'weekly' && (r.days ?? 0) & (1 << w)) out.push(d);
    else if (r.freq === 'biweekly' && (r.days ?? 0) & (1 << w) && Math.floor(i / 7) % 2 === 0) out.push(d);
    else if (r.freq === 'monthly' && Number(d.slice(8)) === r.dom && out.length < 12) out.push(d);
  }
  return out;
}
register('task.addRecurring', (p, c) => {
  const title = String(p.slots.title ?? '').trim();
  const rule = p.slots.rule as Recur | undefined;
  if (!title || !rule) return R.error(c.ru ? 'Не понял, как часто повторять' : 'I did not get how often');
  const days = expandSeries(rule, c.day);
  if (!days.length) return R.error(c.ru ? 'По этому правилу нет ближайших дат' : 'No upcoming dates for that rule');
  const start = typeof p.slots.time === 'string' && p.slots.time ? p.slots.time : null;
  const mins = Number(p.slots.minutes) || 60;
  const evs = days.map((d) => newEvent(title, d, start, endFor(start, mins)));
  const run = () => { for (const ev of evs) saveEvent(ev, true); return R.done(c.ru ? `Создал серию: «${cap(title)}» — ${evs.length} ${plural(evs.length, 'раз', 'раза', 'раз')}, до ${days[days.length - 1].slice(8)}.${days[days.length - 1].slice(5, 7)}` : `Series created: “${cap(title)}” × ${evs.length}`, { undo: evs.map((e) => ({ t: 'event.delete', id: e.id }) as UndoOp) }); };
  return evs.length > 8 ? ask(c, c.ru ? `Создать ${evs.length} событий «${cap(title)}»?` : `Create ${evs.length} events “${cap(title)}”?`, run) : run();
});
register('task.deleteSeries', (p, c) => {
  const query = String(p.slots.query ?? '');
  const hits = rankEntities(query, tasksOf(c, c.day, addDays(c.day, 365)).filter((t) => !t.done), (t) => t.id, (t) => t.title, 0.7);
  if (!hits.length) return R.error(c.ru ? `Не нашёл будущих «${query}»` : `No upcoming “${query}”`);
  const first = hits[0].item;
  const same = hits.filter((h) => h.sim >= 0.9 && h.item.starts_at === first.starts_at).map((h) => h.item);
  return ask(c, c.ru ? `Нашёл ${same.length} ${plural(same.length, 'событие', 'события', 'событий')} «${first.title}». Удалить все?` : `Found ${same.length} events “${first.title}”. Delete all?`, () => {
    for (const e of same) deleteEvent(e.id);
    return R.done(c.ru ? `Удалил ${same.length}` : `Deleted ${same.length}`, { undo: same.map((e) => ({ t: 'event.save', row: e, wasNew: true }) as UndoOp) });
  });
});

/* ── moving, deleting, changing ── */
register('task.move', (p, c) => pickTask(c, p, (t) => {
  const day = typeof p.slots.day === 'string' && p.slots.day ? p.slots.day : t.day;
  const time = typeof p.slots.time === 'string' && p.slots.time ? p.slots.time : t.starts_at;
  const len = lengthOf(t);
  const next: PlanRow = { ...t, day, starts_at: time, ends_at: time ? (typeof p.slots.time === 'string' && p.slots.time ? endFor(time, len) : t.ends_at) : null };
  saveEvent(next, false);
  return R.done(c.ru ? `Перенёс «${t.title}» ${dayWords(day, c)}${time && p.slots.time ? ` на ${time}` : ''}` : `Moved “${t.title}” ${dayWords(day, c)}${time && p.slots.time ? ` to ${time}` : ''}`, { undo: [{ t: 'event.save', row: t, wasNew: false }] });
}));
register('task.moveBulk', (p, c) => {
  const day = typeof p.slots.day === 'string' && p.slots.day ? p.slots.day : addDays(c.day, 1);
  const shift = Number(p.slots.shiftMin) || 0;
  let pool = tasksOf(c, c.day).filter((t) => !t.done);
  if (p.slots.query) pool = rankEntities(String(p.slots.query), tasksOf(c, c.day, addDays(c.day, 30)).filter((t) => !t.done), (t) => t.id, (t) => t.title, 0.7).map((h) => h.item);
  if (p.slots.part) pool = pool.filter((t) => t.starts_at && toMin(hm(t.starts_at)) >= (p.slots.part === 'evening' ? 17 * 60 : p.slots.part === 'morning' ? 0 : 12 * 60) && (p.slots.part !== 'morning' || toMin(hm(t.starts_at)) < 12 * 60));
  if (shift) { const after = typeof p.slots.after === 'string' ? toMin(p.slots.after) : 0; pool = pool.filter((t) => t.starts_at && toMin(hm(t.starts_at)) >= after); }
  if (!pool.length) return R.info(c.ru ? 'Переносить нечего' : 'Nothing to move');
  const ops: UndoOp[] = pool.map((t) => ({ t: 'event.save', row: t, wasNew: false }));
  const go = () => {
    for (const t of pool) {
      const s = t.starts_at && shift ? fromMin(Math.max(0, Math.min(23 * 60 + 59, toMin(hm(t.starts_at)) + shift))) : t.starts_at;
      saveEvent({ ...t, day: shift ? t.day : day, starts_at: s, ends_at: t.ends_at && shift ? fromMin(Math.min(23 * 60 + 59, toMin(hm(t.ends_at)) + shift)) : t.ends_at }, false);
    }
    return R.done(shift ? (c.ru ? `Сдвинул ${pool.length} ${plural(pool.length, 'дело', 'дела', 'дел')} на ${Math.abs(shift)} мин ${shift > 0 ? 'позже' : 'раньше'}` : `Shifted ${pool.length} tasks by ${shift} min`) : (c.ru ? `Перенёс ${pool.length} ${plural(pool.length, 'задачу', 'задачи', 'задач')} ${dayWords(day, c)}. Сегодня — только главное` : `Moved ${pool.length} tasks ${dayWords(day, c)}`), { undo: ops });
  };
  // the decision layer has already asked: a group is always confirmed there
  return go();
});
register('task.delete', (p, c) => {
  if (p.slots.all) {
    const pool = tasksOf(c, c.day).filter((t) => !t.done);
    if (!pool.length) return R.info(c.ru ? 'На сегодня нет задач' : 'No tasks today');
    for (const t of pool) deleteEvent(t.id);
    return R.done(c.ru ? `Удалил ${pool.length}` : `Deleted ${pool.length}`, { undo: pool.map((t) => ({ t: 'event.save', row: t, wasNew: true }) as UndoOp) });
  }
  // the decision layer has asked already (a deletion is always confirmed there)
  return pickTask(c, p, (t) => { deleteEvent(t.id); return R.done(c.ru ? `Удалил «${t.title}»` : `Deleted “${t.title}”`, { undo: [{ t: 'event.save', row: t, wasNew: true }] }); });
});
register('task.duration', (p, c) => pickTask(c, p, (t) => {
  const m = Number(p.slots.minutes);
  if (!m) return R.error(c.ru ? 'На сколько изменить?' : 'By how much?');
  if (!t.starts_at) return R.info(c.ru ? `У «${t.title}» нет времени, длительность не меняется` : `“${t.title}” has no time`);
  const len = Math.max(15, lengthOf(t) + (p.slots.shorten ? -m : m));
  saveEvent({ ...t, ends_at: endFor(hm(t.starts_at), len) }, false);
  return R.done(c.ru ? `«${t.title}» теперь ${len} мин: до ${endFor(hm(t.starts_at), len)}` : `“${t.title}” is now ${len} min`, { undo: [{ t: 'event.save', row: t, wasNew: false }] });
}));
register('task.category', (p, c) => pickTask(c, p, (t) => {
  const word = String(p.slots.category ?? '').toLowerCase();
  const key = /раб|work/.test(word) ? 'work' : /встреч|meeting/.test(word) ? 'meeting' : /срок|дедлайн|deadline/.test(word) ? 'deadline' : /обзор|review/.test(word) ? 'review' : '';
  const cat = c.sys?.cats.find((x) => x.key === key);
  if (!cat) return R.error(c.ru ? 'Не нашёл такую категорию. Есть: работа, встреча, срок, обзор' : 'No such category: work, meeting, deadline, review');
  saveEvent({ ...t, category_id: cat.id }, false);
  return R.done(c.ru ? `Категория «${t.title}»: ${word}` : `Category of “${t.title}”: ${word}`, { undo: [{ t: 'event.save', row: t, wasNew: false }] });
}));
register('task.note', (p, c) => pickTask(c, p, (t) => {
  const text = String(p.slots.text ?? '').trim();
  if (!text) return R.error(c.ru ? 'Что записать в заметку?' : 'What should the note say?');
  saveEvent({ ...t, note: (t.note ? `${t.note}\n${text}` : text).slice(0, 500) }, false);
  return R.done(c.ru ? `Дописал заметку к «${t.title}»` : `Added a note to “${t.title}”`, { undo: [{ t: 'event.save', row: t, wasNew: false }] });
}, tasksOf(c, addDays(c.day, -3), addDays(c.day, 60))));

/* ── closing ── */
register('task.doneAll', (_p, c) => {
  const pool = tasksOf(c, c.day).filter((t) => !t.done);
  if (!pool.length) return R.info(c.ru ? 'Все задачи на сегодня уже закрыты' : 'All of today’s tasks are already done');
  const go = () => { for (const t of pool) setEventDone(t.id, true); return R.done(c.ru ? `Закрыл ${pool.length} ${plural(pool.length, 'задачу', 'задачи', 'задач')}` : `Closed ${pool.length} tasks`, { undo: pool.map((t) => ({ t: 'event.done', id: t.id, prev: false }) as UndoOp) }); };
  return pool.length > 3 ? ask(c, c.ru ? `Закрыть все задачи на сегодня (${pool.length})?` : `Close all ${pool.length} tasks for today?`, go) : go();
});
register('task.doneMany', (p, c) => {
  const items = (Array.isArray(p.slots.items) ? p.slots.items : []) as string[];
  const pool = tasksOf(c, c.day, addDays(c.day, 7)).filter((t) => !t.done);
  const found: PlanRow[] = [], missing: string[] = [];
  for (const it of items) { const h = rankEntities(it, pool, (t) => t.id, (t) => t.title, 0.7)[0]; if (h && !found.includes(h.item)) found.push(h.item); else if (!h) missing.push(it); }
  if (!found.length) return R.error(c.ru ? `Не нашёл среди задач: ${items.join(', ')}` : `Couldn’t find: ${items.join(', ')}`);
  for (const t of found) setEventDone(t.id, true);
  return R.done(c.ru ? `Вычеркнул: ${found.map((t) => t.title).join(', ')}${missing.length ? `. Не нашёл: ${missing.join(', ')}` : ''}` : `Crossed off: ${found.map((t) => t.title).join(', ')}`, { undo: found.map((t) => ({ t: 'event.done', id: t.id, prev: false }) as UndoOp) });
});
register('task.done', (p, c) => pickTask(c, p, (t) => { setEventDone(t.id, true); return R.done(c.ru ? `Выполнено: ${t.title}` : `Done: ${t.title}`, { undo: [{ t: 'event.done', id: t.id, prev: false }] }); }));

/* ── copying ── */
register('task.duplicate', (p, c) => {
  const day = typeof p.slots.day === 'string' && p.slots.day ? p.slots.day : addDays(c.day, 1);
  // «скопируй вчерашний план на сегодня»: a whole day
  if (p.slots.from) {
    const from = String(p.slots.from);
    const src = tasksOf(c, from).filter((t) => !p.slots.undoneOnly || !t.done);
    if (!src.length) return R.info(c.ru ? 'В том дне нет задач' : 'That day has no tasks');
    const copies = src.map((t) => newEvent(t.title, day, t.starts_at, t.ends_at, { note: t.note, category_id: t.category_id, focus: t.focus }));
    const go = () => { for (const e of copies) saveEvent(e, true); return R.done(c.ru ? `Скопировал ${copies.length} ${plural(copies.length, 'задачу', 'задачи', 'задач')} на ${dayWords(day, c)}` : `Copied ${copies.length} tasks to ${dayWords(day, c)}`, { undo: copies.map((e) => ({ t: 'event.delete', id: e.id }) as UndoOp) }); };
    return copies.length > 3 ? ask(c, c.ru ? `Скопировать ${copies.length} задач на ${dayWords(day, c)}?` : `Copy ${copies.length} tasks to ${dayWords(day, c)}?`, go) : go();
  }
  const pool = tasksOf(c, addDays(c.day, -7), addDays(c.day, 30));
  const last = p.slots.query ? undefined : sortedByTime(tasksOf(c, c.day)).slice(-1)[0];
  const doIt = (t: PlanRow) => { const e = newEvent(t.title, day, t.starts_at, t.ends_at, { note: t.note, category_id: t.category_id, focus: t.focus }); saveEvent(e, true); return R.done(c.ru ? `Повторил «${t.title}» на ${dayWords(day, c)}` : `Repeated “${t.title}” for ${dayWords(day, c)}`, { undo: [{ t: 'event.delete', id: e.id }] }); };
  return last ? doIt(last) : pickTask(c, p, doIt, pool);
});

/* ── priorities ── */
register('task.top3', (p, c) => {
  const items = (Array.isArray(p.slots.items) ? p.slots.items : []) as string[];
  const pool = tasksOf(c, c.day).filter((t) => !t.done);
  let chosen: PlanRow[] = [];
  if (items.length) for (const it of items) { const h = rankEntities(it, pool, (t) => t.id, (t) => t.title, 0.7)[0]; if (h && !chosen.includes(h.item)) chosen.push(h.item); }
  else chosen = sortedByTime(pool).filter((t) => !t.focus).slice(0, 3);
  if (!chosen.length) return R.info(c.ru ? 'Сегодня нет задач, которые можно сделать главными' : 'No tasks to make main');
  const go = () => { for (const t of chosen) saveEvent({ ...t, focus: true }, false); return R.done(c.ru ? `Главные дела на сегодня: ${chosen.map((t) => t.title).join(', ')}` : `Main tasks today: ${chosen.map((t) => t.title).join(', ')}`, { undo: chosen.map((t) => ({ t: 'event.save', row: t, wasNew: false }) as UndoOp) }); };
  return items.length ? go() : ask(c, c.ru ? `Сделать главными: ${chosen.map((t) => t.title).join(', ')}?` : `Make these main: ${chosen.map((t) => t.title).join(', ')}?`, go);
});
register('task.deepBlock', (p, c) => {
  const day = typeof p.slots.day === 'string' && p.slots.day ? p.slots.day : addDays(c.day, 1);
  const minutes = Number(p.slots.minutes) || 120;
  const start = typeof p.slots.time === 'string' && p.slots.time ? p.slots.time : fromMin(freeSlots(c, day, minutes)[0]?.from ?? 9 * 60);
  const ev = newEvent(c.ru ? 'Глубокая работа' : 'Deep work', day, start, endFor(start, minutes), { focus: true });
  saveEvent(ev, true);
  return R.done(c.ru ? `Поставил блок глубокой работы ${dayWords(day, c)} с ${start} до ${ev.ends_at}` : `Deep work block ${dayWords(day, c)} ${start}–${ev.ends_at}`, { undo: [{ t: 'event.delete', id: ev.id }] });
});
register('plan.limit', (p, c) => {
  const n = Math.round(Number(p.slots.n));
  if (!n || n < 1 || n > 50) return R.error(c.ru ? 'Сколько дел в день?' : 'How many tasks a day?');
  const prev = usePrefs.getState().dailyLimit;
  usePrefs.getState().set({ dailyLimit: n });
  return R.done(c.ru ? `Хорошо: не больше ${n} дел в день. Предупрежу, если станет больше` : `Okay: no more than ${n} tasks a day. I’ll warn you`, { undo: [{ t: 'prefs', key: 'dailyLimit', prev }] });
});

/* ── planning: windows, auto-schedule, buffers ── */
register('plan.autoSchedule', (_p, c) => {
  const todo = tasksOf(c, c.day).filter((t) => !t.done && !t.starts_at);
  if (!todo.length) return R.info(c.ru ? 'Нет задач без времени — планировать нечего' : 'No tasks without a time to plan');
  const slots = freeSlots(c, c.day, 30).map((s) => ({ ...s }));
  const plan: { t: PlanRow; from: number }[] = [];
  for (const t of todo) {
    const s = slots.find((x) => x.to - x.from >= 30);
    if (!s) break;
    plan.push({ t, from: s.from });
    s.from += 30;
  }
  if (!plan.length) return R.info(c.ru ? 'Сегодня не осталось свободных окон' : 'No free windows left today');
  return ask(c, c.ru ? `Поставлю: ${plan.map((x) => `${fromMin(x.from)} — ${x.t.title}`).join('; ')}. Согласны?` : `I’ll set: ${plan.map((x) => `${fromMin(x.from)} ${x.t.title}`).join('; ')}. OK?`, () => {
    for (const x of plan) saveEvent({ ...x.t, starts_at: fromMin(x.from), ends_at: fromMin(x.from + 30) }, false);
    return R.done(c.ru ? `Расставил ${plan.length} ${plural(plan.length, 'задачу', 'задачи', 'задач')} по окнам` : `Scheduled ${plan.length} tasks`, { undo: plan.map((x) => ({ t: 'event.save', row: x.t, wasNew: false }) as UndoOp) });
  });
});
/** «перенеси на ближайшее свободное окно» names no task: it is the one just touched, or ask which of today's */
const orLast = (_c: ExecCtx, p: Parsed): Parsed => {
  if (p.slots.query || p.slots.id) return p;
  const last = dialog.get().last.task;
  return last ? { ...p, slots: { ...p.slots, query: last.name, id: last.id } } : p;
};
register('plan.moveToFree', (p0, c) => { const p = orLast(c, p0); if (!p.slots.query && !p.slots.id) { const open = tasksOf(c, c.day).filter((t) => !t.done); return open.length ? R.ask(c.ru ? 'Какое дело перенести?' : 'Which one?', { choices: open.slice(0, 4).map((t) => ({ label: t.title, run: () => register2(c, t) })), expect: { windowMs: 8000 } }) : R.info(c.ru ? 'Сегодня нечего переносить' : 'Nothing to move'); } return pickTask(c, p, (t) => register2(c, t)); });
function register2(c: ExecCtx, t: PlanRow): Reply {
  const len = lengthOf(t);
  const f = nearestFree(c, len, 7, t.id);
  if (!f) return R.info(c.ru ? 'В ближайшую неделю нет свободного окна' : 'No free window in the next week');
  const start = fromMin(f.slot.from);
  saveEvent({ ...t, day: f.day, starts_at: start, ends_at: endFor(start, len) }, false);
  return R.done(c.ru ? `Перенёс «${t.title}» на ${dayWords(f.day, c)} в ${start}` : `Moved “${t.title}” to ${dayWords(f.day, c)} at ${start}`, { undo: [{ t: 'event.save', row: t, wasNew: false }] });
}
register('plan.buffer', (p, c) => {
  const gap = Math.max(5, Math.min(60, Number(p.slots.minutes) || 15));
  const day = typeof p.slots.day === 'string' && p.slots.day ? p.slots.day : c.day;
  const ev = tasksOf(c, day).filter((t) => t.starts_at && !t.done).sort((a, b) => a.starts_at!.localeCompare(b.starts_at!));
  const moves: { row: PlanRow; start: number }[] = [];
  let prevEnd = -1;
  for (const e of ev) {
    let s = toMin(hm(e.starts_at)); const len = lengthOf(e);
    if (prevEnd >= 0 && s < prevEnd + gap) s = prevEnd + gap;
    if (s !== toMin(hm(e.starts_at))) moves.push({ row: e, start: s });
    prevEnd = s + len;
  }
  if (!moves.length) return R.info(c.ru ? `Между встречами уже есть хотя бы ${gap} минут` : `There are already ${gap} minutes between events`);
  return ask(c, c.ru ? `Сдвинуть ${moves.length} ${plural(moves.length, 'дело', 'дела', 'дел')}, чтобы между ними было ${gap} минут?` : `Shift ${moves.length} events to leave ${gap} minutes between them?`, () => {
    for (const m of moves) saveEvent({ ...m.row, starts_at: fromMin(m.start), ends_at: endFor(fromMin(m.start), lengthOf(m.row)) }, false);
    return R.done(c.ru ? `Сдвинул ${moves.length}: между делами теперь ${gap} минут` : `Shifted ${moves.length}`, { undo: moves.map((m) => ({ t: 'event.save', row: m.row, wasNew: false }) as UndoOp) });
  });
});
export { conflicts, slotText, q, daysBetween };
