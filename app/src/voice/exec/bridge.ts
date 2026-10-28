import { addDays } from '../../data/model';
import { isoDay } from '../../lib/day';
import { getSystem } from '../../state/system';
import { useLangStore } from '../../i18n';
import { analyze } from '../nlp/pipeline';
import { buildCtx } from '../nlp/parse/engine';
import { buildLexicon } from '../nlp/lexicon';
import { missingSlots } from '../nlp/risk';
import { DIALOG } from '../nlp/params';
import { runAll, type Choice, type Reply } from '../run';
import type { Intent, NavTo } from '../nlu';
import type { Decision, Parsed, ParseEnv } from '../nlp/types';

/*
 * The seam between the new understanding (nlp/: text → decisions) and the app's executor (run.ts: intent → actions).
 * Every kind the executor can already do is mapped to its intent; the rest are recognised but answer honestly that they are
 * not wired yet — each is replaced by an exec/* handler in the work packages of Phase 5. Questions about a missing detail
 * («На какое время?») are remembered and the next phrase fills them.
 */
const lang = () => useLangStore.getState().lang as 'ru' | 'en';

/** what the parser may know about the person, from the live data */
export function envFromSystem(l: 'ru' | 'en' = lang(), now = new Date()): ParseEnv {
  const sys = getSystem();
  const today = isoDay(now);
  const goals = (sys?.goals ?? []).filter((g) => g.status === 'active');
  return {
    now, lang: l,
    habits: (sys?.habits ?? []).filter((h) => !h.archived_at).map((h) => ({ id: h.id, name: h.name, core: h.core, type: h.type, target: h.target, unit: h.unit, minutes: h.minutes, days: h.days, category: h.category })),
    tasks: (sys?.plan ?? []).filter((p) => p.day >= addDays(today, -1) && p.day <= addDays(today, 30)).map((p) => ({ id: p.id, title: p.title, day: p.day, time: p.starts_at, end: p.ends_at, done: p.done })),
    goals: goals.map((g) => ({ id: g.id, title: g.title, deadline: (g as { deadline?: string | null }).deadline ?? null, steps: (sys?.tasks ?? []).filter((t) => t.goal_id === g.id).map((t) => (t as { text?: string }).text ?? '') })),
    quits: (sys?.quits ?? []).map((q) => ({ id: q.id, name: q.name })),
  };
}

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

/* ---------- the words of a confirmation ---------- */
const VERB: Record<string, [string, string]> = {
  'habit.done': ['Отметить', 'Mark'], 'habit.undone': ['Снять отметку с', 'Unmark'], 'task.delete': ['Удалить', 'Delete'], 'task.move': ['Перенести', 'Move'],
  'task.add': ['Добавить задачу', 'Add task'], 'habit.remove': ['Удалить привычку', 'Delete habit'], 'habit.add': ['Добавить привычку', 'Add habit'], 'goal.complete': ['Завершить цель', 'Complete goal'],
  'goal.add': ['Создать цель', 'Create goal'], 'quit.relapse': ['Записать срыв', 'Log a slip'], 'task.moveBulk': ['Перенести все задачи', 'Move all tasks'], 'export.data': ['Выгрузить все данные', 'Export all data'],
  'mood.set': ['Записать настроение', 'Log mood'], 'habit.doneAll': ['Отметить все привычки', 'Mark all habits'], 'task.doneAll': ['Закрыть все задачи', 'Close all tasks'],
};
export function previewOf(p: Parsed, l: 'ru' | 'en'): string {
  const [ru, en] = VERB[p.kind] ?? ['Выполнить', 'Do'];
  const what = [p.slots.title, p.slots.query, p.slots.text].find((x) => typeof x === 'string' && x && x !== 'все') as string | undefined;
  const when = str(p.slots.day) ? ` → ${str(p.slots.day)}${p.slots.time ? ' ' + str(p.slots.time) : ''}` : '';
  return `${l === 'ru' ? ru : en}${what ? ` «${what}»` : ''}${when}?`;
}

const YES: [string, string] = ['Да', 'Yes'], NO: [string, string] = ['Нет', 'No'];
const notWired = (l: 'ru' | 'en', _p: Parsed): Reply => ({ ok: false, say: l === 'ru' ? 'Это я пойму, но пока не умею делать голосом. Скоро добавим.' : 'I understand that, but I can’t do it by voice yet.' });

/* ---------- a question about a missing detail ---------- */
type Pending = { parsed: Parsed; slot: string; expiresAt: number; env: ParseEnv };
let pending: Pending | null = null;
export const clearPending = () => { pending = null; };

/** the answer to «На какое время?» etc.: the slot's value from a short phrase */
function fillFrom(slot: string, text: string, env: ParseEnv): unknown {
  const ctx = buildCtx(text, env, buildLexicon(env));
  const n = ctx.c.match(/\d+/)?.[0];
  switch (slot) {
    case 'time': return ctx.when.time ?? (n && Number(n) < 24 ? ctx.time(n) : null);
    case 'day': return ctx.when.date;
    case 'minutes': case 'amount': case 'level': case 'seconds': case 'hours': return n ? Number(n) : null;
    case 'title': case 'query': case 'text': case 'name': return ctx.c.trim() || null;
    default: return null;
  }
}

function toReply(d: Decision, env: ParseEnv, l: 'ru' | 'en'): Reply {
  switch (d.action) {
    case 'execute': {
      const it = toIntent(d.parsed, env);
      return it ? runAll([it], l) : notWired(l, d.parsed);
    }
    case 'confirm': {
      const it = toIntent(d.parsed, env);
      if (!it) return notWired(l, d.parsed);
      const yes: Choice = { label: YES[l === 'ru' ? 0 : 1], yes: true, run: () => runAll([it], l) };
      const no: Choice = { label: NO[l === 'ru' ? 0 : 1], yes: false, run: () => ({ ok: true, say: l === 'ru' ? 'Хорошо, ничего не меняю' : 'Okay, nothing changed' }) };
      return { ok: true, say: previewOf(d.parsed, l), choices: [yes, no] };
    }
    case 'clarify': {
      const choices: Choice[] = d.options.map((o) => ({ label: previewOf(o, l).replace(/\?$/, ''), run: () => { const it = toIntent(o, env); return it ? runAll([it], l) : notWired(l, o); } }));
      return { ok: true, say: d.question, choices };
    }
    case 'ask-slot': {
      pending = { parsed: d.parsed, slot: d.slot, expiresAt: Date.now() + DIALOG.pendingTtlMs, env };
      return { ok: true, say: d.question };
    }
    default:
      return { ok: false, say: d.reply.screen, suggest: d.reply.chips?.map((c) => c.say ?? c.label) };
  }
}

/** a phrase → one reply (several commands in one phrase run together and are undone together) */
export function runPhrase(text: string, l: 'ru' | 'en' = lang()): Reply {
  const env = envFromSystem(l);
  if (pending && pending.expiresAt > Date.now()) {
    const p = pending; pending = null;
    const v = fillFrom(p.slot, text, env);
    if (v !== null && v !== undefined) {
      const parsed: Parsed = { ...p.parsed, slots: { ...p.parsed.slots, [p.slot]: v } };
      parsed.missing = missingSlots(parsed.kind, parsed.slots);
      const it = toIntent(parsed, env);
      if (it && !parsed.missing.length) return runAll([it], l);
    }
  }
  pending = null;
  const ds = analyze(text, env);
  if (ds.length === 1) return toReply(ds[0], env, l);
  const execs = ds.filter((d): d is Extract<Decision, { action: 'execute' }> => d.action === 'execute');
  const intents = execs.map((d) => toIntent(d.parsed, env)).filter((x): x is Intent => !!x);
  if (execs.length === ds.length && intents.length === ds.length) return runAll(intents, l);
  // something in the phrase needs an answer first: ask about that, the rest is not done
  const first = ds.find((d) => d.action !== 'execute') ?? ds[0];
  return toReply(first, env, l);
}

