import { DIALOG } from '../nlp/params';
import { normalize } from '../nlp/normalize';
import { dialog } from '../dialog/context';
import { mood, number, yesno, type YesNo } from '../dialog/grammars';
import { journal } from '../journal';
import { R } from '../reply';
import type { ExecCtx } from '../exec';
import type { Chip, Reply, UndoOp } from '../exec/types';

/*
 * Guided flows (ТЗ 6.9): a short conversation with steps. The state lives in the dialog context. At any moment the person
 * can say «стоп/хватит», «повтори», «дальше», «назад»; an answer to the current step has priority over a new command; a step
 * that hears nothing repeats once, then the flow pauses («Продолжим позже — скажите «дальше»»).
 */
export type Grammar = 'yesno' | 'number' | 'mood' | 'free' | 'none';
export type Answer = { text: string; yn: YesNo | null; num: number | null; mood: number | null; control: 'stop' | 'repeat' | 'next' | 'back' | null };
export type FlowState = { id: string; step: string; data: Record<string, unknown>; startedAt: number; lastAt: number; listen: Grammar; retried?: boolean; paused?: boolean };
export type FlowOut = {
  say: string; speech?: string | null; list?: string[]; chips?: Chip[]; ops?: UndoOp[];
  /** the next step id (state), or end */
  step?: string; data?: Record<string, unknown>; end?: boolean; switchTo?: string; switchArg?: Record<string, unknown>; listen?: Grammar; choices?: Reply['choices']; nav?: string; windowMs?: number;
};
export interface FlowDef {
  id: string;
  start(c: ExecCtx, arg?: Record<string, unknown>): FlowOut;
  /** one answer to the current step */
  answer(c: ExecCtx, f: FlowState, a: Answer): FlowOut;
  /** the current step said again */
  repeat?(c: ExecCtx, f: FlowState): FlowOut;
  /** «стоп» in the middle: stop timers, save what was gathered; the returned line is the closing reply */
  stop?(c: ExecCtx, f: FlowState): FlowOut | void;
}

const FLOWS = new Map<string, FlowDef>();
export const defineFlow = (d: FlowDef) => { FLOWS.set(d.id, d); };
export const hasFlow = (id: string) => FLOWS.has(id);
export const flowActive = () => !!dialog.get().flow;
/** a timed practice ran out by itself: the flow that waited for it is over */
export const endFlow = (id: string) => { const ctx = dialog.get(); if (ctx.flow?.id === id) ctx.flow = undefined; };

const CONTROL: [RegExp, Answer['control']][] = [
  [/^(?:стоп|хватит|выход|достаточно|заверши|остановись|готово|все|сохрани|stop|enough|quit|exit|done|finished)$/, 'stop'],
  [/^(?:повтори|ещё раз|еще раз|repeat|again)$/, 'repeat'],
  [/^(?:дальше|далее|следующ\p{L}*|пропусти|skip|next)$/u, 'next'],
  [/^(?:назад|вернись|back|previous)$/, 'back'],
];
export function answerOf(text: string): Answer {
  const t = normalize(text);
  const control = CONTROL.find(([re]) => re.test(t))?.[1] ?? null;
  return { text: text.trim(), yn: yesno(text), num: number(text), mood: mood(text), control };
}

function toReply(out: FlowOut, f: FlowState | null, c: ExecCtx): Reply {
  const listening = !out.end && out.listen !== 'none';
  return {
    ok: true, kind: out.end ? 'done' : 'ask', screen: out.say, speech: out.speech === undefined ? out.say : out.speech, list: out.list, chips: out.chips,
    choices: out.choices, undo: out.ops, nav: out.nav, close: undefined,
    expect: listening ? { windowMs: out.windowMs ?? DIALOG.flowStepMs, grammar: f?.listen } : undefined,
    flow: f ? { id: f.id, step: f.step } : undefined,
    ...(out.end && !c.ru ? {} : {}),
  };
}
function apply(def: FlowDef, f: FlowState | null, out: FlowOut, c: ExecCtx): Reply {
  const ctx = dialog.get();
  if (out.ops?.length) journal.add({ kind: `flow.${def.id}`, label: out.say.slice(0, 80), ops: out.ops });
  if (out.switchTo) { ctx.flow = undefined; return startFlow(out.switchTo, c, out.switchArg); }
  if (out.end || !f) { ctx.flow = undefined; return toReply(out, null, c); }
  f.step = out.step ?? f.step;
  f.data = { ...f.data, ...(out.data ?? {}) };
  f.listen = out.listen ?? 'yesno';
  f.lastAt = Date.now(); f.retried = false; f.paused = false;
  ctx.flow = f;
  return toReply(out, f, c);
}

export function startFlow(id: string, c: ExecCtx, arg?: Record<string, unknown>): Reply {
  const def = FLOWS.get(id);
  if (!def) return R.error(c.ru ? 'Этот сценарий пока не готов' : 'That guided mode is not ready yet');
  const out = def.start(c, arg);
  const f: FlowState = { id, step: out.step ?? 'start', data: out.data ?? {}, startedAt: Date.now(), lastAt: Date.now(), listen: out.listen ?? 'yesno' };
  return apply(def, out.end ? null : f, out, c);
}

/** the person said something while a flow is running; null = it is not an answer, parse it as a new command */
export function flowTurn(text: string, c: ExecCtx): Reply | null {
  const f = dialog.get().flow;
  if (!f) return null;
  const def = FLOWS.get(f.id);
  if (!def) { dialog.get().flow = undefined; return null; }
  const a = answerOf(text);
  if (a.control === 'stop') {
    dialog.get().flow = undefined;
    const out = def.stop?.(c, f);
    if (out) return apply(def, null, { ...out, end: true }, c);
    return R.done(c.ru ? 'Хорошо, остановились' : 'Okay, stopped');
  }
  if (a.control === 'repeat' && def.repeat) return apply(def, f, def.repeat(c, f), c);
  const usable = a.control !== null || f.listen === 'free' || f.listen === 'none'
    || (f.listen === 'yesno' && a.yn !== null) || (f.listen === 'number' && (a.num !== null || a.yn !== null)) || (f.listen === 'mood' && (a.mood !== null || a.yn === 'skip'));
  if (!usable) return null;
  return apply(def, f, def.answer(c, f, a), c);
}

/** nothing was heard for a step: say it once more, then pause */
export function flowTimeout(c: ExecCtx): Reply | null {
  const f = dialog.get().flow;
  if (!f) return null;
  const def = FLOWS.get(f.id);
  if (!def) return null;
  if (!f.retried && def.repeat) { f.retried = true; const out = def.repeat(c, f); return toReply(out, f, c); }
  f.paused = true;
  return { ok: true, kind: 'info', screen: c.ru ? 'Продолжим позже — скажите «дальше»' : 'We can continue later — say “next”', speech: c.ru ? 'Продолжим позже. Скажите «дальше».' : 'We can continue later. Say “next”.', flow: { id: f.id, step: f.step } };
}
