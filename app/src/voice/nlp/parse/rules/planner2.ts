import { add, buildCtx, rx } from '../engine';
import { daysMask } from './habits2';
import { addDay, num, tidy, withEntity } from './util';
import { listAfter } from './goals';

/* WP5.5 phrases: writing to the planner — series, shifts, copies, priorities, lists (catalog 40, 43, 44, 48–51, 53, 133, 142, 143, 149–151, 195, 198, 201, 203–207). */
const DAYWORD = '(?:понедельник\\p{L}*|вторник\\p{L}*|сред[ауы]|четверг\\p{L}*|пятниц\\p{L}*|суббот\\p{L}*|воскресень\\p{L}*|будн\\p{L}*|выходн\\p{L}*)';
const LEAD = /^(?:(?:каждый|каждую|каждое|каждые|кажд\p{L}+|по|раз|в|две|\d+|недели|неделю|недел\p{L}*|будням|ежедневно|день|число|и|а) )+/u;
const strip = (body: string) => tidy(body.replace(new RegExp(`(?<![\\p{L}\\d])${DAYWORD}(?![\\p{L}\\d])`, 'gu'), ' ').replace(LEAD, ' ').replace(/\s+/g, ' '));
const SHIFT = (s: string) => (/раньше|earlier/.test(s) ? -1 : 1);

/** items «стоматолог в десять, звонок маме в пять» → titles with their own time */
function items(raw: string, tail: string, c: Parameters<NonNullable<Parameters<typeof add>[0]['slots']>>[1], prefix = '') {
  return listAfter(tail, /^/).map((it) => {
    const x = buildCtx(it, c.env, c.lex);
    return { title: `${prefix}${x.body || it}`.trim(), time: x.when.time, day: x.when.date };
  });
  void raw;
}

add(
  { kind: 'task.addRecurring', full: true, re: rx('^(?:каждый|каждую|каждое|каждые) (?:день|неделю)?'), slots: (_m, c) => recurrence(c) },
  { kind: 'task.addRecurring', full: true, re: rx('^(?:раз в (?:две|2) недели|по будням|ежедневно|еженедельно) '), slots: (_m, c) => recurrence(c) },
  { kind: 'task.deleteSeries', over: ['task.delete', 'task.add'], re: rx('^(?:удали|убери|отмени) все (?:будущие|предстоящие|ближайшие) (.+)$'), slots: (m) => ({ query: tidy(m[1]) }) },
  { kind: 'task.moveBulk', full: true, over: ['task.move', 'task.delete', 'task.add'], re: rx('^(?:сдвинь|сдвинуть|передвинь|перенеси) (?:вс[её]|все дела|все встречи|все задачи)(?: (после обеда|после 18|после вечера))?(?: на)? (\\d+) (минут\\p{L}*|час\\p{L}*) (позже|раньше)$'), slots: (m) => ({ all: true, shiftMin: (/час/.test(m[3]) ? num(m[2])! * 60 : num(m[2])!) * SHIFT(m[4]), after: m[1] ? '13:00' : undefined, day: undefined }) },
  { kind: 'task.moveBulk', full: true, over: ['task.move', 'task.delete', 'task.add'], re: rx('^(?:сдвинь|сдвинуть|передвинь|перенеси) (?:вс[её]|все дела|все встречи|все задачи)(?: (после обеда))? на час (позже|раньше)$'), slots: (m) => ({ all: true, shiftMin: 60 * SHIFT(m[2]), after: m[1] ? '13:00' : undefined }) },
  { kind: 'task.moveBulk', over: ['task.move'], re: rx('^перенеси (вечерние|утренние|дневные) (?:дела|задачи|встречи)(?: на)?$'), slots: (m, c) => ({ all: true, day: c.when.date ?? addDay(c.env.now, 1), part: /вечер/.test(m[1]) ? 'evening' : /утрен/.test(m[1]) ? 'morning' : 'day' }) },
  { kind: 'task.moveBulk', over: ['task.move', 'task.delete'], re: rx('^(?:перенеси|отложи|сдвинь) (покупки|звонки|встречи)(?: на)?$'), slots: (m, c) => ({ all: true, query: m[1] === 'покупки' ? 'купить' : m[1], day: c.when.date ?? addDay(c.env.now, 1) }) },
  { kind: 'task.duration', re: rx('^(?:сократи|укороти|уменьши)(?: длительность)? (.+?)(?: на)?$'), slots: (m, c) => (c.when.duration ? { ...withEntity(c, 'task', m[1]), minutes: c.when.duration, shorten: true } : null) },
  { kind: 'task.duration', re: rx('^(?:сделай|сделать) (.+?) (?:короче|покороче)$'), slots: (m, c) => ({ ...withEntity(c, 'task', m[1]), minutes: 15, shorten: true }) },
  { kind: 'task.duration', re: rx('^(?:удлини|удлинить|увеличь)(?: длительность)? (.+?)(?: на)?$'), slots: (m, c) => (c.when.duration ? { ...withEntity(c, 'task', m[1]), minutes: c.when.duration } : null) },
  { kind: 'task.category', re: rx('^сделай (?:задачу |встречу )?(.+?) (рабочей|рабочим|рабочее|встречей|срочной|срочным|дедлайном|обзором)$'), slots: (m, c) => ({ ...withEntity(c, 'task', m[1]), category: m[2] }) },
  { kind: 'task.category', re: rx('^(?:поменяй|измени|смени) категорию (?:задачи |встречи )?(.+?) на (.+)$'), slots: (m, c) => ({ ...withEntity(c, 'task', m[1]), category: tidy(m[2]) }) },
  { kind: 'task.doneAll', over: ['task.doneMany', 'habit.doneAll'], re: rx('^(?:отметь|заверши|закрой) все (?:задачи|дела)(?: выполненными)?$|^закрой весь план$') },
  { kind: 'task.duplicate', over: ['task.add'], re: rx('^(?:повтори|продублируй|скопируй|дублируй) (?:задачу |встречу )?(.+?)(?: на)?$'), slots: (m, c) => {
    if (/вчерашн|план|невыполнен/.test(c.raw.toLowerCase())) return null;
    return { ...withEntity(c, 'task', m[1]), day: c.when.date ?? addDay(c.env.now, 1) };
  } },
  { kind: 'task.duplicate', over: ['task.add'], re: rx('^(?:повтори|продублируй) задачу(?: на)?$'), slots: (_m, c) => ({ day: c.when.date ?? addDay(c.env.now, 1) }) },
  { kind: 'task.duplicate', over: ['task.add', 'task.duplicate'], full: true, re: rx('^(?:скопируй|продублируй|дублируй|перенеси копию) (?:(?:вчерашн\\p{L}*|позавчерашн\\p{L}*|план|все|невыполненные) )*(?:план|задачи|дела)?(?: с (.+?))?(?: на)? ?(сегодня|завтра)?$'), slots: (_m, c) => {
    if (!/вчера|план|задачи|невыполнен|дела/.test(c.c)) return null;
    const from = /позавчера/.test(c.c) ? addDay(c.env.now, -2) : /вчера/.test(c.c) ? addDay(c.env.now, -1) : (c.when.date && c.when.date < addDay(c.env.now, 0) ? c.when.date : addDay(c.env.now, -1));
    return { from, day: /завтра/.test(c.c) ? addDay(c.env.now, 1) : addDay(c.env.now, 0), undoneOnly: /невыполнен/.test(c.c) };
  } },
  { kind: 'plan.moveToFree', re: rx('^перенеси(?: (.+?))? на ближайшее свободное (?:окно|время)$'), slots: (m, c) => (m[1] ? withEntity(c, 'task', m[1]) : {}) },
  { kind: 'plan.buffer', over: ['task.add'], re: rx('^(?:поставь|сделай|добавь) буфер (\\d+) минут\\p{L}*(?: между (?:встречами|делами))?$|^буфер (\\d+) минут\\p{L}* между (?:встречами|делами)$'), slots: (m) => ({ minutes: num(m[1] ?? m[2]) }) },
  { kind: 'task.top3', src: 'raw', re: rx('^(?:три )?главн\\p{L}* дел\\p{L}*(?: на сегодня)?[: ]+(.+)$|^сделай главными (.+)$'), slots: (m) => ({ items: listAfter(m[1] ?? m[2], /^/) }) },
  { kind: 'task.top3', re: rx('^(?:три )?главных дела на сегодня$|^выбери (?:три )?главных дела$') },
  { kind: 'plan.limit', re: rx('^не больше (\\d+) дел(?: в день)?$|^максимум (\\d+) дел\\p{L}*(?: в день)?$'), slots: (m) => ({ n: num(m[1] ?? m[2]) }) },
  { kind: 'task.note', over: ['task.add'], src: 'raw', re: rx('^(?:добавь|запиши|допиши)(?: в)? (?:заметку|заметка) (?:к|для) (.+?)\\s*:\\s*(.+)$'), slots: (m, c) => ({ ...withEntity(c, 'task', m[1]), text: tidy(m[2]) }) },
  { kind: 'task.note', over: ['task.add'], src: 'n', re: rx('^(?:добавь|запиши|допиши)(?: в)? (?:заметку|заметка) (?:к|для) (.+)$'), slots: (m, c) => {
    // no colon spoken: the shortest start that names a task is the task, the rest is the note
    const w = tidy(m[1]).split(' ');
    for (let k = 1; k < Math.min(w.length, 5); k++) { const e = c.task(w.slice(0, k).join(' ')); if (e && e.sim >= 0.8) return { query: w.slice(0, k).join(' '), id: e.id, text: w.slice(k).join(' '), _score: 0.85 }; }
    return null;
  } },
  { kind: 'task.deepBlock', re: rx('^(?:блок|окно) (?:на |для )?глубок\\p{L}* работ\\p{L}*(?: завтра| сегодня)?(?: утром| днем| вечером)?(?: на (\\d+) час\\p{L}*)?$'), slots: (m, c) => ({ day: c.when.date ?? addDay(c.env.now, 1), time: c.when.time, minutes: c.when.duration ?? (m[1] ? num(m[1])! * 60 : 120) }) },
  { kind: 'task.addMany', over: ['task.add', 'habit.done'], src: 'raw', re: rx('^(?:купить|купи)(?:\\s*:\\s*|\\s+)(.+)$'), slots: (m, c) => { const it = items(c.raw, m[1], c, 'купить '); return it.length >= 2 ? { items: it } : null; } },
  { kind: 'task.addMany', over: ['task.add'], src: 'raw', re: rx('^(?:добавь|запиши|поставь)(?: мне)? (?:в |на )?(завтра|сегодня|послезавтра)[: ]+(.+)$'), slots: (m, c) => { const it = items(c.raw, m[2], c); return it.length >= 2 ? { day: m[1] === 'завтра' ? addDay(c.env.now, 1) : m[1] === 'послезавтра' ? addDay(c.env.now, 2) : addDay(c.env.now, 0), items: it } : null; } },
  { kind: 'task.addMany', over: ['task.add'], src: 'raw', re: rx('^список дел на выходные[: ]+(.+)$|^дела на выходные[: ]+(.+)$'), slots: (m, c) => ({ day: weekendDay(c.env.now), items: items(c.raw, m[1] ?? m[2], c) }) },
  { kind: 'task.doneMany', over: ['task.delete', 'habit.done', 'habit.undone'], re: rx('^вычеркни (.+ и .+)$'), slots: (m) => { const list = m[1].split(/ и /).map(tidy).filter(Boolean); return { items: list, _score: list.length >= 2 ? 0.9 : 0.4 }; } },
  { kind: 'task.doneMany', over: ['task.delete', 'habit.done', 'habit.undone'], re: rx('^(?:вычеркни|вычеркнуть) (?:задачу |дело )?(.+)$'), slots: (m, c) => (c.task(tidy(m[1])) ? { items: [tidy(m[1])], _score: 0.9 } : null) },
);

function weekendDay(now: Date): string {
  const mon0 = (now.getDay() + 6) % 7;
  return addDay(now, mon0 >= 5 ? 0 : 5 - mon0);
}

/** «каждый понедельник и среду в семь утра пробежка» → { title, time, rule } */
function recurrence(c: Parameters<NonNullable<Parameters<typeof add>[0]['slots']>>[1]) {
  const text = c.c;
  const title = strip(c.body);
  if (!title) return null;
  let rule: { freq: string; days?: number; dom?: number };
  const dom = text.match(/(\d{1,2})-го число/);
  if (dom) rule = { freq: 'monthly', dom: Number(dom[1]) };
  else if (/раз в (?:две|2) недели/.test(text)) rule = { freq: 'biweekly', days: daysMask(text) || (1 << ((c.env.now.getDay() + 6) % 7)) };
  else if (/по будням/.test(text)) rule = { freq: 'weekdays' };
  else if (/ежедневно|каждый день/.test(text)) rule = { freq: 'daily' };
  else { const mask = daysMask(text.replace(/по будням|каждый день/, '')); if (!mask) return null; rule = { freq: 'weekly', days: mask }; }
  return { title, time: c.when.time, minutes: c.when.duration, rule };
}
