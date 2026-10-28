import { add, rx } from '../engine';
import { levenshtein } from '../../phonetic';
import { has, tidy, today, addDay, QUESTION, IMPERATIVE, PRON, withEntity } from './util';

/* the planner: adding, moving and deleting tasks; questions about the plan (catalog 40–53, 138–149, 195–208) */

const EVENTISH = rx('^(?:встреч\\p{L}*|созвон\\p{L}*|врач\\p{L}*|стоматолог\\p{L}*|ужин\\p{L}*|обед\\p{L}*|интервью|собеседовани\\p{L}*|консультаци\\p{L}*|свидани\\p{L}*)(?![\\p{L}\\d])');
const INFINITIVE = /^(?:\p{L}{3,}(?:ть|ться|чь)|нести|идти|найти|прийти|пойти|зайти|выйти|уйти|везти|вести)$/u;
const LEAD = /^(?:мне |что |про |о |об |насчет |задачу |задача |событие |встречу |в планер |в календарь |на |в )+/u;
const NOUNS = ['привычку', 'привычки', 'цель', 'отказ', 'заметку', 'обещание'];
const DEADWORDS = /‹(?:пора|надо|нужно|хочу|можно|лучше|бы|ли)›/u;

/** the title: leading glue words out; it keeps the person's wording */
export const titleOf = (s: string) => tidy(tidy(s).replace(LEAD, '').replace(/ (?:пожалуйста|спасибо)$/, '').replace(/\s+(?:на|в|к|по)$/, ''));

add(
  // explicit commands to add
  { kind: 'task.add', re: [
    rx('^(?:хочу чтобы ты )?(?:напомни|напомнить|напомнил\\p{L}*)(?: мне)?(?: про| о| об)? (.+)$'),
    rx('^(?:запланируй|запланировать|запиши|записать|внеси|занеси|добавь|добавить|создай|создать|поставь)(?: мне)?(?: в планер| в календарь| в список)?(?: задачу| задача| событие| встречу| дело)?(?: на)? (.+)$'),
    rx('^(?:задача|событие)[: ] ?(.+)$'),
    rx('^записаться (.+)$'),
  ], slots: (m, c) => {
    const first = c.body.split(' ')[0];
    // «добавь привычку…», «поставь будильник…», «запиши обещание…» are not tasks
    if (/стакан|glass/.test(tidy(m[1]))) return null;
    if (NOUNS.some((n) => levenshtein(n, tidy(m[1]).split(' ')[0].slice(0, n.length + 1)) <= 2) && first !== 'напомни') return null;
    if (/^(?:к настроени|в настроени|к заметк|привычк|цель|цели|отказ|заметк|обещани|будильник|таймер|фокус|напоминани|тему|тёмн|темн)/u.test(tidy(m[1])) && first !== 'напомни') return null;
    if (/^(?:поставь|запиши|добавь)$/u.test(first) && /^(?:настроени|вод|галочк|отметк|дедлайн|тему|таймер)/u.test(tidy(m[1]))) return null;
    let t = titleOf(m[1]);
    if (/^записаться/u.test(c.body) && !/^записаться/u.test(t)) t = `записаться ${t}`;
    if (c.body.startsWith('записаться')) t = titleOf(c.body);
    if (!t) return null;
    const out: Record<string, unknown> = { title: t, day: c.when.date, time: c.when.time, end: c.when.end ?? (c.when.duration && c.when.time ? plus(c.when.time, c.when.duration) : undefined) };
    if (c.when.rel && !out.day) out.day = today(c);
    if (c.when.time == null && c.when.date && EVENTISH.test(t) && !INFINITIVE.test(t.split(' ')[0])) out._ask = 'time';
    // «поставь …» is also «поставь паузу», «поставь первой»: a task only when it says when, or the words are not a habit
    if (first === 'поставь' && !c.when.date && !c.when.time) out._score = 0.7;
    return out;
  } },
  // a bare phrase: an infinitive («купить хлеб») or something with a time or a date («завтра в 10 стоматолог»)
  { kind: 'task.add', score: 0.9, bare: true, re: rx('^(.{3,80})$'), slots: (m, c) => {
    const t = tidy(m[1]);
    const words = t.split(' ');
    if (/^(?:лег|лёг|встал|спал|проснул\p{L}*|\p{L}{2,}(?:ал|ил|ел|ол|ул|ыл|ала|ила|ела|ули|али|или))$/u.test(words[0]) || IMPERATIVE.test(words[0]) || has(QUESTION, t) || has(PRON, t) || has(DEADWORDS, t)) return null;
    if (/^(?:напомни|добавь|запиши|создай|удали|перенеси|отложи|сдвинь|освободи|закрой|заверши|вычеркни|продли|переименуй|останови|верни|сними|убери|сотри|отмени|отметь|поставь|сделай|открой|покажи|включи|что|как|выпил|сделал|прочитал|пробежал)/u.test(t)) return null;
    const timed = !!(c.when.time || c.when.date);
    const future = !c.when.date || c.when.date >= today(c);
    if (!(timed && future) && !(INFINITIVE.test(words[0]) && words.length >= 2)) return null;
    if (words.length > 8) return null;
    const title = titleOf(t);
    if (!title) return null;
    const out: Record<string, unknown> = { title, day: c.when.date, time: c.when.time, end: c.when.end ?? (c.when.duration && c.when.time ? plus(c.when.time, c.when.duration) : undefined) };
    if (c.when.rel && !out.day) out.day = today(c);
    if (!c.when.time && c.when.date && EVENTISH.test(title) && !INFINITIVE.test(words[0])) out._ask = 'time';
    return out;
  } },

  // moving, deleting, prolonging
  { kind: 'task.moveBulk', over: ['task.move', 'task.delete'], re: rx('^(?:отложи|перенеси|сдвинь) (?:все|всё|вс[её] дела|все задачи)(?: на)?$'), slots: (_m, c) => ({ day: c.when.date, all: true }) },
  { kind: 'task.moveBulk', over: ['task.move', 'task.delete'], re: rx('^освободи (вечер|утро|день)$'), slots: (m, c) => ({ day: addDay(c.env.now, 1), part: m[1], all: true }) },
  { kind: 'task.move', re: rx('^(?:перенеси|перенести|передвинь|сдвинь|отложи) (.+?)(?: на)*(?: (\\d{1,2}))?$'), slots: (m, c) => {
    let q = tidy(m[1]).replace(/(?: на)+$/, '');
    let time = c.when.time;
    if (m[2] && !time) time = c.time(m[2]) ?? undefined;
    if (!q || (!c.when.date && !time)) return null;
    q = q.replace(/ в$/, '');
    return { ...withEntity(c, 'task', q), day: c.when.date, time };
  } },
  { kind: 'task.delete', re: rx('^(?:удали|удалить|сотри|отмени|убери|выкинь)(?: задачу| встречу| событие)? (.+)$'), slots: (m, c) => {
    const q = tidy(m[1]);
    if (/^(?:все|всё)(?: что есть)?$/u.test(q) || /^(?:привычк|цел|отказ|аккаунт|мо[йю]|данные|сезон)/u.test(q)) return null;
    if (/^(?:все|всё) (?:задачи|дела|события|встречи)/u.test(q)) return { query: 'все', all: true, _score: 0.9 };
    return withEntity(c, 'task', q);
  } },
  { kind: 'task.duration', re: rx('^(?:продли|продлить|удлини|увеличь) (.+)$'), slots: (m, c) => {
    if (!c.when.duration || /^(?:фокус|таймер)/u.test(m[1])) return null;
    return { ...withEntity(c, 'task', tidy(m[1])), minutes: c.when.duration };
  } },
  { kind: 'task.doneAll', over: ['task.doneMany'], re: rx('^(?:закрой|закрыть|заверши|отметь выполненными) (?:все|всё) (?:задачи|дела)$') },
  { kind: 'task.doneMany', re: rx('^(?:вычеркни|вычеркнуть|закрой|заверши) (.+ и .+)$'), slots: (m, c) => {
    const items = m[1].split(/ и |, /).map(tidy).filter(Boolean);
    return { items, _score: items.every((i) => c.task(i)) ? 0.9 : 0.4 };
  } },

  // questions about the plan
  { kind: 'plan.day', re: [rx('‹что (?:у меня|есть|у нас)(?: по плану| запланировано| в планах| на (?:день))?›'), rx('‹(?:покажи|расскажи|прочитай|назови) (?:мой |мне )?(?:план|расписание|дела)›'), rx('‹мой план›'), rx('‹что (?:по )?плану›')], slots: (_m, c) => ({ day: c.when.date ?? today(c) }) },
  { kind: 'list.remaining', over: ['plan.count'], re: [rx('‹сколько (?:у меня )?(?:еще )?осталось (?:дел|задач)›'), rx('‹что осталось(?: (.+))?›')], slots: (m) => (m[1] ? { query: tidy(m[1]) } : {}) },
  { kind: 'plan.next', re: [rx('‹когда (?:у меня )?(?:следующ\\p{L}+|ближайш\\p{L}+) (?:встреч\\p{L}*|событи\\p{L}*|дело|задач\\p{L}*)›'), rx('‹что (?:дальше|следующее|следующий)›'), rx('‹во сколько (?:у меня )?(.+)›')], slots: (m, c) => { if (!m[1]) return {}; const q = tidy(m[1]); return { query: q, _score: c.task(q) || c.habit(q) ? 0.9 : 0.4 }; } },
  { kind: 'plan.overdue', re: rx('‹что я не успел\\p{L}*›') },
  { kind: 'plan.count', re: rx('‹сколько (?:у меня )?(?:встреч|событий|задач|дел)›') },
  { kind: 'plan.freeSlots', re: rx('‹когда я (?:.* )?свободен›'), slots: (_m, c) => ({ day: c.when.date ?? today(c) }) },
  { kind: 'plan.conflicts', re: rx('‹(?:есть ли )?конфликт\\p{L}*›') },
);

function plus(time: string, minutes: number): string {
  const [h, m] = time.split(':').map(Number);
  const t = h * 60 + m + minutes;
  return `${String(Math.floor(t / 60) % 24).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
}
