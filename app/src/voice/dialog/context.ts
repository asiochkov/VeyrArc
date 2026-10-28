import { DIALOG } from '../nlp/params';
import type { Parsed } from '../nlp/types';
import type { FlowState } from '../flows/engine';

/*
 * What the assistant remembers between phrases (ТЗ 6.8): the last things touched (for «её», «это», «вторую»), the last list
 * it showed, a question waiting for an answer, the last action (for «нет, на четверг»), a guided flow in progress. Kept in
 * memory only; the context forgets itself five minutes after the last action.
 */
export type Entity = { id?: string; name: string };
export type DialogContext = {
  last: { task?: Entity; habit?: Entity; goal?: Entity; quit?: Entity; day?: string; list?: string[]; kind?: string; slots?: Record<string, unknown>; at: number };
  /** a question about a missing detail */
  pending?: { parsed: Parsed; slot: string; expiresAt: number };
  /** a yes/no question */
  confirm?: { expiresAt: number };
  /** the last change, for corrections */
  action?: { at: number; parsed: Parsed; journalId?: string };
  flow?: FlowState;
  /** phrases in a row that were not understood */
  misses: number;
};
const fresh = (): DialogContext => ({ last: { at: 0 }, misses: 0 });
let ctx: DialogContext = fresh();

export const dialog = {
  get(now = Date.now()): DialogContext {
    if (ctx.last.at && now - ctx.last.at > DIALOG.contextTtlMs) ctx = { ...fresh(), flow: ctx.flow, misses: ctx.misses };
    if (ctx.pending && ctx.pending.expiresAt < now) ctx.pending = undefined;
    if (ctx.confirm && ctx.confirm.expiresAt < now) ctx.confirm = undefined;
    return ctx;
  },
  /** remember what the last command touched */
  remember(p: Parsed, ents: { task?: Entity; habit?: Entity; goal?: Entity; quit?: Entity }, list?: string[], now = Date.now()) {
    const c = dialog.get(now);
    c.last = { ...c.last, ...ents, kind: p.kind, slots: p.slots, day: typeof p.slots.day === 'string' ? p.slots.day : c.last.day, list: list ?? c.last.list, at: now };
  },
  setList(list: string[], now = Date.now()) { const c = dialog.get(now); c.last = { ...c.last, list, at: now }; },
  reset() { ctx = fresh(); },
};
