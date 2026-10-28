import { add, rx } from '../engine';
import { isoDay } from '../../dates';
import { num, tidy, withEntity } from './util';

/* WP5.4 phrases: goals, steps, the diary (catalog 29–39, 173, 177–184). Lists come from the raw text, where the commas still are. */
const MONTHS = ['январ', 'феврал', 'март', 'апрел', 'ма[яй]', 'июн', 'июл', 'август', 'сентябр', 'октябр', 'ноябр', 'декабр'];
const EN_MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
/** the last day of the named month, this year or next */
export function monthEnd(text: string, now: Date): string | null {
  const i = MONTHS.findIndex((m) => new RegExp(m).test(text)); const j = EN_MONTHS.findIndex((m) => text.includes(m));
  const mo = i >= 0 ? i : j;
  if (mo < 0) return null;
  let y = now.getFullYear();
  if (new Date(y, mo + 1, 0) < now) y++;
  return isoDay(new Date(y, mo + 1, 0));
}
/** «купить кроссовки, найти план и первая пробежка» → three items; the colon or the marker starts the list */
export function listAfter(raw: string, marker: RegExp): string[] {
  const m = raw.match(marker);
  const tail = (m ? raw.slice((m.index ?? 0) + m[0].length) : raw).replace(/^[\s:—-]+/, '');
  return tail.split(/\s*[,;]\s*|\s+(?:и|and)\s+/).map((x) => x.trim().replace(/[.!?]+$/, '')).filter(Boolean);
}

add(
  { kind: 'goal.add', score: 0.88, re: rx('^хочу ((?:научиться|выучить|освоить|накопить|похудеть|написать|прочитать|пробежать|заработать|накопить|сбросить|подтянуть|улучшить)\\p{L}*(?: .+)?)$'), slots: (m) => ({ title: tidy(m[1]) }) },
  { kind: 'goal.next', re: rx('‹(?:что дальше|следующий шаг|с какого шага начать|какой шаг) (?:по |для )?(?:цели |цель )?(.+)›'), slots: (m, c) => withEntity(c, 'goal', m[1]) },
  { kind: 'goal.progress', over: ['goal.progress'], re: rx('‹(?:как у меня с целью|как дела с целью|как моя цель|прогресс по цели|как продвигается цель) (.+)›'), slots: (m, c) => withEntity(c, 'goal', m[1]) },
  { kind: 'goal.pace', re: rx('‹(?:успею ли я к дедлайну по|успею ли я по|хватит ли времени на цель|какой темп по цели|какой темп по) (.+)›'), slots: (m, c) => withEntity(c, 'goal', m[1]) },
  { kind: 'goal.pace', over: ['goal.progress'], re: rx('^сколько мне до цели при текущем темпе$|^успею ли я к дедлайну$') },
  { kind: 'goal.deadline', re: rx('^(?:перенеси|измени|сдвинь) (?:дедлайн|срок)(?: цели| по цели| по)? (.+)$'), slots: (m, c) => (c.when.date ? { ...withEntity(c, 'goal', m[1].replace(/ на$/, '')), day: c.when.date } : null) },
  { kind: 'goal.complete', re: rx('^(?:закрой|закончи|заверши) цель (.+)$|^цель (.+) (?:выполнена|достигнута|готова)$'), slots: (m, c) => withEntity(c, 'goal', m[1] ?? m[2]) },
  { kind: 'goal.rename', over: ['habit.rename', 'task.move'], re: rx('^переименуй цель (.+?) в (.+)$'), slots: (m, c) => ({ ...withEntity(c, 'goal', m[1]), to: tidy(m[2]) }) },
  { kind: 'goal.step.rename', over: ['habit.rename', 'task.move'], re: rx('^переименуй шаг (.+?) в (.+)$'), slots: (m, c) => ({ ...withEntity(c, 'task', m[1]), query: tidy(m[1]), to: tidy(m[2]), _score: 0.9 }) },
  { kind: 'goal.step.delete', re: rx('^(?:удали|убери|сотри) шаг (.+?)(?: из цели .+)?$'), slots: (m) => ({ query: tidy(m[1]) }) },
  { kind: 'goal.link', full: true, re: rx('^привяжи цель(?: (.+?))? к (.+)$'), slots: (m, c) => ({ ...(m[1] ? withEntity(c, 'goal', m[1]) : {}), habit: tidy(m[2]) }) },
  { kind: 'goal.diary.add', over: ['task.add'], src: 'n', re: rx('^(?:запиши|добавь|допиши) в дневник (?:цели )?(.+?)[: ] ?(?:сегодня |вчера )?(.+)$'), slots: (m, c) => ({ ...withEntity(c, 'goal', m[1]), text: tidy(m[2]) }) },
  { kind: 'goal.diary.read', re: rx('^(?:прочитай|покажи|что я писал в) (?:дневник цели|дневнике цели|дневник)(?: (.+?))?$'), slots: (m, c) => ({ ...(m[1] ? withEntity(c, 'goal', m[1]) : {}), day: c.when.date }) },
  { kind: 'goal.diary.read', over: ['goal.diary.read'], re: rx('^прочитай дневник цели(?: (.+?))?$'), slots: (m, c) => ({ ...(m[1] ? withEntity(c, 'goal', m[1]) : {}), day: c.when.date }) },
  { kind: 'goal.split', src: 'raw', re: rx('^(?:разбей|раздели) цель(?: (.+?))? на шаги[: ]*(.+)$'), slots: (m, c) => ({ ...(m[1] ? withEntity(c, 'goal', m[1]) : {}), steps: listAfter(m[2], /^/) }) },
  { kind: 'goal.hot', over: ['plan.day'], re: rx('‹что (?:у меня )?горит(?: по целям)?›|‹какие цели горят›') },
  { kind: 'goal.step.add', over: ['task.add'], re: [rx('^(?:в цель|к цели|в цели) (.+?) (?:добавь|добавить) (?:шаг )?(.+)$'), rx('^(?:добавь|добавить) шаг (.+?) (?:в цель|к цели|в цели) (.+)$')], slots: (m, c) => (/^добавь|^добавить/.test(c.body) ? { goal: tidy(m[2]), text: tidy(m[1]) } : { goal: tidy(m[1]), text: tidy(m[2]) }) },
  { kind: 'goal.addFull', over: ['goal.add', 'task.add'], src: 'raw', re: rx('^(?:(?:создай|добавь|поставь) )?цель (.+?)(?: (?:до|к) (\\p{L}+))?\\s*:\\s*(.+)$'), slots: (m, c) => {
    const items = listAfter(m[3], /^/);
    if (items.length < 2) return null;
    return { title: tidy(m[1]), day: (m[2] ? monthEnd(m[2], c.env.now) : null) ?? undefined, steps: items };
  } },
  { kind: 'goal.suggestHabit', over: ['habit.schedule'], src: 'n', re: rx('^хочу (бегать|плавать|заниматься|читать|ходить в зал|медитировать|гулять|учить [а-я ]+|тренироваться) (?:(\\d+|два|три|четыре|пять|шесть) раза?? в неделю|каждый день)$'), slots: (m) => ({ title: tidy(m[1]), times: ({ два: 2, три: 3, четыре: 4, пять: 5, шесть: 6 } as Record<string, number>)[m[2]] ?? num(m[2]) ?? 7 }) },
  { kind: 'goal.stepsLeft', re: rx('‹сколько шагов осталось(?: в цели| по цели)?(?: (.+))?›'), slots: (m, c) => (m[1] ? withEntity(c, 'goal', m[1]) : {}) },
  { kind: 'goal.markAll', over: ['habit.doneAll', 'habit.done'], re: rx('^отметь все шаги(?: цели)?(?: (.+))?$'), slots: (m, c) => (m[1] ? withEntity(c, 'goal', m[1]) : {}) },
  { kind: 'goal.closest', re: rx('‹какая цель ближе всего к завершению›|‹какая цель почти готова›') },
  { kind: 'goal.stalled', re: rx('‹какая цель стоит без движения›|‹какие цели (?:стоят|без движения)›') },
  { kind: 'goal.priority', over: ['task.add'], re: rx('^приоритет цели (.+?) (высокий|обычный|низкий|нормальный)$|^(?:сделай|поставь) цель (.+?) приоритетной$'), slots: (m, c) => ({ ...withEntity(c, 'goal', m[1] ?? m[3]), level: /обыч|низк|нормал/.test(m[2] ?? '') ? 'normal' : 'high' }) },
  { kind: 'goal.challenge', re: rx('^(?:дай|предложи|хочу) челлендж(?: на неделю)?$|^челлендж на неделю$') },
);

const en = (...rules: Parameters<typeof add>) => add(...rules.map((r) => ({ ...r, lang: 'en' as const })));
en(
  { kind: 'goal.next', re: rx('‹(?:what is|whats) the next step (?:for|on|of) (?:the )?(?:goal )?(.+)›'), slots: (m, c) => withEntity(c, 'goal', m[1]) },
  { kind: 'goal.progress', over: ['goal.progress'], re: rx('‹how(?:s| is) (?:my )?(?:goal|progress on) (.+)›|‹progress on (?:the )?goal (.+)›'), slots: (m, c) => withEntity(c, 'goal', m[1] ?? m[2]) },
  { kind: 'goal.pace', re: rx('‹will i (?:make|meet) the deadline (?:for|on) (.+)›'), slots: (m, c) => withEntity(c, 'goal', m[1]) },
  { kind: 'goal.rename', re: rx('^rename (?:the )?goal (.+?) to (.+)$'), slots: (m, c) => ({ ...withEntity(c, 'goal', m[1]), to: tidy(m[2]) }) },
  { kind: 'goal.step.delete', re: rx('^(?:delete|remove) (?:the )?step (.+)$'), slots: (m) => ({ query: tidy(m[1]) }) },
  { kind: 'goal.diary.add', over: ['task.add'], src: 'n', re: rx('^(?:write|add) (?:in|to) (?:the )?diary (?:of|for) (?:the )?(?:goal )?(.+?)[: ] ?(.+)$'), slots: (m, c) => ({ ...withEntity(c, 'goal', m[1]), text: tidy(m[2]) }) },
  { kind: 'goal.hot', re: rx('‹what(?:s| is) urgent (?:in|for) (?:my )?goals›|‹which goals are (?:hot|urgent)›') },
  { kind: 'goal.stepsLeft', re: rx('‹how many steps (?:are )?left(?: in (?:the )?goal (.+))?›'), slots: (m, c) => (m[1] ? withEntity(c, 'goal', m[1]) : {}) },
  { kind: 'goal.markAll', over: ['habit.doneAll', 'habit.done'], re: rx('^(?:mark|check) all (?:goal )?steps(?: of (?:the )?(?:goal )?(.+))?$'), slots: (m, c) => (m[1] ? withEntity(c, 'goal', m[1]) : {}) },
  { kind: 'goal.closest', re: rx('‹which goal is closest to (?:done|completion)›') },
  { kind: 'goal.stalled', re: rx('‹which goal (?:is stuck|has no movement)›') },
  { kind: 'goal.priority', over: ['task.add'], re: rx('^(?:the )?priority of (?:the )?goal (.+?) is (high|normal|low)$'), slots: (m, c) => ({ ...withEntity(c, 'goal', m[1]), level: m[2] === 'high' ? 'high' : 'normal' }) },
  { kind: 'goal.challenge', re: rx('^(?:give me|suggest) a (?:weekly )?challenge(?: for the week)?$') },
);
