import { add, rx } from '../engine';
import { isoDay } from '../../dates';
import { num, tidy, withEntity } from './util';

/* WP5.3 phrases: quits (catalog 22–28, 165). «с понедельника» means the Monday that has already passed. */
const WD: [RegExp, number][] = [[/понедельник|monday/, 1], [/вторник|tuesday/, 2], [/сред[аыу]|wednesday/, 3], [/четверг|thursday/, 4], [/пятниц|friday/, 5], [/суббот|saturday/, 6], [/воскресень|sunday/, 0]];
function sinceOf(text: string, now: Date): string | null {
  for (const [re, wd] of WD) if (re.test(text)) { const back = (now.getDay() - wd + 7) % 7; return isoDay(new Date(now.getFullYear(), now.getMonth(), now.getDate() - back)); }
  if (/вчера|yesterday/.test(text)) return isoDay(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1));
  if (/сегодня|today/.test(text)) return isoDay(now);
  const n = text.match(/(\d+) (?:дн|day)/);
  if (n) return isoDay(new Date(now.getFullYear(), now.getMonth(), now.getDate() - Number(n[1])));
  return null;
}
const VERBS = 'курю|пью|ем|употребляю|играю|смотрю|ругаюсь|грызу|тратю';
add(
  { kind: 'quit.add', re: rx('^(?:брошу|бросаю|бросил|завязываю с|завязал с|перестану|хочу перестать|хочу отказаться от|отказываюсь от|начинаю отказ от|новый отказ от) (.+)$'), slots: (m) => ({ title: tidy(m[1]) }) },
  { kind: 'quit.add', full: true, re: rx(`^(?:я )?не (${VERBS})(?: (.+?))? (?:с|со) (.+)$`), slots: (m, c) => {
    const since = sinceOf(m[3], c.env.now);
    return since ? { title: tidy(m[2] ?? m[1]), since } : null;
  } },
  { kind: 'quit.days', over: ['habit.streak', 'quit.days'], re: rx('‹сколько дней (?:я )?(?:уже )?(?:не |без )(.+)›'), slots: (m, c) => withEntity(c, 'quit', m[1]) },
  { kind: 'quit.days', over: ['quit.days'], re: rx('^сколько (?:я )?уже не (.+)$'), slots: (m, c) => withEntity(c, 'quit', m[1]) },
  { kind: 'quit.days', re: rx('‹(?:как долго|сколько времени) (?:я )?(?:уже )?не (.+)›'), slots: (m, c) => withEntity(c, 'quit', m[1]) },
  { kind: 'quit.days', re: rx('^сколько дней (?:я )?не (?:курю|пью)$|^сколько дней без срыва$') },
  { kind: 'quit.avoided', over: ['quit.days'], re: rx('‹сколько (сигарет|бокалов|чашек|порций|штук)(?: я)? (?:уже )?не (?:выкурил\\p{L}*|выпил\\p{L}*|съел\\p{L}*|использовал\\p{L}*)›') },
  { kind: 'quit.avoided', over: ['quit.days'], re: rx('‹сколько (?:я )?(?:уже )?(?:сэкономил\\p{L}*|не (?:выкурил\\p{L}*|выпил\\p{L}*))›') },
  { kind: 'quit.goal', re: rx('^(?:поставь|установи|задай|сделай) цель по отказу(?: от)?(?: ([^\\d]+?))? (\\d+) дн\\p{L}*$|^цель по отказу (\\d+) дн\\p{L}*$'), slots: (m, c) => { const q = m[1]; const d = num(m[2] ?? m[3]); return q ? { ...withEntity(c, 'quit', q), days: d } : { days: d }; } },
  { kind: 'quit.relapse', over: ['quit.relapse'], src: 'n', re: rx('^(?:я )?(?:сорвался|сорвалась|закурил\\p{L}*|снова закурил\\p{L}*|выкурил\\p{L}*|съел\\p{L}* сладкое|выпил\\p{L}* алкоголь)(?: но| и| потому что)? ?(?:потому что )?(.*)$'), slots: (m) => ({ note: tidy(m[1]) || undefined }) },
  { kind: 'quit.archive', re: rx('^(?:архивируй|убери|перенеси в архив|заархивируй) отказ(?: от)? (.+?)(?: в архив)?$'), slots: (m, c) => withEntity(c, 'quit', m[1]) },
  { kind: 'quit.when', re: rx('‹когда я (?:чаще всего |обычно )?срываюсь›|‹когда у меня срывы›') },
);
const en = (...rules: Parameters<typeof add>) => add(...rules.map((r) => ({ ...r, lang: 'en' as const })));
en(
  { kind: 'quit.add', re: rx('^(?:i )?(?:want to )?(?:quit|give up) (.+)$|^i want to stop (.+)$|^(?:add|create|start) (?:a )?quit (?:from |of )?(.+)$'), slots: (m) => ({ title: tidy(m[1] ?? m[2] ?? m[3]) }) },
  { kind: 'quit.add', full: true, re: rx('^(?:i )?(?:have not|havent|haven t|have not been|dont|do not|stopped) (smoking|drinking|eating|using)?(?: (.+?))? since (.+)$'), slots: (m, c) => { const since = sinceOf(m[3], c.env.now); return since ? { title: tidy(m[2] ?? m[1]), since } : null; } },
  { kind: 'quit.days', over: ['quit.days'], re: rx('‹how many days (?:have i )?(?:since i|without|not)(?: (.+))?›|‹how long (?:have i )?(?:been )?(?:clean|without (.+))›'), slots: (m, c) => { const q = m[1] ?? m[2]; return q ? withEntity(c, 'quit', q.replace(/^(?:smoked|smoking)$/, 'smoking')) : {}; } },
  { kind: 'quit.avoided', over: ['quit.days'], re: rx('‹how many (cigarettes|drinks|cups) (?:have i )?(?:avoided|not (?:smoked|had|drunk))›') },
  { kind: 'quit.goal', re: rx('^set (?:the )?(?:quit )?goal (?:for (.+?) )?(?:to )?(\\d+) days$'), slots: (m, c) => (m[1] ? { ...withEntity(c, 'quit', m[1]), days: num(m[2]) } : { days: num(m[2]) }) },
  { kind: 'quit.archive', re: rx('^(?:archive|remove) (?:the )?quit (?:from |of )?(.+)$'), slots: (m, c) => withEntity(c, 'quit', m[1]) },
  { kind: 'quit.when', re: rx('‹when do i (?:usually |most often )?(?:slip|relapse)›') },
);
