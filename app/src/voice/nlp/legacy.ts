import { understand, type Intent } from '../nlu';
import { specOf } from './intents';
import type { Decision, Parsed, ParseEnv } from './types';

/*
 * Adapter over the first-generation parser (nlu.ts), kept only to measure the baseline (WP0.2) and to keep the
 * app working until the new pipeline takes over. It knows nothing of confidence, so everything it recognises is
 * reported at 0.9 and «unknown» is out-of-scope.
 */
const ASK: Record<string, [string, Record<string, unknown>?]> = {
  plan: ['plan.day'], planTomorrow: ['plan.day', { day: 'tomorrow' }], next: ['plan.next'], left: ['list.remaining'], progress: ['stats.index'],
  streak: ['habit.streak'], focusToday: ['focus.sum'], mood: ['mood.ask'], goals: ['goal.progress'], time: ['ui.read'], date: ['ui.read'], week: ['stats.week'],
};
const NAV: Record<string, string> = { '/': 'today', '/disciplines': 'habits', '/planner': 'planner', '/goals': 'goals', '/analytics': 'analytics', '/settings': 'settings', '/settings/account': 'account' };

function map(it: Intent): [string, Record<string, unknown>] | null {
  switch (it.kind) {
    case 'mood': return ['mood.set', { level: it.level + 1 }];
    case 'done': return ['habit.done', { query: it.query, amount: it.amount, minutes: it.minutes }];
    case 'undone': return ['habit.undone', { query: it.query }];
    case 'taskAdd': return ['task.add', { title: it.title, day: it.day, time: it.time, end: it.end }];
    case 'taskMove': return ['task.move', { query: it.query, all: it.all, day: it.day, time: it.time }];
    case 'taskDelete': return ['task.delete', { query: it.query }];
    case 'focus': return it.op === 'start' ? ['focus.start', { minutes: it.minutes }] : it.op === 'open' ? ['focus.start', { minutes: null }] : [`focus.${it.op}`, {}];
    case 'nav': return ['nav.page', { page: NAV[it.to] }];
    case 'ask': { const [k, s] = ASK[it.what] ?? ['plan.day']; return [k, s ?? {}]; }
    case 'habitAdd': return ['habit.add', { title: it.name, target: it.target, minutes: it.minutes }];
    case 'goalAdd': return ['goal.add', { title: it.title }];
    case 'stepAdd': return ['goal.step.add', { goal: it.goal, text: it.text }];
    case 'relapse': return ['quit.relapse', { query: it.query }];
    case 'review': return ['flow.start', { id: 'evening' }];
    case 'weekReview': return ['flow.start', { id: 'week' }];
    case 'freeze': return ['habit.freeze', {}];
    case 'lang': return ['settings.lang', { value: it.to }];
    case 'undo': return ['undo', {}];
    case 'help': return ['help', {}];
    case 'chat': return [`chat.${it.say === 'hello' ? 'hello' : it.say}`, {}];
    case 'guess': return ['habit.done', { query: it.query, guess: true }];
    default: return null;
  }
}

export function legacyAnalyze(raw: string, env: ParseEnv): Decision[] {
  const out: Decision[] = [];
  for (const it of understand(raw, env.now)) {
    const m = map(it);
    if (!m) { out.push({ action: 'reject', reason: 'oos', reply: { ok: false, kind: 'info', screen: '', speech: null } }); continue; }
    const parsed: Parsed = { kind: m[0], slots: m[1], confidence: 0.9, risk: specOf(m[0]).risk, missing: [], why: ['legacy'] };
    out.push({ action: 'execute', parsed });
  }
  return out;
}
