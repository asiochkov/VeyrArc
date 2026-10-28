import type { Risk } from './types';

/*
 * The taxonomy of what the assistant can do (ТЗ 6.6): one row per intent —
 * kind (domain.verb), risk class (6.7.1), required slots, and the numbers of the capability catalog
 * (docs/voice/capabilities.md) it covers. coverage:voice reads this table: every catalog number
 * must be here or in docs/voice/not-done.md.
 */
export type IntentSpec = {
  kind: string;
  risk: Risk;
  required: string[];
  catalog: number[];
  /** behaviour without a spoken phrase (links, care messages, hotkeys) */
  system?: boolean;
};

const S = (kind: string, risk: Risk, required: string[] = [], catalog: number[] = [], system = false): IntentSpec => ({ kind, risk, required, catalog, system });

export const INTENTS: IntentSpec[] = [
  // mood and water
  S('mood.set', 'R1', ['level'], [18]), S('mood.note', 'R1', ['text'], [19]),
  S('mood.ask', 'R0'), S('mood.worstDays', 'R0', [], [20]), S('mood.drivers', 'R0', [], [21]), S('mood.trend', 'R0', [], [158]),
  S('water.add', 'R1', ['amount'], [16]), S('water.ask', 'R0', [], [17]), S('water.step', 'R1', [], [13]),
  // marking habits
  S('habit.done', 'R1', ['query']), S('habit.undone', 'R1', ['query']), S('habit.markGroup', 'R2', ['group'], [14]),
  S('habit.markPast', 'R2', ['query', 'day'], [15]), S('habit.doneAll', 'R2'),
  // counters and sleep
  S('counter.add', 'R1', ['amount'], [108, 111, 116]), S('counter.remaining', 'R0', [], [109]), S('counter.set', 'R2', ['amount'], [110]),
  S('counter.steps', 'R1', ['amount']), S('sleep.log', 'R1', ['hours'], [112, 113]),
  // managing habits
  S('habit.add', 'R2', ['title']), S('habit.addFromLibrary', 'R2', ['query'], [7]), S('habit.rename', 'R2', ['query', 'to'], [1]),
  S('habit.schedule', 'R2', ['query', 'days'], [2]), S('habit.target', 'R2', ['query'], [3]), S('habit.core', 'R2', ['query', 'core'], [4]),
  S('habit.pause', 'R2', ['query'], [5]), S('habit.restore', 'R2', ['query']), S('habit.remove', 'R3', ['query'], [6]),
  S('habit.reorder', 'R2', ['query'], [8]), S('habit.simplify', 'R2', ['query'], [168]), S('habit.harden', 'R2', [], [169]),
  S('habit.chain', 'R2', ['after', 'then'], [136]), S('habit.promise', 'R1', [], [172]),
  // habit statistics
  S('habit.streak', 'R0', [], [9]), S('habit.count', 'R0', ['query'], [10, 117]), S('habit.weakest', 'R0', [], [11]),
  S('habit.compare', 'R0', ['a', 'b'], [12]), S('habit.top', 'R0', [], [156]), S('habit.trend', 'R0', [], [157]),
  S('habit.suggest', 'R0', [], [167]), S('habit.why', 'R0', [], [170]), S('habit.howMany', 'R0', [], [171]),
  S('habit.overload', 'R0', [], [174]), S('habit.trim', 'R0', [], [175]), S('habit.time', 'R0', ['query'], [176]),
  // quits
  S('quit.add', 'R2', ['title'], [22, 23]), S('quit.days', 'R0', [], [24]), S('quit.avoided', 'R0', [], [25]),
  S('quit.goal', 'R2', ['days'], [26]), S('quit.relapse', 'R3', [], [27, 241]), S('quit.archive', 'R3', ['query'], [28]), S('quit.when', 'R0', [], [165]),
  // goals
  S('goal.add', 'R2', ['title']), S('goal.addFull', 'R2', ['title'], [177]), S('goal.step.add', 'R2', ['text']),
  S('goal.split', 'R2', ['steps'], [38]), S('goal.next', 'R0', [], [29]), S('goal.progress', 'R0', [], [30]), S('goal.pace', 'R0', [], [31, 183]),
  S('goal.deadline', 'R2', ['day'], [32]), S('goal.complete', 'R3', ['query'], [33]), S('goal.rename', 'R2', ['query', 'to']),
  S('goal.step.rename', 'R2', ['query', 'to'], [34]), S('goal.step.delete', 'R3', ['query']), S('goal.link', 'R2', [], [35]),
  S('goal.diary.add', 'R2', ['text'], [36]), S('goal.diary.read', 'R0', [], [37]), S('goal.hot', 'R0', [], [39]),
  S('goal.closest', 'R0', [], [181]), S('goal.stalled', 'R0', [], [182]), S('goal.stepsLeft', 'R0', [], [179]),
  S('goal.markAll', 'R2', [], [180]), S('goal.suggestHabit', 'R2', [], [178]), S('goal.priority', 'R1', ['level'], [184]),
  S('goal.challenge', 'R2', [], [173]),
  // planner: writing
  S('task.add', 'R2', ['title']), S('task.addMany', 'R2', ['items'], [203, 204, 205]), S('task.addRecurring', 'R2', ['title', 'rule'], [40, 149, 150]),
  S('task.move', 'R2', []), S('task.moveBulk', 'R2', ['day'], [43, 44, 206]), S('task.delete', 'R3', ['query']), S('task.deleteSeries', 'R3', ['query'], [151]),
  S('task.duration', 'R2', ['query'], [48]), S('task.category', 'R2', ['query', 'category'], [49]), S('task.note', 'R2', ['query', 'text'], [50]),
  S('task.doneAll', 'R2', [], [51]), S('task.doneMany', 'R1', ['items'], [207]), S('task.duplicate', 'R2', [], [53, 133]),
  S('task.top3', 'R2', [], [195]), S('task.deepBlock', 'R2', ['minutes'], [201]), S('plan.autoSchedule', 'R2', [], [42]),
  S('plan.moveToFree', 'R2', [], [142]), S('plan.buffer', 'R2', ['minutes'], [143]), S('plan.limit', 'R1', ['n'], [198]),
  // planner: reading
  S('plan.day', 'R0', [], [46]), S('plan.week', 'R0', [], [138]), S('plan.freeSlots', 'R0', [], [41, 140]), S('plan.freest', 'R0', [], [139]),
  S('plan.conflicts', 'R0', [], [141]), S('plan.count', 'R0', [], [45]), S('plan.hours', 'R0', [], [199]), S('plan.next', 'R0', [], [47]),
  S('plan.top', 'R0', [], [196]), S('plan.overdue', 'R0', [], [52]), S('plan.trim', 'R0', [], [200]), S('list.remaining', 'R0', [], [208]),
  // dates
  S('date.diff', 'R0', ['to'], [144, 146, 147]), S('date.weekday', 'R0', ['date'], [145]), S('holiday.next', 'R0', [], [148]),
  // focus and time
  S('focus.start', 'R1', [], [54, 55]), S('focus.pause', 'R1'), S('focus.resume', 'R1'), S('focus.stop', 'R1'), S('focus.break', 'R1'),
  S('focus.extend', 'R1', ['minutes'], [59]), S('focus.cycle', 'R1', ['n', 'minutes'], [60]), S('timer.simple', 'R1', ['seconds'], [61]),
  S('focus.norm', 'R1', ['minutes'], [58]), S('focus.remaining', 'R0', [], [56]), S('focus.sum', 'R0', [], [57]), S('focus.byGoal', 'R0', [], [159]),
  S('focus.byCategory', 'R0', [], [160]), S('focus.bestHour', 'R0', [], [161]), S('focus.avg', 'R0', [], [162]),
  // analytics
  S('stats.whyDropped', 'R0', [], [70]), S('stats.strongest', 'R0', [], [71]), S('stats.weekdayPattern', 'R0', [], [72]), S('stats.compareWeeks', 'R0', [], [73]),
  S('stats.insights', 'R0', [], [74]), S('stats.achievements', 'R0', [], [75]), S('stats.indexExplain', 'R0', [], [76]), S('stats.forecastStreak', 'R0', [], [79]),
  S('stats.week', 'R0', [], [152]), S('stats.month', 'R0'), S('stats.bestDay', 'R0', [], [153]), S('stats.longestStreak', 'R0', [], [154]),
  S('stats.totalChecks', 'R0', [], [155]), S('stats.percent30', 'R0', [], [163]), S('stats.weekMap', 'R0', [], [164]), S('stats.index', 'R0'),
  // season
  S('arc.oath.set', 'R2', ['text'], [80]), S('arc.oath.get', 'R0', [], [81]), S('arc.day', 'R0', [], [82]), S('arc.new', 'R3', [], [83]),
  S('arc.recap', 'R1', [], [77]), S('share.week', 'R1', [], [78]), S('report.month', 'R1', [], [166]),
  // settings and account
  S('settings.theme', 'R1', ['value'], [84]), S('settings.density', 'R1', ['value'], [85]), S('settings.lang', 'R1', ['value']),
  S('settings.reminder', 'R2', ['time'], [86]), S('settings.quiet', 'R2', ['from', 'to'], [87]), S('settings.notifyOff', 'R1', [], [88]),
  S('referral.share', 'R1', [], [89]), S('export.data', 'R3', [], [90]), S('account.delete', 'R4', [], [91]),
  S('profile.name', 'R2', ['name'], [217]), S('info.plan', 'R0', [], [218, 219, 220]),
  // support
  S('support.report', 'R1', [], [222]), S('support.idea', 'R1', [], [223]), S('feedback.wrong', 'R1', [], [224]),
  // the assistant itself
  S('prefs.alias.add', 'R1', ['alias', 'target'], [92]), S('prefs.macro.add', 'R2', ['trigger', 'phrases'], [93]), S('prefs.speech', 'R1', ['op'], [94, 95, 215, 238]),
  S('prefs.style', 'R1', [], [233, 234, 235, 236, 237]), S('repeat', 'R0', [], [96, 211]), S('journal.show', 'R0', [], [97]), S('undo', 'R1'),
  S('whatsnew', 'R0', [], [98]), S('howto', 'R0', [], [99]), S('help', 'R0'), S('demo', 'R1', [], [225]), S('unexplored', 'R0', [], [226]),
  // navigation and screen
  S('nav.page', 'R1', ['page'], [221]), S('nav.goal', 'R1', ['query'], [100]), S('nav.habit', 'R1', ['query']), S('nav.date', 'R1', ['day'], [101]),
  S('nav.settingsSection', 'R1', ['section'], [102]), S('nav.back', 'R1', [], [103]), S('ui.click', 'R1', ['target'], [212]), S('ui.scroll', 'R1', ['dir'], [213]),
  S('ui.read', 'R0', [], [209, 210]), S('ui.select', 'R1', ['n'], [216]), S('ui.density', 'R1', ['dir'], [214]),
  // notes, wins, search
  S('notes.read', 'R0', [], [189]), S('wins.add', 'R2', ['text'], [186]), S('wins.list', 'R0', [], [194]), S('search.all', 'R0', ['query'], [190, 191, 192]),
  // rituals, templates, rules
  S('ritual.create', 'R2', ['name', 'steps'], [128]), S('ritual.edit', 'R2', ['name'], [130]), S('ritual.list', 'R0', [], [134]), S('ritual.run', 'R1', ['name'], [129]),
  S('template.save', 'R2', ['name'], [131]), S('template.apply', 'R2', ['name'], [132]), S('template.delete', 'R3', ['name'], [135]), S('template.list', 'R0'),
  S('rule.ifthen', 'R1', [], [137]),
  // guided flows: flow.start{id}
  S('flow.start', 'R1', ['id'], [62, 63, 64, 65, 66, 67, 68, 69, 114, 115, 118, 119, 120, 121, 122, 123, 124, 125, 126, 127, 185, 187, 188, 193, 197, 202]),
  // small talk and refusals
  S('chat.hello', 'R0'), S('chat.thanks', 'R0'), S('chat.praise', 'R0'), S('chat.bye', 'R0'), S('chat.howAreYou', 'R0'), S('chat.who', 'R0', [], [106]),
  S('chat.motivate', 'R0', [], [104]), S('oos', 'R0', [], [107]),
  // behaviours without phrases
  S('sys.name', 'R0', [], [105], true),
  S('sys.link', 'R1', [], [227, 228, 229, 230], true), S('sys.hotkey', 'R0', [], [231], true), S('sys.hold', 'R0', [], [232], true),
  S('care.lowMood', 'R0', [], [239], true), S('care.streakLost', 'R0', [], [240], true), S('care.relapse', 'R0', [], [241], true),
  S('care.comeback', 'R0', [], [242], true), S('care.noHabitDay', 'R0', [], [243], true),
];

export const BY_KIND: Map<string, IntentSpec> = new Map(INTENTS.map((i) => [i.kind, i]));
export const specOf = (kind: string): IntentSpec => BY_KIND.get(kind) ?? S(kind, 'R1');
export const riskOf = (kind: string): Risk => specOf(kind).risk;
