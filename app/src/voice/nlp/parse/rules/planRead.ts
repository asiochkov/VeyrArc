import { add, rx } from '../engine';
import { addDay, num, tidy, today } from './util';

/* WP5.6 phrases: reading the planner, dates, holidays (catalog 41, 45–47, 52, 138–141, 144–148, 196, 199, 200, 208). */
const mon0 = (d: Date) => (d.getDay() + 6) % 7;
add(
  { kind: 'plan.week', over: ['plan.day'], re: rx('‹(?:что у меня|что) на этой неделе›|^(?:сводка|обзор|расписание|план) (?:на |по )?(?:этой )?недел\\p{L}*$|^покажи неделю$') },
  { kind: 'plan.count', over: ['list.remaining'], re: rx('‹сколько (?:у меня )?(созвонов|встреч|тренировок|событий|звонков|задач|дел)(?: на этой неделе)?›'), slots: (m) => ({ query: /встреч|событий|задач|дел$/.test(m[1]) ? undefined : m[1] }) },
  { kind: 'plan.freeSlots', over: ['plan.day'], full: true, re: rx('^найди (?:мне )?(?:окно|время|день)(?: для [а-я ]+?)?(?: на (?:(\\d+) (минут\\p{L}*|час\\p{L}*)|час))?$'), slots: (m, c) => ({ minutes: m[1] ? (/час/.test(m[2]) ? num(m[1])! * 60 : num(m[1])) : c.when.duration ?? 60, scan: true }) },
  { kind: 'plan.freeSlots', over: ['plan.day'], full: true, re: rx('^найди (?:мне )?(?:окно|время|день)(?: для [а-я ]+)? на (\\d+) (час\\p{L}*|минут\\p{L}*)$'), slots: (m) => ({ minutes: /час/.test(m[2]) ? num(m[1])! * 60 : num(m[1]), scan: true }) },
  { kind: 'plan.freeSlots', re: rx('‹когда я (?:.* )?свободен›|‹есть ли у меня окна›'), slots: (_m, c) => ({ day: c.when.date ?? today(c) }) },
  { kind: 'plan.freest', re: rx('‹(?:какой|в какой) день (?:на неделе )?(?:самый свободный|я свободнее всего|свободнее всего)›|‹самый свободный день›') },
  { kind: 'plan.hours', re: rx('‹сколько часов (?:у меня )?(?:запланировано|занято|занят)(?: на)?›'), slots: (_m, c) => ({ day: c.when.date ?? today(c) }) },
  { kind: 'plan.overdue', over: ['plan.day'], re: rx('‹что (?:у меня )?просрочено›|‹какие (?:у меня )?хвосты›|‹что я не закрыл›') },
  { kind: 'plan.top', re: rx('‹что (?:самое )?важн\\p{L}*(?: на| у меня)?(?: сегодня)?›|‹какие (?:у меня )?главные дела›') },
  { kind: 'plan.trim', re: rx('‹что можно убрать из плана(?: на завтра)?›') },
  { kind: 'list.remaining', over: ['plan.count'], re: rx('‹какие (?:у меня )?(покупки) остались›|^прочитай список (покупок)$'), slots: () => ({ query: 'купить' }) },
  { kind: 'date.diff', full: true, re: rx('^сколько (?:дней )?(?:мне )?до (.+)$'), slots: (m, c) => {
    if (/конца сезона|сезона/.test(m[1])) return { to: 'season' };
    if (/выходн/.test(m[1])) return null;
    const date = c.when.date ?? (/нового года/.test(m[1]) ? `${c.env.now.getFullYear() + 1}-01-01` : null);
    return date ? { to: date, label: tidy(m[1]) } : null;
  } },
  { kind: 'date.diff', over: ['date.diff'], re: rx('^через сколько (?:будет|дней) выходн\\p{L}*$'), slots: (_m, c) => ({ to: addDay(c.env.now, mon0(c.env.now) >= 5 ? 0 : 5 - mon0(c.env.now)), label: 'выходных' }) },
  { kind: 'date.diff', over: ['date.diff'], re: rx('^сколько (?:дней )?до конца сезона$|^сколько осталось до конца сезона$'), slots: () => ({ to: 'season' }) },
  { kind: 'date.weekday', full: true, re: rx('^какой (?:день недели|будет день недели|день)(?: будет)? (.+)$'), slots: (_m, c) => (c.when.date ? { date: c.when.date } : null) },
  { kind: 'holiday.next', over: ['plan.next'], re: rx('‹(?:когда )?(?:ближайший|следующий) праздник\\p{L}*›|‹когда (?:будет )?(?:ближайший )?праздник›') },
);
const en = (...rules: Parameters<typeof add>) => add(...rules.map((r) => ({ ...r, lang: 'en' as const })));
en(
  { kind: 'plan.week', over: ['plan.day'], re: rx('‹what(?:s| is) (?:on )?(?:this week|my week)›|^(?:show|give me) (?:my )?week(?:ly)? (?:summary|overview)$') },
  { kind: 'plan.freeSlots', full: true, over: ['plan.day'], re: rx('^find (?:me )?(?:a )?(?:window|time|slot|day)(?: for [a-z ]+)?(?: (?:of|for) (\\d+) (minutes?|hours?))?$'), slots: (m, c) => ({ minutes: m[1] ? (/hour/.test(m[2]) ? num(m[1])! * 60 : num(m[1])) : c.when.duration ?? 60, scan: true }) },
  { kind: 'plan.freest', re: rx('‹which day (?:this week )?is (?:the )?(?:freest|most free)›') },
  { kind: 'plan.hours', re: rx('‹how many hours (?:are )?(?:planned|booked)(?: for)?›'), slots: (_m, c) => ({ day: c.when.date ?? today(c) }) },
  { kind: 'plan.overdue', over: ['plan.day'], re: rx('‹what(?:s| is) overdue›') },
  { kind: 'plan.top', re: rx('‹what(?:s| is) (?:the )?most important(?: today)?›') },
  { kind: 'plan.trim', re: rx('‹what can i (?:remove|drop|cut) from (?:my )?(?:plan|tomorrow)›') },
  { kind: 'date.diff', full: true, re: rx('^how many days (?:until|to|till) (.+)$'), slots: (m, c) => (/end of (?:the )?season/.test(m[1]) ? { to: 'season' } : c.when.date ? { to: c.when.date, label: tidy(m[1]) } : null) },
  { kind: 'date.weekday', full: true, re: rx('^what day of the week (?:is|will be) (.+)$'), slots: (_m, c) => (c.when.date ? { date: c.when.date } : null) },
  { kind: 'holiday.next', over: ['plan.next'], re: rx('‹when(?:s| is) the next holiday›|‹(?:what is |whats )?(?:the )?next holiday›') },
);
