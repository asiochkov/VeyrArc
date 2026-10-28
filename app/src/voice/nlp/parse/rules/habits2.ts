import { add, rx } from '../engine';
import { num, tidy, withEntity } from './util';
import { periodIn } from '../../period';

/* WP5.1 phrases: managing habits and asking about them (catalog 1–15, 117, 156, 157, 167–176), Russian then English. */
const DAYBITS: [RegExp, number][] = [[/будн/, 31], [/выходн|weekend/, 96], [/понедельник|monday/, 1], [/вторник|tuesday/, 2], [/сред[ауые]|wednesday/, 4], [/четверг|thursday/, 8], [/пятниц|friday/, 16], [/суббот|saturday/, 32], [/воскресень|sunday/, 64], [/кажд\p{L}* день|ежедневно|every ?day|daily/u, 127], [/weekday/, 31]];
export function daysMask(s: string): number {
  let m = 0;
  for (const [re, b] of DAYBITS) if (re.test(s)) m |= b;
  return m;
}
const DAYWORD = '(?:будн\\p{L}*|выходн\\p{L}*|понедельник\\p{L}*|вторник\\p{L}*|сред\\p{L}*|четверг\\p{L}*|пятниц\\p{L}*|суббот\\p{L}*|воскресень\\p{L}*)';
const DAYLIST = `(?:${DAYWORD}(?:,? (?:и )?${DAYWORD})*|ежедневно|каждый день)`;
const PAST = /(?:л|ла|ли|лся|лась)$/;

add(
  { kind: 'water.step', over: ['habit.done'], re: rx('‹(?:отмечай|считай|записывай|добавляй|веди|режим)(?: учет)? воду? по стакан\\p{L}*›|‹режим воды по стакан\\p{L}*›') },
  { kind: 'habit.markGroup', over: ['habit.done', 'habit.doneAll'], re: rx('^(?:отметь|отметить) (?:все привычки|всё|все) (?:из раздела |раздела |из группы |в разделе |группы )(тело|ум|дисциплина|продуктивность)$'), slots: (m) => ({ group: m[1] }) },
  { kind: 'habit.markPast', over: ['habit.done'], re: rx('^(?:отметь|засчитай|зачти|поставь галочку на|поставь отметку на) (.+)$'), slots: (m, c) => (c.when.date && c.when.date < c.env.now.toISOString().slice(0, 10) ? { ...withEntity(c, 'habit', m[1]), day: c.when.date } : null) },
  { kind: 'habit.rename', over: ['task.move'], re: rx('^(?:переименуй|поменяй название|измени название|назови)(?: привычку| привычки)? (.+?) (?:в|на|как) (.+)$'), slots: (m, c) => ({ ...withEntity(c, 'habit', m[1]), to: tidy(m[2]) }) },
  { kind: 'habit.schedule', full: true, re: rx(`^(.+?) (?:теперь |только )?(?:по |в |во |каждый |каждую )?(${DAYLIST})$`), slots: (m, c) => {
    if (PAST.test(tidy(m[1]).split(' ')[0]) || /^хочу/.test(m[1])) return null;
    const mask = daysMask(m[2]);
    return mask ? { ...withEntity(c, 'habit', m[1]), days: mask } : null;
  } },
  { kind: 'habit.schedule', full: true, re: rx(`^(?:поставь|сделай|измени)(?: расписание)? (?:привычк\\p{L}* )?(.+?) (?:на |по |в )(${DAYLIST})$`), slots: (m, c) => { const mask = daysMask(m[2]); return mask ? { ...withEntity(c, 'habit', m[1]), days: mask } : null; } },
  { kind: 'habit.target', score: 0.9, re: rx('^(.+?) (?:(?:теперь|норма|цель) )?(?:по )?(\\d+) (стакан\\p{L}*|раз\\p{L}*|минут\\p{L}*|шаг\\p{L}*|тысяч\\p{L}*|штук\\p{L}*|страниц\\p{L}*|км|километр\\p{L}*)$'), slots: (m, c) => {
    const first = tidy(m[1]).split(' ')[0];
    if (PAST.test(first) || /^(?:ещ[её]|плюс|добавь|подход|прошел|пробежал)/.test(first)) return null;
    const e = c.habit(m[1]);
    if (!e || e.sim < 0.8) return null;
    return /минут/.test(m[3]) ? { ...withEntity(c, 'habit', m[1]), minutes: num(m[2]) } : { ...withEntity(c, 'habit', m[1]), target: num(m[2]) };
  } },
  { kind: 'habit.core', re: rx('^(?:убери|верни|сними|выведи) (.+?) (?:из|в) (?:главных|главные|основных|основные)$'), slots: (m, c) => ({ ...withEntity(c, 'habit', m[1]), core: /^верни/.test(c.body) }) },
  { kind: 'habit.core', re: rx('^сделай (.+?) (?:не главной|дополнительной|необязательной)(?: привычкой)?$'), slots: (m, c) => ({ ...withEntity(c, 'habit', m[1]), core: false }) },
  { kind: 'habit.pause', re: rx('^(?:приостанови|останови|заморозь) (?:привычку )?(.+)$|^поставь паузу (?:на |для )?(.+)$'), slots: (m, c) => withEntity(c, 'habit', m[1] ?? m[2]) },
  { kind: 'habit.restore', re: rx('^(?:верни|восстанови|возобнови|включи) привычку (.+)$'), slots: (m) => ({ query: tidy(m[1]) }) },
  { kind: 'habit.reorder', re: rx('^(?:подними|поставь|перемести|подвинь) (?:привычку )?(.+?) (наверх|вверх|в начало|первой|на первое место)$'), slots: (m, c) => ({ ...withEntity(c, 'habit', m[1]), to: 'top' }) },
  { kind: 'habit.reorder', re: rx('^(?:опусти|перемести|отправь|подвинь) (?:привычку )?(.+?) (вниз|в конец|последней)$'), slots: (m, c) => ({ ...withEntity(c, 'habit', m[1]), to: 'bottom' }) },
  { kind: 'habit.streak', over: ['habit.streak'], re: rx('‹(?:лучшая|рекордная|самая длинная) серия по (.+)›'), slots: (m, c) => ({ ...withEntity(c, 'habit', m[1]), best: true }) },
  { kind: 'habit.count', over: ['habit.count'], re: rx('^сколько раз (?:я )?(.+?)(?: (на этой неделе|за неделю|в этом месяце|за месяц|за 30 дней|сегодня|за все время))?$'), slots: (m, c) => ({ ...withEntity(c, 'habit', m[1]), period: periodIn(m[2] ?? '') ?? 'week' }) },
  { kind: 'habit.count', re: rx('^сколько (?:я )?(пробежал\\p{L}*|прошел|прошла|выпил\\p{L}*|проплыл\\p{L}*|отжал\\p{L}*|присел\\p{L}*|накрутил\\p{L}*|прочитал\\p{L}*|написал\\p{L}*)(?: (на этой неделе|за неделю|в этом месяце|за месяц|за 30 дней|сегодня))?$'), slots: (m, c) => ({ ...withEntity(c, 'habit', m[1]), period: periodIn(m[2] ?? '') ?? 'week', sum: true }) },
  { kind: 'habit.compare', re: rx('^сравни (.+?) и (.+)$'), slots: (m) => ({ a: tidy(m[1]), b: tidy(m[2]) }) },
  { kind: 'habit.top', re: rx('^(?:топ ?\\d*|топ три|лучшие (?:три )?привычки|топ привычек|мои лучшие привычки)(?: привычки)?$'), slots: () => ({ n: 3 }) },
  { kind: 'habit.top', over: ['habit.weakest'], re: rx('^(?:худшие|слабые|самые слабые|проблемные)(?: три| 3)?(?: привычки)?$'), slots: () => ({ n: 3, worst: true }) },
  { kind: 'habit.trend', over: ['plan.day'], re: rx('‹где я просел\\p{L}*(?: за месяц)?›|‹что у меня просело›') },
  { kind: 'habit.suggest', re: rx('^(?:предложи|посоветуй|подскажи) (?:мне )?(?:новую )?привычку$|^какую привычку (?:мне )?добавить$') },
  { kind: 'habit.simplify', re: rx('^(?:упрости|облегчи|сделай проще|уменьши норму)(?: привычку)? (.+)$'), slots: (m, c) => withEntity(c, 'habit', m[1]) },
  { kind: 'habit.harden', re: rx('^(?:усложни|сделай сложнее|подними норму)(?: привычку)?(?: (.+))?$'), slots: (m, c) => (m[1] ? withEntity(c, 'habit', m[1]) : {}) },
  { kind: 'habit.why', re: rx('^почему я (?:пропускаю|не делаю|забываю) (.+)$'), slots: (m, c) => withEntity(c, 'habit', m[1]) },
  { kind: 'habit.howMany', re: rx('‹сколько привычек (?:мне )?(?:нужно|надо|достаточно)(?: для начала)?›') },
  { kind: 'habit.promise', src: 'n', re: rx('^(?:вчера пропустил\\p{L}*|пропустил\\p{L}* вчера),? (?:сегодня|а сегодня) (?:сделаю|сделаю точно|не пропущу)$') },
  { kind: 'habit.overload', re: rx('‹(?:есть ли у меня )?слишком много привычек›|‹не перегружен\\p{L}* ли я›') },
  { kind: 'habit.trim', re: rx('‹что убрать(?:,? чтобы стало легче)?›') },
  { kind: 'habit.time', re: rx('^подбери время для (?:привычки )?(.+)$'), slots: (m, c) => withEntity(c, 'habit', m[1]) },
);

const en = (...rules: Parameters<typeof add>) => add(...rules.map((r) => ({ ...r, lang: 'en' as const })));
en(
  { kind: 'habit.rename', re: rx('^rename (?:the |my )?(?:habit )?(.+?) to (.+)$'), slots: (m, c) => ({ ...withEntity(c, 'habit', m[1]), to: tidy(m[2]) }) },
  { kind: 'habit.schedule', full: true, re: rx('^(?:make )?(.+?) (?:only )?(?:on|every) (weekdays|weekends|mondays|tuesdays|wednesdays|thursdays|fridays|saturdays|sundays|day)(?: and (mondays|tuesdays|wednesdays|thursdays|fridays|saturdays|sundays))?$'), slots: (m, c) => { const mask = daysMask(`${m[2]} ${m[3] ?? ''}`); return mask ? { ...withEntity(c, 'habit', m[1]), days: mask } : null; } },
  { kind: 'habit.target', score: 0.84, re: rx('^(?:the )?(?:target|goal) (?:for )?(.+?) (?:is now |is |to )(\\d+)(?: (minutes?|glasses|times|pages|steps))?$|^(.+?) (?:is now |now )(\\d+) (minutes?|glasses|times|pages|steps)$'), slots: (m, c) => { const q = m[1] ?? m[4], n = m[2] ?? m[5], u = m[3] ?? m[6] ?? ''; return /min/.test(u) ? { ...withEntity(c, 'habit', q), minutes: num(n) } : { ...withEntity(c, 'habit', q), target: num(n) }; } },
  { kind: 'habit.core', over: ['habit.undone', 'task.delete'], re: rx('^(?:remove|take) (.+?) from (?:the )?(?:core|main) habits$'), slots: (m, c) => ({ ...withEntity(c, 'habit', m[1]), core: false }) },
  { kind: 'habit.restore', re: rx('^(?:restore|resume|bring back|unpause) (?:the )?habit (.+)$'), slots: (m) => ({ query: tidy(m[1]) }) },
  { kind: 'habit.reorder', re: rx('^(?:move|put) (?:the )?(?:habit )?(.+?) (?:to the )?(top|first|to the top|to the bottom|bottom|last)$'), slots: (m, c) => ({ ...withEntity(c, 'habit', m[1]), to: /bottom|last/.test(m[2]) ? 'bottom' : 'top' }) },
  { kind: 'habit.streak', over: ['habit.streak'], re: rx('‹(?:whats|what is) my (?:best|longest) (?:(.+) )?streak(?: for (.+))?›'), slots: (m, c) => { const qy = m[1] ?? m[2]; return qy ? { ...withEntity(c, 'habit', qy), best: true } : null; } },
  { kind: 'habit.count', over: ['habit.count'], re: rx('^how many times did i (?:do |done )?(.+?)(?: (this week|this month|today|in the last 30 days))?$'), slots: (m, c) => ({ ...withEntity(c, 'habit', m[1]), period: periodIn(m[2] ?? '') ?? 'week' }) },
  { kind: 'habit.count', re: rx('^how (?:far|much|many \\w+) did i (run|walk|swim|drink|read)(?: (this week|this month|today))?$'), slots: (m, c) => ({ ...withEntity(c, 'habit', m[1]), period: periodIn(m[2] ?? '') ?? 'week', sum: true }) },
  { kind: 'habit.compare', re: rx('^compare (.+?) (?:and|with|to) (.+)$'), slots: (m) => ({ a: tidy(m[1]), b: tidy(m[2]) }) },
  { kind: 'habit.top', re: rx('^(?:top three|top 3|my best) habits$|^best habits$'), slots: () => ({ n: 3 }) },
  { kind: 'habit.top', re: rx('^(?:worst|weakest) (?:three )?habits$'), slots: () => ({ n: 3, worst: true }) },
  { kind: 'habit.trend', re: rx('‹where did i (?:slip|drop|fall)(?: this month)?›') },
  { kind: 'habit.suggest', re: rx('^(?:suggest|recommend) (?:me )?(?:a )?(?:new )?habit$') },
  { kind: 'habit.simplify', re: rx('^(?:simplify|make easier|lower the target of) (?:the )?(?:habit )?(.+)$'), slots: (m, c) => withEntity(c, 'habit', m[1]) },
  { kind: 'habit.harden', re: rx('^(?:make (?:it|a habit) harder|raise the bar|make (.+) harder)$'), slots: (m, c) => (m[1] ? withEntity(c, 'habit', m[1]) : {}) },
  { kind: 'habit.why', re: rx('^why do i (?:skip|miss|forget) (.+)$'), slots: (m, c) => withEntity(c, 'habit', m[1]) },
  { kind: 'habit.howMany', re: rx('‹how many habits (?:do i need|should i have|to start)›') },
  { kind: 'habit.overload', re: rx('‹do i have too many habits›') },
  { kind: 'habit.trim', re: rx('‹what (?:should|can) i (?:cut|drop|remove)(?: to make it easier)?›') },
  { kind: 'habit.time', re: rx('^(?:find|pick|suggest) a time for (?:the )?(?:habit )?(.+)$'), slots: (m, c) => withEntity(c, 'habit', m[1]) },
);
