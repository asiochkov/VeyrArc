import { add, rx, type Rule } from '../engine';
import { num, tidy, today, withEntity } from './util';

/* English: the same commands as the Russian rules (ТЗ 6.5/6.6, EN parity). Contractions are joined by normalize(): «what's» → «whats». */
const en = (...rules: Rule[]) => add(...rules.map((r) => ({ ...r, lang: 'en' as const })));
const Q = rx('‹(?:how|what should|should i|can i|could you|why|who|which)›');

const MOOD: [RegExp, number][] = [
  [rx('‹(?:terrible|awful|horrible|miserable|burnt out|burned out|burnout|worst|devastated)›'), 1],
  [rx('‹(?:sad|bad|tired|down|anxious|stressed|upset|exhausted|low|not great|not good|so so|meh)›'), 2],
  [rx('‹(?:great|awesome|amazing|fantastic|excellent|wonderful|superb|perfect)›'), 5],
  [rx('‹(?:good|happy|fine|well|calm|cheerful|energetic|positive)›'), 4],
  [rx('‹(?:okay|ok|alright|normal|average|neutral)›'), 3],
];
const moodEn = (s: string): number | null => {
  const d = s.match(/(?<!\d)([1-5])(?!\d)/);
  if (d) return Number(d[1]);
  for (const [re, lv] of MOOD) if (re.test(s)) return lv;
  return null;
};
const PAGES: [RegExp, string][] = [
  [rx('^(?:today|home|main)$'), 'today'], [rx('^habits?$'), 'habits'], [rx('^(?:planner|calendar|schedule)$'), 'planner'], [rx('^goals?$'), 'goals'],
  [rx('^(?:analytics|statistics|stats)$'), 'analytics'], [rx('^settings$'), 'settings'], [rx('^(?:account|profile)$'), 'account'],
];
const strip = (s: string) => tidy(s.replace(/^(?:the |my |a |an |to |about )+/, '').replace(/ (?:please|thanks)$/, ''));

en(
  // mood and water
  { kind: 'mood.set', re: rx('^(?:my )?mood(?: is| today)?(?: today)? (.+)$'), slots: (m) => { const lv = moodEn(m[1]); return lv === null ? null : { level: lv, note: m[1].match(/(?:because|since) (.+)$/)?.[1] }; } },
  { kind: 'mood.set', score: 0.82, full: true, re: rx('^(?:today )?(?:i feel|i am feeling|im feeling|i am|im|feeling|i feel so|it was a|today was) (?:so |very |really |pretty |a bit |kind of |quite |not )?(.+)$'), slots: (m, c) => {
    if (Q.test(c.body) || /^not /.test(m[0])) return null;
    const lv = moodEn(m[1]);
    return lv === null ? null : { level: lv };
  } },
  { kind: 'mood.note', over: ['mood.set'], src: 'n', re: rx('‹add (?:a )?(?:note|comment) to (?:my )?mood (.+)$'), slots: (m) => ({ text: tidy(m[1]) }) },
  { kind: 'mood.worstDays', over: ['mood.set'], re: rx('^(?=.*mood)(?=.*(?:worst|bad|low)).*when.*$') },
  { kind: 'mood.drivers', re: rx('‹what (?:affects|influences) my mood›') },
  { kind: 'mood.trend', re: rx('‹mood (?:trend|dynamics|over time)›') },
  { kind: 'water.add', over: ['habit.done'], re: [rx('^(?:i )?(?:drank|had|just drank|just had)? ?(?:another|one more|(\\d+))? ?(?:glass(?:es)?|cups?) of water$'), rx('^(?:i )?(?:drank|had) (?:some )?water$')], slots: (m) => ({ amount: num(m[1]) ?? 1 }) },
  { kind: 'water.ask', re: rx('‹how (?:much|many glasses of) water›') },

  // marking habits
  { kind: 'habit.doneAll', over: ['habit.done'], re: rx('^(?:mark|check|tick) (?:off )?all (?:my )?habits(?: as done| done)?$') },
  { kind: 'habit.markGroup', over: ['habit.done'], re: rx('^(?:mark|check) (?:off )?all (?:my )?(morning|evening|daytime|core|main) (?:habits )?(?:as done|done)?$'), slots: (m) => ({ group: m[1] }) },
  { kind: 'habit.undone', over: ['habit.done'], re: [rx('^(?:undo|remove|uncheck|unmark|clear) (?:the |my )?(.+?)(?: check| checkmark| mark| tick)?$'), rx('^(?:i )?(?:did not|didnt|havent) (?:do|done) (?:my |the )?(.+)$')], slots: (m, c) => withEntity(c, 'habit', strip(m[1])) },
  { kind: 'habit.done', re: [
    rx('^(?:mark|check|tick)(?: off)? (?:my |the )?(.+?)(?: as (?:done|complete|completed|finished))?$'),
    rx('^(?:i )?(?:did|finished|completed|had|just did|just finished|have done|done) (?:my |the |some )?(.+)$'),
    rx('^(?:done|finished|completed) (?:with )?(?:my |the )?(.+)$'),
    rx('^(?:i )?(?:just )?(meditated|exercised|worked out|ran|jogged|read|stretched|walked|studied|practiced|practised|swam|cycled)(?: .*)?$'),
  ], slots: (m, c) => {
    const q = strip(m[1].replace(/ for \d+ minutes?/g, '').replace(/ as (?:done|complete)$/, ''));
    if (!q || /^(?:it|that|this|everything|all)$/.test(q)) return null;
    const minutes = c.c.match(/(\d+) minutes?/)?.[1] ?? (c.when.duration ? String(c.when.duration) : undefined);
    return { ...withEntity(c, 'habit', q), minutes: minutes ? Number(minutes) : undefined };
  } },

  // counters and sleep
  { kind: 'counter.add', re: [rx('^set of (\\d+)$'), rx('^(?:another|plus|add|one more|more) (\\d+) (\\p{L}+)$')], slots: (m, c) => (m[2] && !c.habit(m[2]) ? null : { amount: num(m[1]), query: m[2] }) },
  { kind: 'counter.steps', re: rx('‹(?:i )?(?:walked|did) (\\d+) steps›'), slots: (m) => ({ amount: num(m[1]) }) },
  { kind: 'counter.add', over: ['habit.done'], re: rx('^(?:i )?(?:ran|ran for|swam|walked|cycled) (\\d+(?:\\.\\d+)?) (kilometers?|kilometres?|km|miles?)$'), slots: (m) => ({ amount: num(m[1]), query: m[2] }) },
  { kind: 'counter.remaining', re: rx('‹how (?:much|many) (?:is |are )?(?:left|remaining) (?:for|of|until) (?:my )?(?:daily )?(.+)›'), slots: (m) => ({ query: strip(m[1]) }) },
  { kind: 'counter.set', re: rx('‹(?:i )?(?:made a mistake|was wrong|correction|sorry) (?:it was|that was|only)? ?(\\d+) (\\p{L}+)›'), slots: (m) => ({ amount: num(m[1]), query: m[2] }) },
  { kind: 'sleep.log', full: true, re: rx('‹(?:went to bed|slept|fell asleep) at (\\d{1,2})(?::(\\d\\d))?(?: pm)? and (?:woke up|got up) at (\\d{1,2})(?::(\\d\\d))?›'), slots: (m) => {
    let bed = Number(m[1]); const wake = Number(m[3]);
    if (bed >= 6 && bed <= 12) bed = bed === 12 ? 0 : bed + 12;
    return { hours: Math.round(((wake - bed + 24) % 24) * 2) / 2 };
  } },
  { kind: 'sleep.log', re: rx('‹(?:i )?slept (\\d+(?:\\.\\d+)?) hours?›'), slots: (m) => ({ hours: num(m[1]) }) },
  { kind: 'sleep.log', re: rx('‹(?:i )?slept (\\d+) minutes›'), slots: (m) => ({ hours: Math.round(Number(m[1]) / 30) / 2 }) },

  // managing habits
  { kind: 'habit.addFromLibrary', over: ['habit.add'], re: rx('^(?:add|create) (?:a )?habit from (?:the )?library (.+)$'), slots: (m) => ({ query: tidy(m[1]) }) },
  { kind: 'habit.add', re: rx('^(?:add|create|new|start) (?:a |new )?habit (?:called |named |to )?(.+)$'), slots: (m) => {
    let t = tidy(m[1]);
    let minutes: number | undefined, target: number | undefined;
    const mn = t.match(/ ?(?:for )?(\d+) min(?:ute)?s?/); if (mn) { minutes = Number(mn[1]); t = t.replace(mn[0], ''); }
    const tg = t.match(/ ?(\d+) (?:glasses|times|pages|reps)/); if (tg) { target = Number(tg[1]); t = t.replace(tg[0], ''); }
    return { title: tidy(t), minutes, target };
  } },
  { kind: 'habit.remove', over: ['task.delete'], re: rx('^(?:delete|remove|drop) (?:the |my )?habit (.+)$'), slots: (m, c) => withEntity(c, 'habit', m[1]) },
  { kind: 'habit.rename', over: ['task.move'], re: rx('^rename (?:the |my )?(?:habit )?(.+?) to (.+)$'), slots: (m, c) => ({ ...withEntity(c, 'habit', m[1]), to: tidy(m[2]) }) },
  { kind: 'habit.schedule', re: rx('^(.+?) only on (weekdays|weekends|mondays|tuesdays|wednesdays|thursdays|fridays|saturdays|sundays)$'), slots: (m, c) => {
    const bits: Record<string, number> = { weekdays: 31, weekends: 96, mondays: 1, tuesdays: 2, wednesdays: 4, thursdays: 8, fridays: 16, saturdays: 32, sundays: 64 };
    return { ...withEntity(c, 'habit', m[1]), days: bits[m[2]] };
  } },
  { kind: 'habit.core', re: rx('^make (.+?) (?:a |my )?(?:core|main) habit$'), slots: (m, c) => ({ ...withEntity(c, 'habit', m[1]), core: true }) },
  { kind: 'habit.pause', re: rx('^(?:pause|put on hold) (?:the |my )?(?:habit )?(.+)$'), slots: (m, c) => withEntity(c, 'habit', m[1]) },
  { kind: 'habit.streak', re: rx('‹(?:whats|what is) my (?:(.+) )?streak(?: for (.+))?›'), slots: (m, c) => { const q = m[1] ?? m[2]; return q ? withEntity(c, 'habit', q) : {}; } },
  { kind: 'habit.weakest', re: rx('^(?=.*habit)(?=.*(?:weakest|skip the most|miss the most|worst)).*$') },
  { kind: 'habit.count', re: rx('‹how many times (?:did i|have i) (?:do |done )?(.+)›'), slots: (m, c) => withEntity(c, 'habit', m[1].replace(/ (?:this|last) (?:week|month)$/, '')) },

  // tasks
  { kind: 'task.add', re: [
    rx('^remind me (?:to |about |of )?(.+)$'),
    rx('^(?:add|create|schedule|put|plan|write down|note)(?: a| an| the)?(?: new)?(?: task| event| meeting| reminder| appointment| todo)?(?: to (?:my )?(?:planner|calendar|list))? (?:called |named |to )?(.+)$'),
    rx('^(?:task|event|reminder)[: ] ?(.+)$'),
  ], slots: (m, c) => {
    const first = tidy(m[1]);
    if (/^(?:habit|goal|quit|note|promise|alarm|timer|focus|theme|dark|light)/.test(first)) return null;
    if (/^(?:mood|water)/.test(first)) return null;
    const t = strip(first);
    if (!t) return null;
    const out: Record<string, unknown> = { title: t, day: c.when.date, time: c.when.time, end: c.when.end ?? (c.when.duration && c.when.time ? plusMin(c.when.time, c.when.duration) : undefined) };
    if (c.when.rel && !out.day) out.day = today(c);
    if (!c.when.time && c.when.date && /^(?:meeting|call|dentist|doctor|dinner|lunch|interview|appointment)/.test(t) && !/^(?:to|buy|call|pay|write|finish)\b/.test(first)) out._ask = 'time';
    return out;
  } },
  { kind: 'task.add', score: 0.9, bare: true, re: rx('^(.{3,80})$'), slots: (m, c) => {
    const t = tidy(m[1]);
    if (!(c.when.time || c.when.date) || (c.when.date && c.when.date < today(c))) return null;
    if (Q.test(t) || /^(?:is|are|do|does|did|will|would|can|could|shall|should|was|were|have|has|play|open|send|set|turn|switch|show|what|how|where|who|delete|move|remove|cancel|text|go|start|stop|undo|mark|create|add|open)\b/.test(t) || /‹(?:i|my|me|you)›/u.test(t) && !/^(?:call|buy|meet|pay)/.test(t)) return null;
    const title = strip(t);
    if (!title || title.split(' ').length > 7) return null;
    const out: Record<string, unknown> = { title, day: c.when.date, time: c.when.time, end: c.when.end };
    if (c.when.rel && !out.day) out.day = today(c);
    return out;
  } },
  { kind: 'task.moveBulk', over: ['task.move', 'task.delete'], re: rx('^(?:move|push|postpone|reschedule) (?:everything|all(?: my)?(?: tasks)?)(?: to)?(?: the)?$'), slots: (_m, c) => ({ day: c.when.date, all: true }) },
  { kind: 'task.move', re: rx('^(?:move|reschedule|postpone|push|shift) (?:the |my )?(.+?)(?: (?:to|until|for))*$'), slots: (m, c) => {
    if (!c.when.date && !c.when.time) return null;
    return { ...withEntity(c, 'task', strip(m[1])), day: c.when.date, time: c.when.time };
  } },
  { kind: 'task.delete', re: rx('^(?:delete|remove|cancel|erase|drop) (?:the |my |a )?(.+)$'), slots: (m, c) => {
    const q = strip(m[1]);
    if (/^(?:everything|all|all of it|it all)$/.test(q) || /^(?:habit|goal|quit|my account|account|data|season)/.test(q)) return null;
    if (/^all (?:tasks|events|meetings)/.test(q)) return { query: 'all', all: true, _score: 0.9 };
    return withEntity(c, 'task', q);
  } },
  { kind: 'task.duration', re: rx('^(?:extend|prolong|lengthen) (?:the |my )?(.+)$'), slots: (m, c) => (!c.when.duration || /^(?:focus|timer)/.test(strip(m[1])) ? null : { ...withEntity(c, 'task', strip(m[1])), minutes: c.when.duration }) },
  { kind: 'task.doneAll', over: ['task.doneMany'], re: rx('^(?:close|complete|finish|check off|mark) all(?: my)? (?:tasks|todos|items)(?: as done)?$') },
  { kind: 'task.doneMany', re: rx('^(?:cross off|check off|complete|tick off) (.+ and .+)$'), slots: (m, c) => { const items = m[1].split(/ and |, /).map(strip).filter(Boolean); return { items, _score: items.every((i) => c.task(i)) ? 0.9 : 0.4 }; } },

  // questions about the plan
  { kind: 'plan.day', re: [rx('‹what do i have›'), rx('‹what(?:s| is) (?:on|planned|scheduled)(?: for)?›'), rx('‹(?:show|tell|read)(?: me)? (?:my )?(?:plan|schedule|agenda|day)›')], slots: (_m, c) => ({ day: c.when.date ?? today(c) }) },
  { kind: 'list.remaining', over: ['plan.count'], re: [rx('‹how many (?:tasks|things|todos|items) (?:do i have )?(?:are )?left›'), rx('‹what(?:s| is) left(?: to (.+))?›')], slots: (m) => (m[1] ? { query: tidy(m[1]) } : {}) },
  { kind: 'plan.next', re: [rx('‹when(?:s| is) my next (?:meeting|event|task|appointment)›'), rx('‹what(?:s| is) next›'), rx('‹what time is (?:my |the )?(.+)›')], slots: (m, c) => { if (!m[1]) return {}; const q = strip(m[1]); return { query: q, _score: c.task(q) || c.habit(q) ? 0.9 : 0.3 }; } },
  { kind: 'plan.overdue', re: rx('‹what did i (?:miss|not do|skip)›') },
  { kind: 'plan.count', re: rx('‹how many (?:meetings|events|tasks) (?:do i have|are there)›') },
  { kind: 'plan.freeSlots', re: rx('‹when am i (?:free|available)›'), slots: (_m, c) => ({ day: c.when.date ?? today(c) }) },
  { kind: 'plan.conflicts', re: rx('‹(?:any |are there any )?conflicts›') },

  // focus and timers
  { kind: 'timer.simple', re: rx('^(?:set|start|run|put on) (?:a |the )?timer$'), slots: (_m, c) => ({ seconds: c.when.duration ? c.when.duration * 60 : undefined }) },
  { kind: 'focus.stop', re: rx('^(?:stop|end|cancel|finish) (?:the |my )?(?:focus|timer|session)$') },
  { kind: 'focus.pause', over: ['habit.pause'], re: rx('^pause (?:the |my )?(?:focus|timer)$') },
  { kind: 'focus.resume', re: rx('^(?:resume|continue) (?:the |my )?(?:focus|timer)$') },
  { kind: 'focus.extend', re: rx('^(?:extend|prolong|add time to) (?:the |my )?(?:focus|timer)(?: by)?(?: (\\d+)(?: minutes?)?)?$'), slots: (m, c) => ({ minutes: c.when.duration ?? num(m[1]) }) },
  { kind: 'focus.remaining', re: rx('‹how much time (?:is )?left (?:in|on|for) (?:the |my )?(?:focus|timer|session)›') },
  { kind: 'focus.sum', re: rx('‹how (?:long|much) (?:did i|have i) (?:work|worked|focus|focused)›') },
  { kind: 'focus.start', re: rx('^(?:start|begin|launch)? ?(?:a |the )?(?:(\\d+) minutes? )?(?:focus|pomodoro)(?: session)?(?: (\\d+)(?: minutes?)?)?$'), slots: (m, c) => ({ minutes: c.when.duration ?? num(m[1] ?? m[2]) }) },

  // goals and quits
  { kind: 'goal.complete', re: rx('^(?:complete|finish|close) (?:the )?goal (.+)$'), slots: (m, c) => withEntity(c, 'goal', m[1]) },
  { kind: 'goal.add', re: rx('^(?:create|add|new|set) (?:a |new )?goal (?:to |called |named )?(.+)$'), slots: (m) => ({ title: tidy(m[1]) }) },
  { kind: 'goal.deadline', re: rx('^(?:set|put) (?:a |the )?(?:deadline|due date) (?:for|of|on) (.+)$'), slots: (m, c) => (c.when.date ? { ...withEntity(c, 'goal', strip(m[1])), day: c.when.date } : null) },
  { kind: 'goal.next', re: rx('‹what(?:s| is) the next step(?: (?:for|on|of) (.+))?›'), slots: (m, c) => (m[1] ? withEntity(c, 'goal', m[1]) : {}) },
  { kind: 'goal.progress', re: rx('‹how are my goals›') },
  { kind: 'quit.add', re: [rx('^(?:add|create) (?:a )?quit (?:from |of )?(.+)$'), rx('‹i want to (?:quit|stop) (.+)›')], slots: (m) => ({ title: tidy(m[1]) }) },
  { kind: 'quit.relapse', src: 'n', re: rx('^(?:i )?(?:relapsed|slipped|broke down|fell off)(?: but| and)? ?(.*)$'), slots: (m) => ({ note: tidy(m[1]) || undefined }) },
  { kind: 'quit.days', re: rx('‹how many days (?:since i|without|since)›') },

  // settings and account
  { kind: 'settings.theme', re: [rx('‹(?:switch|change|set|turn) (?:to |on )?(?:the )?(light|dark)(?: theme| mode)?›'), rx('‹(light|dark) (?:theme|mode)›')], slots: (m) => ({ value: m[1] }) },
  { kind: 'settings.reminder', re: rx('^(?:remind me|set (?:a )?reminder|send (?:me )?reminders?)(?: every day| daily)?$'), slots: (_m, c) => (c.when.time ? { time: c.when.time } : null) },
  { kind: 'settings.quiet', full: true, re: rx('‹(?:dont disturb|do not disturb|quiet hours|silence)(?: me)? from (\\d{1,2})(?: ?(pm|am))? to (\\d{1,2})(?: ?(pm|am))?›'), slots: (m) => {
    const f = Number(m[1]) + (m[2] === 'pm' && Number(m[1]) < 12 ? 12 : 0), t = Number(m[3]) + (m[4] === 'pm' && Number(m[3]) < 12 ? 12 : 0);
    const hh = (h: number) => String(h % 24).padStart(2, '0') + ':00';
    return { from: hh(f), to: hh(t) };
  } },
  { kind: 'export.data', re: rx('^(?:export|download) (?:all )?(?:my )?data$') },
  { kind: 'account.delete', re: rx('‹(?:delete|remove) (?:my )?(?:account|profile)›') },
  { kind: 'arc.day', re: rx('‹what day of the season›') },
  { kind: 'arc.oath.set', src: 'n', re: rx('‹(?:write|save|set) (?:my )?(?:promise|oath)(?: for the season)? (.+)$'), slots: (m) => ({ text: tidy(m[1]) }) },

  // navigation and the assistant itself
  { kind: 'nav.page', re: rx('^(?:open|show|go to|take me to|switch to|navigate to) (?:my |the )?(.+)$'), slots: (m) => { const w = tidy(m[1]); for (const [re, page] of PAGES) if (re.test(w)) return { page }; return null; } },
  { kind: 'nav.back', re: rx('^(?:go back|back|return)$') },
  { kind: 'undo', over: ['habit.undone'], re: rx('^(?:undo|undo that|undo the last (?:thing|action|command)|take that back)$') },
  { kind: 'help', re: rx('^(?:what can you do|help|help me|what can i say)$') },
  { kind: 'chat.hello', re: rx('^(?:hello|hi|hey|hi there|hello there)$') },
  { kind: 'chat.thanks', re: rx('^(?:thanks|thank you|thanks a lot|thank you so much)(?: .*)?$') },
  { kind: 'chat.who', re: rx('^(?:who are you|what are you)$') },
  { kind: 'chat.howAreYou', over: ['stats.week'], re: rx('^how are you(?: doing)?$') },
  { kind: 'howto', re: rx('^what(?:s| is) (?:a |an |the )?(pomodoro|index|streak|season|core|extra|focus|efficiency)$'), slots: (m) => ({ query: m[1] }) },

  // flows
  { kind: 'flow.start', re: rx('^(?:walk me through my habits|go through my habits|lets go through my habits)$'), slots: () => ({ id: 'walk' }) },
  { kind: 'flow.start', re: rx('^(?:good morning|morning briefing|start my morning|morning)$'), slots: () => ({ id: 'morning' }) },
  { kind: 'flow.start', re: rx('^(?:week review|review my week|sum up my week|wrap up my week)$'), slots: () => ({ id: 'week' }) },
  { kind: 'flow.start', re: rx('^(?:wrap up my (?:day|evening)|evening review|sum up my (?:day|evening)|review my day)$'), slots: () => ({ id: 'evening' }) },
  { kind: 'flow.start', re: rx('^(?:i am having a hard day|im having a hard day|its hard today|today is hard|i am struggling today|im struggling)$'), slots: () => ({ id: 'tough' }) },
  { kind: 'flow.start', re: rx('‹i have (\\d+) minutes?(?: what can i (?:do|fit)| to spare)?›'), slots: (m) => ({ id: 'fit', minutes: num(m[1]) }) },

  // statistics
  { kind: 'stats.longestStreak', over: ['habit.streak'], re: rx('‹(?:my )?longest streak›') },
  { kind: 'stats.whyDropped', over: ['habit.streak'], re: rx('‹why did my streak (?:break|drop|end|reset)›') },
  { kind: 'stats.week', over: ['chat.hello'], re: [rx('‹how (?:is|was) my week(?: going)?›'), rx('‹how am i doing(?: this week)?›')] },
  { kind: 'stats.index', re: rx('‹(?:whats|what is) my (?:current )?index›') },
);

function plusMin(time: string, minutes: number): string {
  const [h, m] = time.split(':').map(Number);
  const t = h * 60 + m + minutes;
  return `${String(Math.floor(t / 60) % 24).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
}
