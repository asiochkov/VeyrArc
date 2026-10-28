import { DIALOG } from '../nlp/params';
import { analyze } from '../nlp/pipeline';
import { buildCtx } from '../nlp/parse/engine';
import { buildLexicon } from '../nlp/lexicon';
import { normalize } from '../nlp/normalize';
import { missingSlots } from '../nlp/risk';
import { envFromSystem } from '../exec/env';
import { ctxOf, execute, executeMany, type ExecCtx } from '../exec';
import { journal } from '../journal';
import { R } from '../reply';
import '../flows/defs';
import '../exec/all';
import { flowTimeout, flowTurn } from '../flows/engine';
import { dialog } from './context';
import { cancels, number, ordinal, yesno } from './grammars';
import { previewOf } from './texts';
import type { Decision, Parsed, ParseEnv } from '../nlp/types';
import type { Reply } from '../exec/types';
import type { Source } from '../nlp/types';

/*
 * One phrase in, one reply out (ТЗ 6.8). Before the phrase is parsed as a new command it is tried as: an answer to the
 * question just asked, a correction of the last action («нет, на четверг»), a follow-up with the verb left out («а на
 * завтра?»), a reference («её», «вторую»). Whatever is left goes to the parser, then to the executors; changes are journaled.
 */

const TIME_CHIPS: [string, [string, string], string | null][] = [['morning', ['Утром', 'Morning'], '09:00'], ['day', ['Днём', 'Afternoon'], '14:00'], ['evening', ['Вечером', 'Evening'], '19:00'], ['none', ['Без времени', 'No time'], null]];

function finish(parsed: Parsed[], env: ParseEnv, c: ExecCtx, src: Source): Reply {
  const r = parsed.length === 1 ? execute(parsed[0], c) : executeMany(parsed, c);
  const ctx = dialog.get();
  ctx.misses = r.ok ? 0 : ctx.misses;
  if (r.ok && r.kind !== 'ask') {
    const p = parsed[0];
    const task = typeof p.slots.query === 'string' && p.kind.startsWith('task.') ? { id: p.slots.id as string | undefined, name: p.slots.query } : undefined;
    const habit = typeof p.slots.query === 'string' && p.kind.startsWith('habit.') ? { id: p.slots.id as string | undefined, name: p.slots.query } : undefined;
    const title = typeof p.slots.title === 'string' && p.kind === 'task.add' ? { name: p.slots.title } : undefined;
    dialog.remember(p, { task: task ?? title, habit }, r.list);
    if (r.undo?.length) {
      const e = journal.add({ kind: p.kind, label: r.screen.slice(0, 80), ops: r.undo });
      ctx.action = { at: Date.now(), parsed: p, journalId: e.id };
    } else if (r.undoable) ctx.action = { at: Date.now(), parsed: p };
  }
  void env; void src;
  return r;
}

/** a decision → a reply (questions are remembered so that the next phrase answers them) */
function reply(ds: Decision[], env: ParseEnv, c: ExecCtx, src: Source): Reply {
  const ru = env.lang === 'ru';
  const ctx = dialog.get();
  if (ds.length > 1 && ds.every((d) => d.action === 'execute')) return finish(ds.map((d) => (d as Extract<Decision, { action: 'execute' }>).parsed), env, c, src);
  const d = ds.find((x) => x.action !== 'execute') ?? ds[0];
  switch (d.action) {
    case 'execute': return finish([d.parsed], env, c, src);
    case 'confirm': {
      ctx.confirm = { expiresAt: Date.now() + DIALOG.pendingTtlMs };
      const p = d.parsed;
      return R.confirm(previewOf(p, env.lang), { choices: [
        { label: ru ? 'Да' : 'Yes', yes: true, run: () => { ctx.confirm = undefined; return finish([p], env, c, src); } },
        { label: ru ? 'Нет' : 'No', yes: false, run: () => { ctx.confirm = undefined; return R.info(ru ? 'Хорошо, ничего не меняю' : 'Okay, nothing changed'); } },
      ], expect: { windowMs: DIALOG.pendingTtlMs } });
    }
    case 'clarify':
      return R.ask(d.question, { choices: d.options.map((o) => ({ label: previewOf(o, env.lang).replace(/\?$/, ''), run: () => finish([o], env, c, src) })), expect: { windowMs: DIALOG.pendingTtlMs } });
    case 'ask-slot': {
      ctx.pending = { parsed: d.parsed, slot: d.slot, expiresAt: Date.now() + DIALOG.pendingTtlMs };
      const base = d.parsed;
      const fill = (v: unknown) => () => { ctx.pending = undefined; const p = { ...base, slots: { ...base.slots, ...(v === null ? {} : { [d.slot]: v }) } }; p.missing = v === null ? [] : missingSlots(p.kind, p.slots); return finish([p], env, c, src); };
      const choices = d.slot === 'time' ? TIME_CHIPS.map(([, l, v]) => ({ label: l[ru ? 0 : 1], run: fill(v) }))
        : d.slot === 'day' ? [{ label: ru ? 'Сегодня' : 'Today', run: fill(c.day) }, { label: ru ? 'Завтра' : 'Tomorrow', run: fill(isoNext(c.now)) }] : undefined;
      return R.ask(d.question, { choices, expect: { slot: d.slot, windowMs: DIALOG.slotListenMs } });
    }
    default: {
      ctx.misses += d.reason === 'oos' || d.reason === 'low' ? 1 : 0;
      const r = d.reply;
      const chips = ctx.misses >= 2 ? (ru ? ['сделал зарядку', 'что у меня сегодня', 'завтра в 10 стоматолог', 'фокус 25'] : ['done workout', 'what do i have today', 'tomorrow at 10 dentist', 'focus 25']).map((x) => ({ label: x, say: x })) : r.chips;
      return { ...r, chips, typing: ctx.misses >= 3 || undefined };
    }
  }
}
const isoNext = (now: Date) => { const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

/* ---------- pieces tried before the parser ---------- */
const NAME_VERBS: [RegExp, 'task' | 'habit' | 'goal' | 'quit'][] = [
  [/(?:перенеси|удали|продли|отмени|сдвинь|отложи|закрой|вычеркни|move|delete|cancel|extend)/, 'task'],
  [/(?:отметь|сделал|выполнил|сними|mark|uncheck|did)/, 'habit'],
  [/(?:заверши цель|цель|goal)/, 'goal'], [/(?:срыв|сорвался|relapse)/, 'quit'],
];
/** «перенеси её на пятницу» → «перенеси встреча с димой на пятницу»; «отметь вторую» → the second line of the last list */
function resolveRefs(text: string, c: ExecCtx): string {
  const last = dialog.get().last;
  const n = normalize(text);
  let out = text;
  const pron = /(?<![\p{L}])(её|ее|его|это|эту|ту|тот|она|оно|it|that|this)(?![\p{L}])/iu;
  if (pron.test(n)) {
    const kind = NAME_VERBS.find(([re]) => re.test(n))?.[1] ?? (last.task ? 'task' : 'habit');
    const ent = last[kind];
    if (ent) out = out.replace(pron, ent.name);
  }
  const ord = n.match(/(?<![\p{L}])(перв\p{L}*|втор\p{L}*|трет\p{L}*|последн\p{L}*|first|second|third|last)(?![\p{L}])/u);
  if (ord && last.list?.length) {
    const i = ordinal(ord[1], last.list.length);
    if (i !== null) out = out.replace(new RegExp(ord[1], 'iu'), last.list[i].replace(/^\d+[.)]\s*/, '').replace(/\s+\d{1,2}:\d{2}.*$/, ''));
  }
  void c;
  return out;
}

/** «нет, на четверг» right after an action: undo it and do it again with the new detail */
function correction(text: string, env: ParseEnv, c: ExecCtx, src: Source): Reply | null {
  const act = dialog.get().action;
  if (!act || Date.now() - act.at > DIALOG.correctionWindowMs) return null;
  const m = normalize(text).match(/^(?:нет|не то|не туда|наоборот|я имел в виду|имел в виду|no|wrong|i meant)[ ,]*(.*)$/);
  if (!m) return null;
  const ru = env.lang === 'ru';
  const lex = buildLexicon(env);
  const rest = m[1].trim();
  const cx = rest ? buildCtx(rest, env, lex) : null;
  const patch: Record<string, unknown> = {};
  if (cx?.when.date) patch.day = cx.when.date;
  if (cx?.when.time) patch.time = cx.when.time;
  if (cx?.when.end) patch.end = cx.when.end;
  const n = rest && !Object.keys(patch).length ? number(rest) : null;
  if (n !== null) patch[act.parsed.kind.startsWith('mood') ? 'level' : act.parsed.kind.startsWith('focus') ? 'minutes' : 'amount'] = n;
  if (act.journalId) journal.undoById(act.journalId);
  if (!Object.keys(patch).length) { dialog.get().action = undefined; return R.info(ru ? 'Хорошо, отменил. Что сделать?' : 'Okay, undone. What should I do?', { expect: { windowMs: DIALOG.slotListenMs } }); }
  const p: Parsed = { ...act.parsed, slots: { ...act.parsed.slots, ...patch } };
  dialog.get().action = undefined;
  return finish([p], env, c, src);
}

/** «а на завтра?»: the same kind of command as the last one, with a new day or time */
function followUp(text: string, env: ParseEnv, c: ExecCtx, src: Source): Reply | null {
  const last = dialog.get().last;
  const m = normalize(text).match(/^(?:а|и|and|what about)\s+(.+)$/);
  if (!m || !last.kind || !last.slots) return null;
  const cx = buildCtx(m[1], env, buildLexicon(env));
  if (!cx.when.date && !cx.when.time) return null;
  if (cx.body.split(' ').filter(Boolean).length > 1) return null;
  const p: Parsed = { kind: last.kind, slots: { ...last.slots, ...(cx.when.date ? { day: cx.when.date } : {}), ...(cx.when.time ? { time: cx.when.time } : {}) }, confidence: 0.85, risk: 'R0', missing: [], why: ['follow-up'] };
  if (!/^(?:plan\.|stats\.|list\.|focus\.sum)/.test(p.kind) && !/^(?:task\.add)$/.test(p.kind)) return null;
  return finish([p], env, c, src);
}

/** the answer to the question that was just asked */
function answer(text: string, env: ParseEnv, c: ExecCtx, src: Source): Reply | null {
  const ctx = dialog.get();
  const ru = env.lang === 'ru';
  const pend = ctx.pending;
  if (!pend) return null;
  if (cancels(text) || yesno(text) === 'no') { ctx.pending = undefined; return R.info(ru ? 'Хорошо, отменил' : 'Okay, cancelled'); }
  const cx = buildCtx(text, env, buildLexicon(env));
  const n = number(text);
  let v: unknown = null;
  switch (pend.slot) {
    case 'time': v = cx.when.time ?? (/без времени|no time/.test(normalize(text)) ? undefined : n !== null && n < 24 ? cx.time(String(n)) : null); break;
    case 'day': v = cx.when.date; break;
    case 'minutes': case 'amount': case 'level': case 'seconds': case 'hours': v = n; break;
    case 'title': case 'query': case 'text': case 'name': v = cx.c.trim() || null; break;
  }
  if (v === null) return null; // not an answer: a new command
  ctx.pending = undefined;
  const p: Parsed = { ...pend.parsed, slots: { ...pend.parsed.slots, ...(v === undefined ? {} : { [pend.slot]: v }) } };
  p.missing = v === undefined ? [] : missingSlots(p.kind, p.slots);
  return finish([p], env, c, src);
}

export function handlePhrase(text: string, src: Source = 'voice', asr: number | null = null, envIn?: ParseEnv): Reply {
  const env = envIn ?? envFromSystem();
  const c = ctxOf(env);
  // a running flow hears the phrase first: an answer to its step wins over a new command
  const ft = flowTurn(text, c);
  if (ft) return ft;
  const ans = answer(text, env, c, src);
  if (ans) return ans;
  const corr = correction(text, env, c, src);
  if (corr) return corr;
  const fu = followUp(text, env, c, src);
  if (fu) return fu;
  dialog.get().pending = undefined;
  return reply(analyze(resolveRefs(text, c), env, { asr }), env, c, src);
}

/** nothing was heard while a flow waited for an answer: ask again once, then pause; null when no flow runs */
export const handleSilence = (): Reply | null => flowTimeout(ctxOf(envFromSystem()));
