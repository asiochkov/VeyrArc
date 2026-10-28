import { addDays, daysBetween, weekStart } from '../../data/model';
import { nextHoliday } from '../../data/holidays';
import { activeArc } from '../../state/system';
import { rankEntities } from '../nlp/parse/engine';
import { R } from '../reply';
import { conflicts, dayWords, freeSlots, hoursPlanned, lengthOf, slotText } from './calendar';
import { habitsToday, hm, logOf, plural, sortedByTime, taskLine, tasksOf, toMin } from './common';
import { register, type ExecCtx } from './index';
import type { PlanRow } from '../../data/model';

/* WP5.6 — the planner, reading: a day, a week, free windows, conflicts, hours; dates and holidays (catalog 41, 45–47, 52, 138–141, 144–148, 196, 199, 200, 208). */
const WD_RU = ['воскресенье', 'понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота'];
const WD_RU_ACC = ['воскресенье', 'понедельник', 'вторник', 'среду', 'четверг', 'пятницу', 'субботу'];
const MON_RU = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
const dateWords = (iso: string, c: ExecCtx) => { const d = new Date(iso + 'T12:00:00'); return c.ru ? `${d.getDate()} ${MON_RU[d.getMonth()]}` : d.toLocaleDateString('en-US', { month: 'long', day: 'numeric' }); };
const weekdayOf = (iso: string, c: ExecCtx, acc = false) => { const d = new Date(iso + 'T12:00:00'); return c.ru ? (acc ? WD_RU_ACC : WD_RU)[d.getDay()] : d.toLocaleDateString('en-US', { weekday: 'long' }); };
const inPart = (p: PlanRow, part: unknown) => {
  if (!part || !p.starts_at) return !part;
  const m = toMin(hm(p.starts_at));
  return part === 'morning' ? m < 12 * 60 : part === 'day' ? m >= 12 * 60 && m < 17 * 60 : m >= 17 * 60;
};

register('plan.day', (p, c) => {
  const day = typeof p.slots.day === 'string' && p.slots.day ? p.slots.day : c.day;
  const open = sortedByTime(tasksOf(c, day)).filter((t) => inPart(t, p.slots.part));
  const word = dayWords(day, c);
  if (!open.length) {
    const none = p.slots.part ? (c.ru ? `${word} в это время ничего нет` : `Nothing ${word} at that time`) : (c.ru ? `${day === c.day ? 'На сегодня' : day === addDays(c.day, 1) ? 'На завтра' : `На ${dateWords(day, c)}`} в планере пусто` : `Nothing planned ${word}`);
    return R.answer(none, { chips: [{ label: c.ru ? 'Добавить задачу' : 'Add a task', say: c.ru ? 'задача позвонить маме завтра в 15' : 'add task call mom tomorrow at 3 pm' }] });
  }
  const left = open.filter((t) => !t.done);
  const first = left.find((t) => t.starts_at) ?? left[0];
  const say = c.ru
    ? `${day === c.day ? 'Сегодня' : cap(word)} ${open.length} ${plural(open.length, 'дело', 'дела', 'дел')}${left.length && left.length !== open.length ? `, осталось ${left.length}` : ''}.${first ? ` Ближайшее — ${first.title}${first.starts_at ? ` в ${hm(first.starts_at)}` : ''}` : ''}`
    : `${open.length} things ${word}.${first ? ` Next: ${first.title}${first.starts_at ? ` at ${hm(first.starts_at)}` : ''}` : ''}`;
  return R.answer(say, { list: open.map((t) => (t.done ? '✓ ' : '') + taskLine(t)) });
});
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

register('plan.week', (_p, c) => {
  const from = weekStart(c.day);
  const days = Array.from({ length: 7 }, (_, i) => addDays(from, i));
  const rows = days.map((d) => ({ d, n: tasksOf(c, d).filter((t) => !t.done).length, h: hoursPlanned(c, d) }));
  const total = rows.reduce((a, r) => a + r.n, 0);
  const line = (r: (typeof rows)[number]) => `${weekdayOf(r.d, c).slice(0, 2)} ${r.d.slice(8)} — ${r.n ? `${r.n} ${plural(r.n, 'дело', 'дела', 'дел')}${r.h ? `, ${Math.round((r.h / 60) * 10) / 10} ч` : ''}` : c.ru ? 'пусто' : 'free'}`;
  return R.answer(c.ru ? `На этой неделе ${total} ${plural(total, 'дело', 'дела', 'дел')}` : `${total} things this week`, { list: rows.map(line), speech: c.ru ? `На этой неделе ${total} ${plural(total, 'дело', 'дела', 'дел')}. Больше всего — ${weekdayOf([...rows].sort((a, b) => b.n - a.n)[0].d, c, true)}` : `${total} things this week` });
});
register('plan.count', (p, c) => {
  const from = weekStart(c.day), to = addDays(from, 6);
  const rows = tasksOf(c, from, to).filter((t) => !t.done && (!p.slots.query || rankEntities(String(p.slots.query), [t], (x) => x.id, (x) => x.title, 0.6).length));
  const word = p.slots.query ? String(p.slots.query) : c.ru ? 'дел' : 'things';
  return R.answer(c.ru ? `На этой неделе ${rows.length} ${p.slots.query ? word : plural(rows.length, 'дело', 'дела', 'дел')}` : `${rows.length} ${word} this week`, { list: sortedByTime(rows).slice(0, 8).map((t) => `${t.day.slice(8)}.${t.day.slice(5, 7)} ${taskLine(t)}`) });
});
register('plan.freeSlots', (p, c) => {
  const minutes = Number(p.slots.minutes) || 30;
  // «найди день для встречи на два часа»: the nearest days with a big enough window
  if (p.slots.scan) {
    const found: string[] = [];
    for (let i = 0; i < 7 && found.length < 3; i++) { const d = addDays(c.day, i); const s = freeSlots(c, d, minutes)[0]; if (s) found.push(`${dayWords(d, c)}: ${slotText(s)}`); }
    return found.length ? R.answer(c.ru ? `Окна на ${minutes >= 60 ? `${Math.round(minutes / 60 * 10) / 10} ч` : `${minutes} мин`}:` : 'Windows:', { list: found, speech: found.join('. ') }) : R.info(c.ru ? 'В ближайшую неделю такого окна нет' : 'No such window this week');
  }
  const day = typeof p.slots.day === 'string' && p.slots.day ? p.slots.day : c.day;
  const slots = freeSlots(c, day, minutes);
  if (!slots.length) return R.answer(c.ru ? `${cap(dayWords(day, c))} свободных окон нет` : `No free windows ${dayWords(day, c)}`);
  return R.answer(c.ru ? `${cap(dayWords(day, c))} вы свободны: ${slots.slice(0, 3).map(slotText).join(', ')}` : `Free ${dayWords(day, c)}: ${slots.slice(0, 3).map(slotText).join(', ')}`, { list: slots.map(slotText) });
});
register('plan.freest', (_p, c) => {
  const from = weekStart(c.day);
  const rows = Array.from({ length: 7 }, (_, i) => addDays(from, i)).filter((d) => d >= c.day).map((d) => ({ d, h: hoursPlanned(c, d) })).sort((a, b) => a.h - b.h);
  const best = rows[0];
  return best ? R.answer(c.ru ? `Свободнее всего ${weekdayOf(best.d, c, true).replace('воскресенье', 'воскресенье')} (${best.d.slice(8)}.${best.d.slice(5, 7)}): запланировано ${Math.round((best.h / 60) * 10) / 10} ч` : `Freest: ${weekdayOf(best.d, c)} (${Math.round((best.h / 60) * 10) / 10} h planned)`) : R.info(c.ru ? 'На этой неделе дней не осталось' : 'No days left this week');
});
register('plan.conflicts', (p, c) => {
  const from = typeof p.slots.day === 'string' ? p.slots.day : c.day;
  const out: string[] = [];
  for (let i = 0; i < 7; i++) { const d = addDays(from, i); for (const [a, b] of conflicts(c, d)) out.push(`${dayWords(d, c)}: «${a.title}» ${hm(a.starts_at)} и «${b.title}» ${hm(b.starts_at)}`); }
  return out.length ? R.answer(c.ru ? `Пересечений: ${out.length}` : `${out.length} overlaps`, { list: out, speech: out.slice(0, 2).join('. ') }) : R.answer(c.ru ? 'Пересечений на этой неделе нет' : 'No overlaps this week');
});
register('plan.hours', (p, c) => {
  const day = typeof p.slots.day === 'string' && p.slots.day ? p.slots.day : c.day;
  const m = hoursPlanned(c, day);
  return R.answer(c.ru ? `${cap(dayWords(day, c))} запланировано ${Math.round((m / 60) * 10) / 10} ч` : `${Math.round((m / 60) * 10) / 10} h planned ${dayWords(day, c)}`);
});
register('plan.next', (p, c) => {
  const q = typeof p.slots.query === 'string' ? p.slots.query : '';
  if (q) {
    const hit = rankEntities(q, tasksOf(c, c.day, addDays(c.day, 60)).filter((t) => !t.done), (t) => t.id, (t) => t.title, 0.6)[0]?.item;
    if (!hit) return R.error(c.ru ? `Не нашёл «${q}» в планере` : `Couldn’t find “${q}”`);
    return R.answer(c.ru ? `«${hit.title}» — ${dayWords(hit.day, c)}${hit.starts_at ? ` в ${hm(hit.starts_at)}` : ', время не указано'}` : `“${hit.title}” — ${dayWords(hit.day, c)}${hit.starts_at ? ` at ${hm(hit.starts_at)}` : ''}`);
  }
  const nowMin = c.now.getHours() * 60 + c.now.getMinutes();
  const next = [...tasksOf(c, c.day, addDays(c.day, 30))].filter((t) => !t.done && t.starts_at && (t.day > c.day || toMin(hm(t.starts_at)) >= nowMin)).sort((a, b) => (a.day + a.starts_at).localeCompare(b.day + b.starts_at))[0];
  if (!next) return R.answer(c.ru ? 'Ближайших встреч в планере нет' : 'No upcoming events');
  return R.answer(c.ru ? `Ближайшее — «${next.title}» ${dayWords(next.day, c)} в ${hm(next.starts_at)}` : `Next: “${next.title}” ${dayWords(next.day, c)} at ${hm(next.starts_at)}`);
});
register('plan.overdue', (_p, c) => {
  const late = tasksOf(c, addDays(c.day, -30), addDays(c.day, -1)).filter((t) => !t.done);
  if (!late.length) return R.answer(c.ru ? 'Хвостов нет: всё из прошлых дней закрыто' : 'No leftovers from earlier days');
  return R.answer(c.ru ? `Не закрыто со вчера и раньше: ${late.length}` : `${late.length} open from earlier days`, { list: late.slice(0, 8).map((t) => `${t.day.slice(8)}.${t.day.slice(5, 7)} · ${t.title}`), chips: [{ label: c.ru ? 'Перенести на сегодня' : 'Move to today', say: c.ru ? 'перенеси просроченное на сегодня' : 'move overdue to today' }] });
});
register('plan.top', (_p, c) => {
  const top = tasksOf(c, c.day).filter((t) => t.focus && !t.done);
  if (!top.length) return R.answer(c.ru ? 'Главные дела не выбраны. Скажите: «три главных дела на сегодня»' : 'No main tasks yet. Say: “three main tasks for today”');
  return R.answer(c.ru ? `Самое важное сегодня: ${top.map((t) => t.title).join(', ')}` : `Most important today: ${top.map((t) => t.title).join(', ')}`);
});
register('plan.trim', (_p, c) => {
  const day = addDays(c.day, 1);
  const loose = tasksOf(c, day).filter((t) => !t.done && !t.focus && !t.linked_goal_id && !t.linked_habit_id);
  if (!loose.length) return R.answer(c.ru ? 'На завтра убирать нечего: всё связано с целями или главное' : 'Nothing to cut for tomorrow');
  return R.answer(c.ru ? 'Можно убрать из завтрашнего плана — это дела без срока и без связи с целью:' : 'You could drop these:', { list: loose.map((t) => t.title), speech: loose.slice(0, 3).map((t) => t.title).join(', ') });
});
register('list.remaining', (p, c) => {
  const q = typeof p.slots.query === 'string' ? p.slots.query : '';
  if (q) {
    const hits = tasksOf(c, c.day, addDays(c.day, 30)).filter((t) => !t.done && (t.title.toLowerCase().includes(q.toLowerCase().slice(0, 5)) || t.title.toLowerCase().startsWith('купить')));
    const shop = /куп/i.test(q);
    const items = shop ? hits.filter((t) => /^куп/i.test(t.title)) : hits;
    return items.length ? R.answer(c.ru ? `Осталось: ${items.map((t) => t.title.replace(/^купить /i, '')).join(', ')}` : `Left: ${items.map((t) => t.title).join(', ')}`, { list: items.map((t) => t.title) }) : R.answer(c.ru ? 'Ничего не осталось' : 'Nothing left');
  }
  const habits = habitsToday(c).filter((h) => !logOf(c, h.id)?.done), tasks = tasksOf(c, c.day).filter((t) => !t.done);
  if (!habits.length && !tasks.length) return R.answer(c.ru ? 'Всё сделано на сегодня. Отличный день!' : 'All done for today. Great day!');
  return R.answer(c.ru ? `Осталось ${habits.length} ${plural(habits.length, 'привычка', 'привычки', 'привычек')}${tasks.length ? ` и ${tasks.length} ${plural(tasks.length, 'задача', 'задачи', 'задач')}` : ''}${habits[0] ? `. Начните с «${habits[0].name}»` : ''}` : `${habits.length} habits and ${tasks.length} tasks left`, { list: [...habits.map((h) => `○ ${h.name}`), ...tasks.map(taskLine)] });
});

/* ── dates ── */
register('date.diff', (p, c) => {
  if (p.slots.to === 'season') {
    const arc = c.sys ? activeArc(c.sys) : null;
    if (!arc) return R.info(c.ru ? 'Сейчас нет активного сезона' : 'There is no active season');
    const end = addDays(arc.started_on, arc.length_days - 1);
    const left = Math.max(0, daysBetween(c.day, end));
    return R.answer(c.ru ? `До конца сезона ${left} ${plural(left, 'день', 'дня', 'дней')} (${dateWords(end, c)})` : `${left} days until the end of the season`);
  }
  const to = String(p.slots.to ?? '');
  if (!to) return R.error(c.ru ? 'До какой даты?' : 'Until when?');
  const n = daysBetween(c.day, to);
  if (n < 0) return R.info(c.ru ? 'Эта дата уже прошла' : 'That date has passed');
  const label = p.slots.label ? ` до ${p.slots.label}` : '';
  return R.answer(c.ru ? `${n === 0 ? 'Это сегодня' : `${n} ${plural(n, 'день', 'дня', 'дней')}${label || ` до ${dateWords(to, c)}`}`}` : `${n} day${n === 1 ? '' : 's'} until ${dateWords(to, c)}`);
});
register('date.weekday', (p, c) => {
  const d = String(p.slots.date ?? '');
  if (!d) return R.error(c.ru ? 'Какая дата?' : 'Which date?');
  return R.answer(c.ru ? `${dateWords(d, c)} ${d.slice(0, 4)} — ${weekdayOf(d, c)}` : `${dateWords(d, c)} ${d.slice(0, 4)} is a ${weekdayOf(d, c)}`);
});
register('holiday.next', (_p, c) => {
  const { date, h } = nextHoliday(c.day, c.lang);
  return R.answer(c.ru ? `Ближайший праздничный день — ${dateWords(date, c)}, ${h.ru}. Через ${daysBetween(c.day, date)} ${plural(daysBetween(c.day, date), 'день', 'дня', 'дней')}` : `The next holiday is ${dateWords(date, c)}, ${h.en}`);
});
export { lengthOf, WD_RU };
