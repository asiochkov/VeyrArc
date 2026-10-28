import { addDays } from '../../data/model';
import { isoDay } from '../../lib/day';
import { runAll, legacyHistory, type Reply as LegacyReply } from '../run';
import type { Intent, NavTo } from '../nlu';
import type { Parsed, ParseEnv } from '../nlp/types';
import type { Reply } from './types';

/*
 * The executors that have not moved to exec/* yet (run.ts) behind the new decisions: a recognised command is mapped to the
 * intent run.ts understands, its reply is converted to the new shape. Each is replaced by a handler in the work packages of
 * Phase 5; when the last one is gone, run.ts and this file are deleted.
 */
const NAV: Record<string, NavTo> = { today: '/', habits: '/disciplines', planner: '/planner', goals: '/goals', analytics: '/analytics', settings: '/settings', account: '/settings/account' };
const str = (v: unknown): string => (typeof v === 'string' ? v : '');
const numOr = (v: unknown): number | null => (typeof v === 'number' ? v : null);

/** a recognised command → the intent the executor understands, or null if it is not wired yet */
export function toIntent(p: Parsed, env: ParseEnv): Intent | null {
  const s = p.slots;
  const today = isoDay(env.now);
  switch (p.kind) {
    case 'mood.set': return { kind: 'mood', level: Math.max(0, Math.min(4, (numOr(s.level) ?? 3) - 1)) };
    case 'habit.done': return s.day && s.day !== today ? null : { kind: 'done', query: str(s.query), amount: numOr(s.amount), minutes: numOr(s.minutes) };
    case 'habit.doneAll': return { kind: 'done', query: 'все', amount: null, minutes: null };
    case 'habit.undone': return { kind: 'undone', query: str(s.query) };
    case 'task.add': return { kind: 'taskAdd', title: str(s.title), day: str(s.day) || today, time: str(s.time) || null, end: str(s.end) || null };
    case 'task.move': return { kind: 'taskMove', query: str(s.query), all: false, day: str(s.day) || null, time: str(s.time) || null };
    case 'task.moveBulk': return { kind: 'taskMove', query: '', all: true, day: str(s.day) || addDays(today, 1), time: null };
    case 'task.delete': return { kind: 'taskDelete', query: str(s.query) };
    case 'focus.start': return { kind: 'focus', op: s.minutes ? 'start' : 'open', minutes: numOr(s.minutes) };
    case 'timer.simple': return { kind: 'focus', op: 'start', minutes: s.seconds ? Math.max(1, Math.round(Number(s.seconds) / 60)) : null };
    case 'focus.stop': return { kind: 'focus', op: 'stop', minutes: null };
    case 'focus.pause': return { kind: 'focus', op: 'pause', minutes: null };
    case 'focus.resume': return { kind: 'focus', op: 'resume', minutes: null };
    case 'focus.break': return { kind: 'focus', op: 'break', minutes: null };
    case 'nav.page': return NAV[str(s.page)] ? { kind: 'nav', to: NAV[str(s.page)] } : null;
    case 'plan.day': return s.day && s.day !== today ? (s.day === addDays(today, 1) ? { kind: 'ask', what: 'planTomorrow' } : null) : { kind: 'ask', what: 'plan' };
    case 'plan.next': return { kind: 'ask', what: 'next' };
    case 'list.remaining': return { kind: 'ask', what: 'left' };
    case 'stats.index': return { kind: 'ask', what: 'progress' };
    case 'habit.streak': return { kind: 'ask', what: 'streak' };
    case 'focus.sum': return { kind: 'ask', what: 'focusToday' };
    case 'mood.ask': return { kind: 'ask', what: 'mood' };
    case 'goal.progress': return { kind: 'ask', what: 'goals' };
    case 'stats.week': return { kind: 'ask', what: 'week' };
    case 'habit.add': return { kind: 'habitAdd', name: str(s.title), type: s.minutes ? 'duration' : s.target ? 'counter' : 'binary', target: numOr(s.target), minutes: numOr(s.minutes), unit: null };
    case 'goal.add': return { kind: 'goalAdd', title: str(s.title) };
    case 'goal.step.add': return { kind: 'stepAdd', goal: str(s.goal), text: str(s.text) };
    case 'quit.relapse': return { kind: 'relapse', query: str(s.query) };
    case 'settings.lang': return s.value === 'ru' || s.value === 'en' ? { kind: 'lang', to: s.value } : null;
    case 'undo': return { kind: 'undo' };
    case 'help': return { kind: 'help' };
    case 'chat.hello': return { kind: 'chat', say: 'hello' };
    case 'chat.thanks': return { kind: 'chat', say: 'thanks' };
    case 'chat.praise': return { kind: 'chat', say: 'praise' };
    case 'chat.bye': return { kind: 'chat', say: 'bye' };
    case 'flow.start': return s.id === 'evening' ? { kind: 'review' } : s.id === 'week' ? { kind: 'weekReview' } : null;
    default: return null;
  }
}


/** run.ts's reply in the new shape */
export function fromLegacy(r: LegacyReply, lang: 'ru' | 'en'): Reply {
  const ru = lang === 'ru';
  return {
    ok: r.ok, kind: r.ok ? (r.choices ? 'ask' : 'done') : 'error', screen: r.say, speech: r.say, list: r.list,
    chips: r.suggest?.map((x) => ({ label: x, say: x })),
    choices: r.choices?.map((c) => ({ label: c.label, yes: c.yes, run: () => fromLegacy(c.run(), lang) })),
    close: r.close, undoable: !!r.undo,
    ...(r.ok ? {} : { speech: r.say || (ru ? 'Не получилось' : 'Could not do that') }),
  };
}
export const legacyRun = (it: Intent, lang: 'ru' | 'en'): Reply => fromLegacy(runAll([it], lang), lang);
export const legacyRunMany = (its: Intent[], lang: 'ru' | 'en'): Reply => fromLegacy(runAll(its, lang), lang);
export { legacyHistory };
