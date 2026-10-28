import { add, rx } from '../engine';
import { has, num, tidy, today, QUESTION, withEntity } from './util';

/* mood, water, marking habits, counters, sleep, managing habits (ТЗ 6.6; catalog 1–21, 108–117, 156–176) */

const MOOD: [RegExp, number][] = [
  [rx('‹(?:паршив\\p{L}*|ужасн\\p{L}*|отвратительн\\p{L}*|выгорел\\p{L}*|выгорани\\p{L}*|кошмар\\p{L}*|на дне)›'), 1],
  [rx('‹(?:так себе|не очень|тревожн\\p{L}*|грустн\\p{L}*|плох\\p{L}*|устал\\p{L}*|подавлен\\p{L}*|тоскл\\p{L}*|хреново|скверно)›'), 2],
  [rx('‹(?:отличн\\p{L}*|супер|прекрасн\\p{L}*|великолепн\\p{L}*|замечательн\\p{L}*|шикарн\\p{L}*|превосходн\\p{L}*|на высоте)›'), 5],
  [rx('‹(?:хорош\\p{L}*|рад\\p{L}*|довол\\p{L}*|бодр\\p{L}*|спокойн\\p{L}*)›'), 4],
  [rx('‹(?:нормальн\\p{L}*|норм|сносн\\p{L}*|ровн\\p{L}*|средн\\p{L}*|так)›'), 3],
];
export function moodLevel(s: string): number | null {
  const d = s.match(/‹?(\d)›?/u);
  if (d && Number(d[1]) >= 1 && Number(d[1]) <= 5) return Number(d[1]);
  for (const [re, lv] of MOOD) if (re.test(s)) return lv;
  return null;
}

add(
  { kind: 'mood.set', re: rx('‹настроени\\p{L}*›(?: сегодня)? ?(.*)$'), slots: (m) => {
    const rest = tidy(m[1]);
    if (/заметк|комментар/u.test(rest)) return null;
    const lv = moodLevel(rest);
    if (lv === null) return null;
    const note = rest.match(/(?:потому что|из за|так как) (.+)$/);
    return { level: lv, note: note?.[1] };
  } },
  { kind: 'mood.set', score: 0.82, full: true, re: rx('^(?:что то )?(?:мне (?:сегодня )?|чувствую себя |я себя чувствую |день (?:был |сегодня )|сегодня |я |у меня )(.+)$'), slots: (m, c) => {
    if (has(QUESTION, c.body) || /‹(?:что делать|если|как)›/u.test(c.body)) return null;
    const lv = moodLevel(m[1]);
    return lv === null ? null : { level: lv };
  } },
  { kind: 'mood.note', over: ['mood.set'], src: 'n', re: rx('‹(?:добавь|запиши|допиши) (?:к настроению|в настроение|к отметке настроения) (?:заметку |комментарий )?(.+)$'), slots: (m) => ({ text: tidy(m[1]) }) },
  { kind: 'mood.worstDays', over: ['mood.set'], re: rx('^(?=.*настроени)(?=.*(?:плох|худш)).*когда.*$') },
  { kind: 'mood.drivers', re: rx('‹что влияет на (?:мо[её] )?настроени\\p{L}*›') },
  { kind: 'mood.trend', re: rx('‹(?:тенденци\\p{L}*|динамик\\p{L}*|тренд) по настроени\\p{L}*›') },

  // water
  { kind: 'water.add', over: ['habit.done'], re: [rx('(?:‹(?:выпил\\p{L}*|попил\\p{L}*)|‹ещ[её]) (?:(\\d+) )?стакан\\p{L}*(?: воды)?›'), rx('‹(?:выпил\\p{L}*|попил\\p{L}*) воды›')], slots: (m) => ({ amount: num(m[1]) ?? 1 }) },
  { kind: 'water.ask', re: rx('‹сколько (?:я )?воды›') },
  { kind: 'water.step', over: ['habit.done'], re: rx('‹отмечай воду по стакану›') },

  // marking habits
  { kind: 'habit.doneAll', over: ['habit.done'], re: rx('^(?:отметь|отметить|отмечай) (?:все|всё|вс[её] привычки|все привычки)(?: на сегодня)?$') },
  { kind: 'habit.markGroup', over: ['habit.done'], re: rx('^(?:отметь|отметить) (?:все|всё|вс[её]) (утренн\\p{L}*|вечерн\\p{L}*|дневн\\p{L}*|основн\\p{L}*|главн\\p{L}*)$'), slots: (m) => ({ group: m[1] }) },
  { kind: 'habit.markPast', over: ['habit.done', 'habit.undone'], re: rx('^(?:верни|поставь|восстанови) (?:отметк\\p{L}*|галочк\\p{L}*) (?:за )?(.+)$'), slots: (m, c) => (c.when.date && c.when.date < today(c) ? { ...withEntity(c, 'habit', m[1]), day: c.when.date } : null) },
  { kind: 'habit.undone', over: ['habit.done'], re: [rx('^(?:сними|убери|сотри|отмени) (?:галочку|отметку) (?:с|у|для|на) (.+)$'), rx('^(?:я )?не (?:делал\\p{L}*|выполнял\\p{L}*|занимался|занималась) (.+)$')], slots: (m, c) => withEntity(c, 'habit', m[1]) },
  { kind: 'habit.done', re: [
    rx('^(?:отметь|отметить|отмечай|засчитай|зачти|поставь (?:галочку|отметку)) (?:на |в |у |для |что )?(?:я )?(?:сегодня )?(?:уже )?(.+)$'),
    rx('^(?:я )?(?:сегодня )?(?:уже )?(?:сделал\\p{L}*|делал\\p{L}*|выполнил\\p{L}*|закончил\\p{L}*|завершил\\p{L}*) (.+)$'),
    rx('^(.+) (?:выполнен\\p{L}*|сделан\\p{L}*|готов\\p{L}*)$'),
    rx('^(?:я )?(?:сегодня )?(?:уже )?((?:по|вы|про|с)?(?:медитир|тренир|занима|гуля|чита|бега|плава|растягива|учи|пробежа|заня)\\p{L}*?(?:л|ла|лся|лась|ли|лись)(?: .+)?)$'),
    rx('^(?:я )?(?:сегодня )?(?:уже )?(?:сходил\\p{L}*|ходил\\p{L}*) ((?:в|на) .+)$'),
  ], slots: (m, c) => {
    let q = tidy(m[1]).replace(/(?:^| )(?:по )?\d+ (?:мин\p{L}*|час\p{L}*)/gu, ' ').replace(/(?:^| )минут \d+/gu, ' ').replace(/ (?:пожалуйста|спасибо)/g, '');
    q = tidy(q);
    const minutes = (c.c.match(/(\d+) мин/) ?? c.c.match(/минут (\d+)/))?.[1];
    if (!q) q = tidy(m[1]);
    const base = withEntity(c, 'habit', q);
    if (c.when.date && c.when.date !== today(c)) base.day = c.when.date;
    return { ...base, minutes: minutes ? Number(minutes) : undefined, amount: undefined };
  } },

  // only the name of a habit: «душ» — worth a question, never a silent mark
  { kind: 'habit.done', score: 0.62, bare: true, re: rx('^(.{3,40})$'), slots: (m, c) => {
    const q = tidy(m[1]);
    if (q.split(' ').length > 3) return null;
    const e = c.habit(q);
    return e && e.sim >= 0.8 ? { query: q, id: e.id, _score: 0.62 } : null;
  } },

  // counters and sleep
  { kind: 'counter.add', re: [rx('^подход (\\d+)$'), rx('^(?:ещ[её] )?(\\d+) (\\p{L}+)$')], slots: (m, c) => {
    if (m[2] && !c.habit(m[2])) return null;
    return { amount: num(m[1]), query: m[2] };
  } },
  { kind: 'counter.steps', re: rx('‹(?:прошел|прошла|нашагал\\p{L}*|сделал\\p{L}*) (\\d+) шаг\\p{L}*›'), slots: (m) => ({ amount: num(m[1]) }) },
  { kind: 'counter.add', over: ['habit.done'], re: rx('‹(?:пробежал\\p{L}*|проплыл\\p{L}*|прошел|прошла) (\\d+(?:[.,]\\d+)?) (километр\\p{L}*|км)›'), slots: (m) => ({ amount: num(m[1]), query: m[2] }) },
  { kind: 'counter.remaining', re: rx('‹сколько (?:еще )?осталось до нормы(?: по (.+))?›'), slots: (m) => ({ query: tidy(m[1]) || undefined }) },
  { kind: 'counter.set', re: rx('‹(?:я )?ошибся(?: было)? (\\d+) (\\p{L}+)›'), slots: (m) => ({ amount: num(m[1]), query: m[2] }) },
  { kind: 'sleep.log', full: true, re: rx('‹лег\\p{L}* (?:спать )?в (\\d{1,2})(?::(\\d\\d))? .*?встал\\p{L}* в (\\d{1,2})(?::(\\d\\d))?›'), slots: (m) => {
    let bed = Number(m[1]); const wake = Number(m[3]);
    if (bed >= 6 && bed <= 12) bed = bed === 12 ? 0 : bed + 12;
    const hrs = ((wake + Number(m[4] ?? 0) / 60) - (bed + Number(m[2] ?? 0) / 60) + 24) % 24;
    return { hours: Math.round(hrs * 2) / 2 };
  } },
  { kind: 'sleep.log', re: rx('‹спал\\p{L}* (\\d+) минут›'), slots: (m) => ({ hours: Math.round(Number(m[1]) / 30) / 2 }) },
  { kind: 'sleep.log', re: rx('‹спал\\p{L}* (\\d+(?:[.,]\\d+)?)( с половиной| половиной)? час\\p{L}*›'), slots: (m) => ({ hours: (num(m[1]) ?? 0) + (m[2] ? 0.5 : 0) }) },

  // managing habits
  { kind: 'habit.addFromLibrary', over: ['habit.add'], re: rx('^(?:добавь|создай|заведи) привычку из библиотеки (.+)$'), slots: (m) => ({ query: tidy(m[1]) }) },
  { kind: 'habit.add', re: rx('^(?:добавь|создай|заведи|добавить|создать|новая) привычку (.+)$'), slots: (m) => {
    let t = tidy(m[1]);
    let target: number | undefined, minutes: number | undefined;
    const mn = t.match(/ ?по (\d+) мин\p{L}*/u); if (mn) { minutes = Number(mn[1]); t = t.replace(mn[0], ''); }
    const tg = t.match(/ ?(\d+) (?:стакан\p{L}*|раз\p{L}*|штук\p{L}*|страниц\p{L}*)/u); if (tg) { target = Number(tg[1]); t = t.replace(tg[0], ''); }
    return { title: tidy(t), target, minutes };
  } },
  { kind: 'habit.remove', over: ['task.delete'], re: rx('^(?:удали|удалить|убери|сотри|выброси) привычку (.+)$'), slots: (m, c) => withEntity(c, 'habit', m[1]) },
  { kind: 'habit.rename', over: ['task.move'], re: rx('^переименуй (?:привычку )?(.+?) в (.+)$'), slots: (m, c) => ({ ...withEntity(c, 'habit', m[1]), to: tidy(m[2]) }) },
  { kind: 'habit.schedule', re: rx('^(.+?) только по (будням|выходным|понедельникам|вторникам|средам|четвергам|пятницам|субботам|воскресеньям)$'), slots: (m, c) => {
    const bits: Record<string, number> = { будням: 31, выходным: 96, понедельникам: 1, вторникам: 2, средам: 4, четвергам: 8, пятницам: 16, субботам: 32, воскресеньям: 64 };
    return { ...withEntity(c, 'habit', m[1]), days: bits[m[2]] };
  } },
  { kind: 'habit.core', re: rx('^сделай (.+?) (?:главной|основной) привычкой$'), slots: (m, c) => ({ ...withEntity(c, 'habit', m[1]), core: true }) },
  { kind: 'habit.pause', re: rx('^поставь (?:привычку )?(.+?) на паузу$'), slots: (m, c) => withEntity(c, 'habit', m[1]) },

  // statistics
  { kind: 'habit.streak', re: rx('‹серия(?: по (.+))?›'), slots: (m, c) => (m[1] ? withEntity(c, 'habit', m[1]) : {}) },
  { kind: 'habit.weakest', re: rx('^(?=.*привычк)(?=.*(?:слаб|пропуска|проседа|хуже всего)).*$') },
  { kind: 'habit.count', re: rx('‹сколько раз я (?:делал\\p{L}*|выполнял\\p{L}*) (.+)›'), slots: (m, c) => withEntity(c, 'habit', m[1]) },
);
