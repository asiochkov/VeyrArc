import { add, rx } from '../engine';
import { periodIn } from '../../period';
import { num, tidy, withEntity } from './util';

/* WP5.7 phrases: focus, timers, pomodoro cycles, habit timers (catalog 54–61, 118–120). */
const sec = (n: string, unit: string) => Math.round(num(n)! * (/^сек|^sec/.test(unit) ? 1 : /^мин|^min/.test(unit) ? 60 : 3600));
const P = '(на этой неделе|за неделю|в этом месяце|за месяц|за 30 дней|сегодня|за все время)';
// the period word may be out of its order or lose its preposition in a noisy phrase
const per = (s: string | undefined): 'day' | 'week' | 'month' | '30' | 'all' => (/недел|week/.test(s ?? '') ? 'week' : /месяц|month/.test(s ?? '') ? 'month' : /30/.test(s ?? '') ? '30' : /все время|всего|overall/.test(s ?? '') ? 'all' : periodIn(s ?? '') ?? 'day');
add(
  { kind: 'focus.start', over: ['timer.simple'], re: rx('^(?:начни|начать|запусти|включи|старт|стартуй) (?:фокус|помодоро)(?: (\\d+)(?: минут\\p{L}*)?)? (?:над|по|для) (?:цел\\p{L}* )?(.+)$'), slots: (m, c) => ({ minutes: c.when.duration ?? num(m[1]), link: tidy(m[2]) }) },
  { kind: 'focus.start', re: rx('^фокус (\\d+) (?:над|по|для) (?:цел\\p{L}* )?(.+)$'), slots: (m, c) => ({ minutes: c.when.duration ?? num(m[1]), link: tidy(m[2]) }) },
  { kind: 'focus.start', re: rx('^(?:привяжи|прикрепи|свяжи) (?:текущий )?(?:фокус|сессию|таймер) (?:к|с) (?:цел\\p{L}* |делу |привычке |событию )?(.+)$'), slots: (m) => ({ link: tidy(m[1]) }) },
  { kind: 'focus.break', over: ['focus.pause'], re: rx('^(?:начни |запусти |включи )?(?:перерыв|отдых)(?: (\\d+)(?: минут\\p{L}*)?)?$|^(?:сделаем|давай) перерыв$'), slots: (m, c) => ({ minutes: c.when.duration ?? num(m[1]) }) },
  { kind: 'focus.stop', over: ['focus.pause'], re: rx('^(?:остановить|останови|заверши) (?:и )?засчитай(?: что есть)?$|^останови и засчитай что есть$') },
  { kind: 'focus.sum', over: ['focus.sum'], re: rx('^сколько (?:времени |часов )?я (?:работал\\p{L}*|фокусировал\\p{L}*|сосредоточ\\p{L}*|был в фокусе)(?: (.+))?$'), slots: (m) => ({ period: per(m[1]) }) },
  { kind: 'focus.sum', over: ['focus.sum'], re: rx(`^(?:мой )?фокус ${P}$|^сколько фокуса ${P}$`), slots: (m) => ({ period: per(m[1] ?? m[2]) }) },
  { kind: 'focus.norm', over: ['focus.norm'], re: rx('^(?:поставь|установи|задай|сделай) (?:мне )?(?:дневн\\p{L}* )?норм\\p{L}* (?:фокус\\p{L}* )?(?:на )?(?:(\\d+) (час\\p{L}*|минут\\p{L}*)|(час\\p{L}*|минут\\p{L}*) (\\d+))$'), slots: (m) => ({ minutes: /час/.test(m[2] ?? m[3]) ? num(m[1] ?? m[4])! * 60 : num(m[1] ?? m[4]) }) },
  { kind: 'focus.norm', re: rx('^(?:поставь|установи|задай|сделай) (?:мне )?(?:дневн\\p{L}* )?норм\\p{L}* (?:фокус\\p{L}* )?(?:на )?$'), slots: (_m, c) => ({ minutes: c.when.duration }) },
  { kind: 'focus.cycle', over: ['focus.start'], re: rx('^(?:режим |запусти |включи |начни )?помодоро(?: режим)? (\\d+)(?: по)? (\\d+)(?: минут\\p{L}*)?$'), slots: (m) => ({ n: num(m[1]), minutes: num(m[2]) }) },
  { kind: 'focus.cycle', over: ['focus.start'], re: rx('^(?:режим |запусти |включи )?помодоро$|^запусти цикл$'), slots: () => ({ n: 4, minutes: 25 }) },
  { kind: 'timer.simple', over: ['timer.simple'], re: rx('^(?:включи|поставь|запусти|заведи|засеки) (?:мне )?таймер на (\\d+) (секунд\\p{L}*|минут\\p{L}*|час\\p{L}*)$'), slots: (m) => ({ seconds: sec(m[1], m[2]) }) },
  { kind: 'timer.simple', over: ['timer.simple'], re: rx('^таймер (?:на )?(\\d+) (секунд\\p{L}*|минут\\p{L}*|час\\p{L}*)$'), slots: (m) => ({ seconds: sec(m[1], m[2]) }) },
  { kind: 'habit.timer', over: ['habit.done', 'focus.start'], full: true, re: rx('^(?:начни|начать|запусти|включи|старт|стартуй) (?!фокус|помодоро|таймер|перерыв)(.+?)(?: на (\\d+) (минут\\p{L}*|час\\p{L}*))?$'), slots: (m, c) => {
    const e = c.habit(tidy(m[1]));
    if (!e) return null;
    const min = m[2] ? (/час/.test(m[3]) ? num(m[2])! * 60 : num(m[2])) : c.when.duration;
    return { ...withEntity(c, 'habit', m[1]), minutes: min };
  } },
  { kind: 'habit.timerStop', re: rx('^(?:останови|остановить|заверши|завершить) (?:привычку|привычку таймер|таймер привычки)$|^останови привычку$') },
);
const en = (...rules: Parameters<typeof add>) => add(...rules.map((r) => ({ ...r, lang: 'en' as const })));
const PE = '(this week|this month|today|in the last 30 days|overall)';
en(
  { kind: 'focus.start', re: rx('^(?:start |begin )?(?:a )?(?:focus|pomodoro)(?: (\\d+))?(?: minutes?)? (?:on|for) (?:the )?(?:goal )?(.+)$'), slots: (m, c) => ({ minutes: c.when.duration ?? num(m[1]), link: tidy(m[2]) }) },
  { kind: 'focus.start', re: rx('^(?:link|attach|tie) (?:the )?(?:current )?(?:focus|session|timer) to (?:the )?(?:goal )?(.+)$'), slots: (m) => ({ link: tidy(m[1]) }) },
  { kind: 'focus.break', over: ['focus.pause'], re: rx('^(?:start |take )?(?:a )?break(?: (?:of )?(\\d+)(?: minutes?)?)?$'), slots: (m, c) => ({ minutes: c.when.duration ?? num(m[1]) }) },
  { kind: 'focus.stop', over: ['focus.pause'], re: rx('^stop and count (?:what(?:s| is) there|it)$') },
  { kind: 'focus.sum', over: ['focus.sum'], re: rx(`^how (?:long|much time) (?:did i|have i) (?:work|worked|focus|focused)(?: ${PE})?$`), slots: (m) => ({ period: periodIn(m[1] ?? '') ?? 'day' }) },
  { kind: 'focus.norm', re: rx('^set (?:my )?(?:daily )?focus (?:norm|goal|target)(?: to)?$'), slots: (_m, c) => ({ minutes: c.when.duration }) },
  { kind: 'focus.norm', re: rx('^set (?:my )?(?:daily )?focus (?:norm|goal|target)(?: to)? (\\d+) (hours?|minutes?)$'), slots: (m) => ({ minutes: /hour/.test(m[2]) ? num(m[1])! * 60 : num(m[1]) }) },
  { kind: 'focus.cycle', over: ['focus.start'], re: rx('^(?:pomodoro|pomodoro mode) (\\d+) (?:times |x |by |of )(\\d+)(?: minutes?)?$|^(?:pomodoro|pomodoro mode) (\\d+) by (\\d+)$'), slots: (m) => ({ n: num(m[1] ?? m[3]), minutes: num(m[2] ?? m[4]) }) },
  { kind: 'focus.cycle', over: ['focus.start'], re: rx('^(?:start |run )?pomodoro mode$'), slots: () => ({ n: 4, minutes: 25 }) },
  { kind: 'timer.simple', over: ['timer.simple'], re: rx('^(?:set|start|run) (?:a |the )?timer (?:for |of )?(\\d+) (seconds?|minutes?|hours?)$'), slots: (m) => ({ seconds: sec(m[1], m[2]) }) },
  { kind: 'habit.timer', over: ['habit.done', 'focus.start'], full: true, re: rx('^(?:start|begin) (?!focus|pomodoro|timer|a break|break)(.+?)(?: for (\\d+) (minutes?|hours?))?$'), slots: (m, c) => {
    if (!c.habit(tidy(m[1]))) return null;
    const min = m[2] ? (/hour/.test(m[3]) ? num(m[2])! * 60 : num(m[2])) : c.when.duration;
    return { ...withEntity(c, 'habit', m[1]), minutes: min };
  } },
  { kind: 'habit.timerStop', re: rx('^stop (?:the )?habit(?: timer)?$') },
);
