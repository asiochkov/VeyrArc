import { addDays, type HabitRowDb } from '../../data/model';
import { createHabit, logHabit, logMood, logWater, saveDayNote } from '../../state/actions';
import { rankEntities } from '../nlp/parse/engine';
import { R } from '../reply';
import { activeHabits, logOf, markHabit, plural } from './common';
import { register, type ExecCtx } from './index';
import { withTarget } from './resolve';
import { dialog } from '../dialog/context';
import type { Parsed } from '../nlp/types';
import type { Reply, UndoOp } from './types';

/* WP5.2 — water, mood, counters, sleep (catalog 14–21, 108–113, 116, 158). */
const MOOD_RU = ['ужасное', 'плохое', 'нормальное', 'хорошее', 'отличное'];
const MOOD_EN = ['awful', 'bad', 'okay', 'good', 'great'];
const dayRow = (c: ExecCtx, day = c.day) => c.sys?.days.find((d) => d.day === day);
const isWater = (h: HabitRowDb) => h.type === 'counter' && /вод|water/i.test(h.name);
const counters = (c: ExecCtx) => activeHabits(c).filter((h) => h.type === 'counter');
const noteWith = (prev: string | null | undefined, add: string) => (prev ? `${prev} · ${add}` : add).slice(0, 500);

/* ── water ── */
register('water.add', (p, c) => {
  const n = Math.max(1, Math.min(40, Math.round(Number(p.slots.amount) || 1)));
  const h = activeHabits(c).find(isWater);
  if (h) { const m = markHabit(c, h, { amount: n }); return m.changed ? R.done(m.text, { undo: m.ops }) : R.info(m.text); }
  const prev = dayRow(c)?.water ?? 0;
  logWater(prev + n, c.day);
  return R.done(c.ru ? `Записал: ${n} ${plural(n, 'стакан', 'стакана', 'стаканов')} воды, всего ${prev + n}` : `Logged ${n} glass${n > 1 ? 'es' : ''} of water, ${prev + n} in total`, { undo: [{ t: 'water', day: c.day, prev }] });
});
register('water.ask', (_p, c) => {
  const h = activeHabits(c).find(isWater);
  const n = h ? logOf(c, h.id)?.value ?? 0 : dayRow(c)?.water ?? 0;
  const goal = h?.target;
  return R.answer(c.ru ? `Сегодня выпито ${n} ${plural(n, 'стакан', 'стакана', 'стаканов')}${goal ? ` из ${goal}` : ''}` : `${n} glass${n === 1 ? '' : 'es'} today${goal ? ` of ${goal}` : ''}`);
});
register('water.step', (_p, c) => { dialog.get().mode = 'water'; return R.done(c.ru ? 'Хорошо: каждое «ещё стакан» — плюс один, без вопросов. Скажите «хватит», когда закончите' : 'Okay: every “another glass” is plus one. Say “stop” when done'); });

/* ── mood ── */
register('mood.set', (p, c) => {
  const lv = Math.max(1, Math.min(5, Number(p.slots.level) || 3));
  const prev = dayRow(c)?.mood ?? null;
  const ops: UndoOp[] = [{ t: 'mood', day: c.day, prev }];
  logMood(lv - 1, c.day);
  const note = typeof p.slots.note === 'string' && p.slots.note ? p.slots.note : '';
  if (note) { ops.push({ t: 'note', day: c.day, prev: dayRow(c)?.note ?? null }); saveDayNote(c.day, noteWith(dayRow(c)?.note, note)); }
  const care = lv <= 1 ? (c.ru ? '. Берегите себя — можно разгрузить день: скажите «перенеси всё на завтра»' : '. Take care of yourself — say “move everything to tomorrow” to lighten the day') : '';
  const say = c.ru ? `Записал: настроение ${MOOD_RU[lv - 1]}${note ? ' и заметку' : ''}${care}` : `Mood saved: ${MOOD_EN[lv - 1]}${note ? ' with a note' : ''}${care}`;
  return R.done(say, { undo: ops, chips: lv <= 1 && c.ru ? [{ label: 'Перенести всё на завтра', say: 'перенеси всё на завтра' }] : undefined });
});
register('mood.note', (p, c) => {
  const text = String(p.slots.text ?? '').trim();
  if (!text) return R.error(c.ru ? 'Что записать в заметку?' : 'What should the note say?');
  const prev = dayRow(c)?.note ?? null;
  saveDayNote(c.day, noteWith(prev, text));
  return R.done(c.ru ? 'Дописал в заметку дня' : 'Added to the note of the day', { undo: [{ t: 'note', day: c.day, prev }] });
});

const moodDays = (c: ExecCtx) => (c.sys?.days ?? []).filter((d) => d.mood != null);
register('mood.worstDays', (_p, c) => {
  const by = Array.from({ length: 7 }, () => [] as number[]);
  for (const d of moodDays(c)) by[(new Date(d.day + 'T12:00:00').getDay() + 6) % 7].push(d.mood!);
  const names = c.ru ? ['понедельникам', 'вторникам', 'средам', 'четвергам', 'пятницам', 'субботам', 'воскресеньям'] : ['Mondays', 'Tuesdays', 'Wednesdays', 'Thursdays', 'Fridays', 'Saturdays', 'Sundays'];
  const avg = by.map((x, i) => ({ i, n: x.length, a: x.length ? x.reduce((s, v) => s + v, 0) / x.length : 99 })).filter((x) => x.n >= 3).sort((a, b) => a.a - b.a);
  if (!avg.length) return R.info(c.ru ? 'Пока мало записей: нужно хотя бы по три на каждый день недели' : 'Not enough entries yet: I need at least three per weekday');
  const w = avg[0];
  return R.answer(c.ru ? `Чаще всего настроение ниже по ${names[w.i]}: в среднем ${w.a.toFixed(1)} из 5` : `Mood is lowest on ${names[w.i]}: ${w.a.toFixed(1)} of 5 on average`);
});
register('mood.drivers', (_p, c) => {
  const moods = new Map(moodDays(c).map((d) => [d.day, d.mood!]));
  if (moods.size < 14) return R.info(c.ru ? 'Нужно хотя бы 14 дней с настроением' : 'I need at least 14 days with a mood');
  const found: { h: HabitRowDb; diff: number }[] = [];
  for (const h of activeHabits(c)) {
    const withD: number[] = [], without: number[] = [];
    for (const [day, m] of moods) (c.sys!.logs.some((l) => l.habit_id === h.id && l.day === day && l.done) ? withD : without).push(m);
    if (withD.length >= 10 && without.length >= 5) { const diff = withD.reduce((a, v) => a + v, 0) / withD.length - without.reduce((a, v) => a + v, 0) / without.length; if (Math.abs(diff) >= 0.4) found.push({ h, diff }); }
  }
  found.sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff));
  const tail = c.ru ? ' Это совпадения в ваших данных, не причина.' : ' These are coincidences in your data, not a cause.';
  if (!found.length) return R.answer((c.ru ? 'Явных совпадений не вижу: настроение держится примерно одинаково.' : 'I see no clear pattern: your mood is about the same.') + tail);
  const parts = found.slice(0, 2).map((x) => (c.ru ? `в дни с «${x.h.name}» настроение ${x.diff > 0 ? 'выше' : 'ниже'} на ${Math.abs(x.diff).toFixed(1)}` : `on days with “${x.h.name}” mood is ${Math.abs(x.diff).toFixed(1)} ${x.diff > 0 ? 'higher' : 'lower'}`));
  return R.answer((c.ru ? 'Чаще совпадает: ' : 'Often goes together: ') + parts.join('; ') + '.' + tail);
});
register('mood.trend', (_p, c) => {
  const avg = (from: string, to: string) => { const v = moodDays(c).filter((d) => d.day >= from && d.day <= to).map((d) => d.mood!); return v.length >= 3 ? v.reduce((a, b) => a + b, 0) / v.length : null; };
  const a = avg(addDays(c.day, -6), c.day), b = avg(addDays(c.day, -13), addDays(c.day, -7));
  if (a == null || b == null) return R.info(c.ru ? 'Пока мало записей: нужно хотя бы по три за каждую из двух недель' : 'Not enough entries: three per week for two weeks');
  const d = a - b;
  return R.answer(c.ru ? `Настроение ${d > 0.3 ? 'растёт' : d < -0.3 ? 'снижается' : 'ровное'}: ${a.toFixed(1)} за эту неделю против ${b.toFixed(1)} за прошлую` : `Mood is ${d > 0.3 ? 'rising' : d < -0.3 ? 'falling' : 'steady'}: ${a.toFixed(1)} this week vs ${b.toFixed(1)} last week`);
});

/* ── counters ── */
function counterOf(c: ExecCtx, p: Parsed, run: (h: HabitRowDb) => Reply): Reply {
  const q = typeof p.slots.query === 'string' ? p.slots.query : '';
  const list = counters(c);
  if (q || p.slots.id) return withTarget(c, p, list, (h) => h.name, 'habit', run);
  const last = dialog.get().last.habit;
  const lastH = last && list.find((h) => h.id === last.id);
  if (lastH) return run(lastH);
  if (list.length === 1) return run(list[0]);
  if (!list.length) return R.error(c.ru ? 'У вас нет привычек-счётчиков' : 'You have no counter habits');
  return R.ask(c.ru ? 'К какой привычке?' : 'Which habit?', { choices: list.slice(0, 4).map((h) => ({ label: h.name, run: () => run(h) })), expect: { windowMs: 8000 } });
}
const remember = (h: HabitRowDb) => { dialog.get().last.habit = { id: h.id, name: h.name }; };

register('counter.add', (p, c) => counterOf(c, p, (h) => {
  const m = markHabit(c, h, { amount: Number(p.slots.amount) || 1 });
  remember(h);
  // a run with its time: the pace is told too (116)
  const mins = Number(p.slots.minutes) || 0, km = Number(p.slots.amount) || 0;
  const pace = mins && km && /км|km|километр/i.test(`${h.unit ?? ''} ${h.name} ${p.slots.query ?? ''}`) ? (c.ru ? `. Темп: ${(mins / km).toFixed(1).replace('.0', '').replace('.', ',')} мин на километр` : `. Pace: ${(mins / km).toFixed(1)} min per km`) : '';
  return m.changed ? R.done(m.text + pace, { undo: m.ops }) : R.info(m.text);
}));
register('counter.remaining', (p, c) => {
  const one = (h: HabitRowDb) => { const left = Math.max(0, (h.target ?? 0) - (logOf(c, h.id)?.value ?? 0)); return left ? (c.ru ? `По «${h.name}» осталось ${left}${h.unit ? ' ' + h.unit : ''}` : `${left} ${h.unit ?? ''} left for “${h.name}”`) : (c.ru ? `«${h.name}» на сегодня выполнена` : `“${h.name}” is done for today`); };
  if (p.slots.query) return withTarget(c, p, counters(c), (h) => h.name, 'habit', (h) => R.answer(one(h)));
  const list = counters(c);
  if (!list.length) return R.info(c.ru ? 'У вас нет привычек-счётчиков' : 'You have no counter habits');
  return R.answer(one(list[0]), { list: list.map(one) });
});
register('counter.set', (p, c) => counterOf(c, p, (h) => {
  const n = Math.max(0, Number(p.slots.amount) || 0);
  const prev = logOf(c, h.id);
  logHabit(h.id, n, n >= (h.target ?? 1) && n > 0, c.day);
  remember(h);
  return R.done(c.ru ? `Поправил: «${h.name}» — ${n}` : `Fixed: “${h.name}” is ${n}`, { undo: [{ t: 'habit.log', habitId: h.id, day: c.day, prev: prev ? { value: prev.value, done: prev.done } : null }] });
}));
register('counter.steps', (p, c) => {
  const h = activeHabits(c).find((x) => x.type === 'counter' && /шаг|step/i.test(x.name));
  if (!h) return R.info(c.ru ? 'У вас нет привычки «Шаги». Добавить из библиотеки: «добавь привычку из библиотеки шаги»' : 'You have no “Steps” habit. Add it: “add a habit from the library steps”', { chips: [{ label: c.ru ? 'Добавить «Шаги»' : 'Add “Steps”', say: c.ru ? 'добавь привычку из библиотеки шаги' : 'add a habit from the library steps' }] });
  const amount = Number(p.slots.amount) || 0;
  const v = h.unit === 'тыс.' || h.unit === 'k' ? Math.round(amount / 100) / 10 : amount;
  const prev = logOf(c, h.id);
  logHabit(h.id, v, v >= (h.target ?? 1), c.day);
  return R.done(c.ru ? `Записал шаги: ${amount}${h.target ? ` (норма ${h.unit === 'тыс.' ? h.target * 1000 : h.target})` : ''}` : `Steps logged: ${amount}`, { undo: [{ t: 'habit.log', habitId: h.id, day: c.day, prev: prev ? { value: prev.value, done: prev.done } : null }] });
});

/* ── sleep ── */
register('sleep.log', (p, c) => {
  const hours = Number(p.slots.hours);
  if (!hours || hours < 0 || hours > 16) return R.error(c.ru ? 'Сколько часов вы спали?' : 'How many hours did you sleep?');
  const h = activeHabits(c).find((x) => x.type === 'counter' && /сон|sleep/i.test(x.name));
  const write = (hab: HabitRowDb, extra: UndoOp[] = []): Reply => {
    const prev = logOf(c, hab.id);
    logHabit(hab.id, hours, hours >= (hab.target ?? 1), c.day);
    return R.done(c.ru ? `Записал сон: ${String(hours).replace('.', ',')} ч${hours >= 7 ? '' : '. Постарайтесь сегодня лечь пораньше'}` : `Sleep logged: ${hours} h`, { undo: [...extra, { t: 'habit.log', habitId: hab.id, day: c.day, prev: prev ? { value: prev.value, done: prev.done } : null }] });
  };
  if (h) return write(h);
  return R.confirm(c.ru ? 'У вас нет привычки «Сон». Создать её (норма 8 часов) и записать?' : 'You have no “Sleep” habit. Create it (8 hours) and log it?', { choices: [
    { label: c.ru ? 'Да, создать' : 'Yes, create it', yes: true, run: () => { const row = createHabit({ id: crypto.randomUUID(), name: c.ru ? 'Сон' : 'Sleep', icon: 'moon', hue: '#3B82F6', type: 'counter', target: 8, unit: c.ru ? 'часов' : 'hours', minutes: null, days: 127, category: 'body', core: false }); const r = write(row); return { ...r, undo: [{ t: 'habit.create', id: row.id }] }; } },
    { label: c.ru ? 'Нет' : 'No', yes: false, run: () => R.info(c.ru ? 'Хорошо, не записываю' : 'Okay, not logging') }] });
});

export { rankEntities, MOOD_RU };
