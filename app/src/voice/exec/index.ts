import { isoDay } from '../../lib/day';
import { getSystem, type SystemRaw } from '../../state/system';
import { journal } from '../journal';
import { dialog, type DialogContext } from '../dialog/context';
import { R } from '../reply';
import { legacyHistory, legacyRun, legacyRunMany, toIntent } from './legacy';
import type { Intent } from '../nlu';
import type { Parsed, ParseEnv } from '../nlp/types';
import type { Reply } from './types';

/*
 * Executors (ТЗ 6.10): one handler per intent kind. A handler reads the person's data, calls actions.ts (never the database),
 * and returns a reply with the UndoOps that take the change back. Kinds without a handler yet go to the first-generation
 * executor (legacy.ts) until their work package moves them here.
 */
export type ExecCtx = { env: ParseEnv; lang: 'ru' | 'en'; ru: boolean; now: Date; day: string; sys: SystemRaw | undefined; dialog: DialogContext };
export type Handler = (p: Parsed, c: ExecCtx) => Reply;

const HANDLERS = new Map<string, Handler>();
export const register = (kinds: string | string[], h: Handler) => { for (const k of Array.isArray(kinds) ? kinds : [kinds]) HANDLERS.set(k, h); };
export const hasHandler = (kind: string) => HANDLERS.has(kind);

export const ctxOf = (env: ParseEnv): ExecCtx => ({ env, lang: env.lang, ru: env.lang === 'ru', now: env.now, day: isoDay(env.now), sys: getSystem(), dialog: dialog.get() });

const notWired = (c: ExecCtx): Reply => R.error(c.ru ? 'Это я пойму, но пока не умею делать голосом. Скоро добавим.' : 'I understand that, but I can’t do it by voice yet.');

register('undo', (_p, c) => {
  // «отмени» takes the newer of the two: a change made by an executor that still keeps closures, or a journal entry
  const old = legacyHistory.peek();
  const j = journal.undoable()[0];
  if (old && (!j || old.at > j.at)) { legacyHistory.pop()?.undo(); return R.done(c.ru ? 'Отменил последнее действие' : 'Undone'); }
  if (j) { journal.undo(1); return R.done(c.ru ? `Отменил: ${j.label}` : `Undone: ${j.label}`); }
  return R.info(c.ru ? 'Отменять нечего' : 'Nothing to undo');
});

/** run one command; a change goes into the journal */
export function execute(p: Parsed, c: ExecCtx): Reply {
  const h = HANDLERS.get(p.kind);
  if (h) return h(p, c);
  const it = toIntent(p, c.env);
  return it ? legacyRun(it, c.lang) : notWired(c);
}

/** several commands from one phrase, done together and undone together */
export function executeMany(ps: Parsed[], c: ExecCtx): Reply {
  if (ps.length === 1) return execute(ps[0], c);
  const rs: Reply[] = [];
  const legacy: Intent[] = [];
  for (const p of ps) {
    if (HANDLERS.has(p.kind)) rs.push(execute(p, c)); else { const it = toIntent(p, c.env); if (it) legacy.push(it); else rs.push(notWired(c)); }
  }
  if (legacy.length) rs.push(legacyRunMany(legacy, c.lang));
  const q = rs.find((r) => r.choices);
  return {
    ok: rs.some((r) => r.ok), kind: q ? 'ask' : rs.every((r) => r.ok) ? 'done' : 'info',
    screen: rs.map((r) => r.screen).filter(Boolean).join('. '), speech: rs.map((r) => r.speech).filter(Boolean).join('. '),
    list: rs.flatMap((r) => r.list ?? []), choices: q?.choices, undo: rs.flatMap((r) => r.undo ?? []), undoable: rs.some((r) => r.undoable), close: rs.every((r) => r.close),
  };
}
