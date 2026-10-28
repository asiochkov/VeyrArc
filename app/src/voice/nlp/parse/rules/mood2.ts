import { add, rx } from '../engine';
import { num, tidy, withEntity } from './util';

/* WP5.2 phrases: water, mood notes and questions, counters, steps, sleep (catalog 14–21, 108–113, 116, 158). */
const en = (...rules: Parameters<typeof add>) => add(...rules.map((r) => ({ ...r, lang: 'en' as const })));
add(
  { kind: 'water.add', over: ['habit.done'], re: rx('^(?:плюс|добавь|запиши|ещ[её]) (?:(\\d+) )?стакан\\p{L}*(?: воды)?$'), slots: (m) => ({ amount: num(m[1]) ?? 1 }) },
  { kind: 'water.add', over: ['habit.done'], re: rx('^(?:выпил\\p{L}*|попил\\p{L}*) (?:ещ[её] )?(?:(\\d+) )?(?:стакан\\p{L}*|чашк\\p{L}*)(?: воды)?$'), slots: (m) => ({ amount: num(m[1]) ?? 1 }) },
  { kind: 'water.ask', over: ['water.add', 'habit.count', 'habit.done'], re: rx('^(?:сколько (?:я )?(?:выпил\\p{L}* )?(?:стаканов )?воды(?: уже)?(?: сегодня)?|сколько воды (?:сегодня|уже)|много ли я выпил воды)$|‹сколько стаканов(?: воды)?(?: я выпил)?(?: сегодня)?›') },
  { kind: 'mood.note', over: ['mood.set'], src: 'n', re: rx('^(?:запиши|добавь|допиши) (?:к настроению|в настроение|к дню|в заметку дня)[: ]?(.+)$|^заметка к настроению[: ]?(.+)$'), slots: (m) => ({ text: tidy(m[1] ?? m[2]) }) },
  { kind: 'mood.worstDays', over: ['mood.set'], re: rx('^(?=.*настроени)(?=.*(?:плох|худш|низк)).*(?:дни|день|когда).*$') },
  { kind: 'mood.worstDays', over: ['mood.set'], re: rx('‹худшие дни(?: по настроению)?›') },
  { kind: 'mood.drivers', re: rx('‹(?:от чего зависит|что улучшает|что портит|что связано с) (?:мо\\p{L}* )?настроени\\p{L}*›') },
  { kind: 'mood.trend', over: ['mood.set'], re: rx('‹как менялось (?:мо[её] )?настроени\\p{L}*›|‹настроени\\p{L}* (?:растёт|растет|падает|снижается) или (?:растёт|растет|падает|снижается)›') },
  { kind: 'counter.add', re: rx('^(?:ещ[её] )?подход (\\d+)$'), slots: (m) => ({ amount: num(m[1]) }) },
  { kind: 'counter.remaining', re: rx('^сколько (?:ещ[её] )?(?:нужно|осталось|надо) до нормы(?: по (.+))?$'), slots: (m) => ({ query: tidy(m[1]) || undefined }) },
  { kind: 'counter.set', re: rx('^(?:обнули|сбрось|обнулить) (.+)$'), slots: (m, c) => ({ ...withEntity(c, 'habit', m[1]), amount: 0 }) },
  { kind: 'counter.set', re: rx('^(?:я ошибся|ошибся|поправь|исправь)(?: было| на)? (\\d+)$'), slots: (m) => ({ amount: num(m[1]) }) },
  { kind: 'counter.set', re: rx('^(?:исправь|поправь) (.+?) на (\\d+)$'), slots: (m, c) => ({ ...withEntity(c, 'habit', m[1]), amount: num(m[2]) }) },
  { kind: 'counter.steps', re: rx('‹(?:сегодня )?шагов (\\d+)›|‹(?:прошел|прошла|нашагал\\p{L}*) (\\d+) шаг\\p{L}*›'), slots: (m) => ({ amount: num(m[1] ?? m[2]) }) },
  { kind: 'sleep.log', full: true, re: rx('‹(?:лег|легла|засыпал\\p{L}*|уснул\\p{L}*) (?:спать )?в (\\d{1,2})(?:[: ](\\d\\d))? (?:и )?(?:встал\\p{L}*|проснул\\p{L}*|поднял\\p{L}*) в (\\d{1,2})(?:[: ](\\d\\d))?›'), slots: (m) => {
    let bed = Number(m[1]); const wake = Number(m[3]);
    if (bed >= 6 && bed <= 12) bed = bed === 12 ? 0 : bed + 12;
    return { hours: Math.round(((wake + Number(m[4] ?? 0) / 60) - (bed + Number(m[2] ?? 0) / 60) + 24) % 24 * 2) / 2 };
  } },
  { kind: 'sleep.log', re: rx('‹(?:спал\\p{L}*|поспал\\p{L}*|выспал\\p{L}*) (\\d+) час\\p{L}*›'), slots: (m) => ({ hours: num(m[1]) }) },
);
en(
  { kind: 'water.add', over: ['habit.done'], re: rx('^(?:plus|add|one more|another) (?:(\\d+) )?glass(?:es)?(?: of water)?$'), slots: (m) => ({ amount: num(m[1]) ?? 1 }) },
  { kind: 'water.ask', re: rx('‹how many glasses(?: of water)?(?: have i had)?(?: today)?›') },
  { kind: 'mood.note', over: ['mood.set'], src: 'n', re: rx('^(?:add|write) (?:a )?(?:note|comment) (?:to|for) (?:today|the day)[: ]?(.+)$|^note for my mood[: ]?(.+)$'), slots: (m) => ({ text: tidy(m[1] ?? m[2]) }) },
  { kind: 'mood.drivers', re: rx('‹what (?:improves|hurts|is linked to) my mood›') },
  { kind: 'mood.trend', over: ['mood.set'], re: rx('‹how has my mood (?:changed|been)›|‹is my mood (?:rising|falling|improving)›') },
  { kind: 'counter.add', re: rx('^set (\\d+)$|^another set of (\\d+)$'), slots: (m) => ({ amount: num(m[1] ?? m[2]) }) },
  { kind: 'counter.remaining', re: rx('^how (?:much|many) (?:more )?(?:until|to) (?:the )?(?:goal|target)(?: for (.+))?$'), slots: (m) => ({ query: tidy(m[1]) || undefined }) },
  { kind: 'counter.set', re: rx('^(?:reset|zero) (?:the )?(.+)$'), slots: (m, c) => ({ ...withEntity(c, 'habit', m[1]), amount: 0 }) },
  { kind: 'sleep.log', re: rx('‹(?:i )?slept (\\d+) hours?›'), slots: (m) => ({ hours: num(m[1]) }) },
);
