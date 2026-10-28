import { buildLexicon, type Lexicon } from '../lexicon';
import { classify, DOMAIN_OF } from '../classifier';
import { decide } from '../decide';
import { SCORE } from '../params';
import { buildCtx, knownWord, runRules, vocabStems, vocabWords, type Ctx } from './engine';
import { segments } from './segment';
import { has, QUESTION } from './rules/util';
import { askText, clarifyText, examples, previewText } from './texts';
import './rules/habits';
import './rules/planner';
import './rules/misc';
import './rules/en';
import './rules/habits2';
import './rules/mood2';
import './rules/quits';
import './rules/goals';
import './rules/planner2';
import './rules/planRead';
import './rules/focus';
import type { Decision, Parsed, ParseEnv } from '../types';

/*
 * text → decisions (ТЗ 6.6, 6.7). Each segment is cleaned, every rule is tried, the scores are mixed with the classifier
 * (it agrees with the rule's domain, or says «not for this app»), and decide() turns the best candidates into an action.
 */
const lexCache = new WeakMap<object, Lexicon>();
const lexOf = (env: ParseEnv) => { let l = lexCache.get(env); if (!l) { l = buildLexicon(env); lexCache.set(env, l); } return l; };

const SHORT = new Set('я у в на по с к и мне меня мой моя мои где что как не это а за из от до для про ты мы он она вы'.split(' '));
const PREPS = ['на', 'в', 'по', 'с', 'к'];
const GLUE = /^(\p{L}{4,})(на|по|за|от|до|из|для|про|при)$/u;
/** variants of a phrase with one slip undone: two neighbours swapped, a preposition put back, a glued word split */
export function repairs(c: string): string[] {
  const t = c.split(' ');
  const out = new Set<string>();
  for (let i = 0; i + 1 < t.length; i++) { const v = [...t]; [v[i], v[i + 1]] = [v[i + 1], v[i]]; out.add(v.join(' ')); }
  for (let i = 0; i <= t.length; i++) for (const p of PREPS) out.add([...t.slice(0, i), p, ...t.slice(i)].join(' '));
  for (let i = 0; i < t.length; i++) { const g = t[i].match(GLUE); if (g) out.add([...t.slice(0, i), g[1], g[2], ...t.slice(i + 1)].join(' ')); }
  for (let i = 0; i < t.length; i++) if (t[i].length >= 9) for (const p of ['на', 'в', 'по']) if (t[i].startsWith(p === 'в' ? 'в' : p) && t[i].length > 9) out.add([...t.slice(0, i), p, t[i].slice(p.length), ...t.slice(i + 1)].join(' '));
  for (let i = 0; i < t.length; i++) for (const w of vocabWords()) if (w.length >= 4 && t[i].length >= w.length + 2 && t[i].startsWith(w)) out.add([...t.slice(0, i), w, t[i].slice(w.length), ...t.slice(i + 1)].join(' '));
  // a glued pair whose second half is a known word or stem: «моилучшие» → «мои лучшие»
  for (let i = 0; i < t.length; i++) for (const w of [...vocabWords(), ...vocabStems()]) if (w.length >= 5 && t[i].length >= w.length + 2 && t[i].endsWith(w)) out.add([...t.slice(0, i), t[i].slice(0, t[i].length - w.length), w, ...t.slice(i + 1)].join(' '));
  // two short words glued together («гдея», «уменя»)
  for (let i = 0; i < t.length; i++) if (t[i].length >= 3 && t[i].length <= 14) for (let k = 1; k < t[i].length; k++) {
    const l = t[i].slice(0, k), r = t[i].slice(k);
    if ((SHORT.has(l) && (SHORT.has(r) || knownWord(r))) || (knownWord(l) && SHORT.has(r))) out.add([...t.slice(0, i), l, r, ...t.slice(i + 1)].join(' '));
  }
  out.delete(c);
  return [...out].slice(0, 200);
}

const LISTY = new Set(['goal.split', 'goal.addFull', 'task.addMany', 'task.doneMany', 'ritual.create', 'prefs.macro.add', 'template.save', 'weekplan']);
export type AnalyzeOpts = { asr?: number | null };

/** candidates of one segment, best first */
export function candidates(text: string, env: ParseEnv, opts: AnalyzeOpts = {}, ctxOut?: { ctx?: Ctx }): Parsed[] {
  let ctx = buildCtx(text, env, lexOf(env), 'lex');
  let hits = runRules(ctx);
  // nothing matched: the phrase may hold a slip in a command word («нстроение»); fix those and try again
  if (!hits.some((h) => h.confidence >= 0.5)) {
    const ctx2 = buildCtx(text, env, lexOf(env), 'all');
    const hits2 = runRules(ctx2);
    if (hits2.length) { ctx = ctx2; hits = hits2; }
  }
  // still nothing: speech recognisers swap neighbours, drop prepositions and glue words — try those repairs
  let repaired = false;
  if (!hits.some((h) => h.confidence >= 0.8 || (!h.rule.bare && h.confidence >= 0.6))) {
    const found = repairs(ctx.c).flatMap((v) => runRules(buildCtx(v, env, lexOf(env), 'all')).filter((h) => !h.rule.bare && !(h.risk !== 'R0' && has(QUESTION, ctx.c))));
    if (found.length) { hits = [...hits.filter((h) => h.confidence >= 0.8 || !h.rule.bare), ...found.map((h) => ({ ...h, confidence: h.confidence * 0.99 }))]; repaired = true; }
  }
  void repaired;
  if (ctxOut) ctxOut.ctx = ctx;
  if (!hits.length) return [];
  const probs = classify(ctx.c);
  const pOf = (d: string) => probs.find((x) => x.domain === d)?.p ?? 0;
  const oos = pOf('oos');
  const best = new Map<string, Parsed>();
  for (const h of hits) {
    const { rule: _r, ...p } = h;
    void _r;
    let conf = p.confidence * (0.97 + 0.03 * pOf(DOMAIN_OF(p.kind)));
    // an explicit command is not overruled by «not for this app» unless the classifier is nearly sure
    if (oos > (p.confidence >= 0.88 ? 0.99 : SCORE.oosClassifier)) conf *= 1 - 0.7 * Math.min(1, (oos - SCORE.oosClassifier) / (1 - SCORE.oosClassifier));
    if (opts.asr != null) conf *= SCORE.asrBase + SCORE.asrWeight * opts.asr;
    p.confidence = Math.round(conf * 1000) / 1000;
    const prev = best.get(p.kind);
    if (!prev || prev.confidence < p.confidence) best.set(p.kind, p);
  }
  return [...best.values()].sort((a, b) => b.confidence - a.confidence);
}

export function analyzeText(raw: string, env: ParseEnv, opts: AnalyzeOpts = {}): Decision[] {
  const dopts = (text: string) => ({ lang: env.lang, preview: previewText(env.lang), ask: askText(env.lang), clarifyQuestion: clarifyText(env.lang), examples: examples(env.lang), text });
  const one = (text: string): Decision => decide(candidates(text, env, opts), dopts(text));
  const whole = one(raw);
  // «сделал душ и прогулку»: one verb, a list of habits — each name is checked on its own
  const cx: { ctx?: Ctx } = {};
  const lead = candidates(raw, env, opts, cx)[0];
  const q = lead?.kind === 'habit.done' ? String(lead.slots.query ?? '') : '';
  if (/ и |, /.test(q)) {
    const at = cx.ctx ? cx.ctx.c.indexOf(q) : -1;
    const names = q.split(/ и |, /).map((x) => x.trim()).filter(Boolean);
    if (cx.ctx && at > 0 && names.length >= 2 && names.every((n) => cx.ctx!.habit(n))) {
      const lead0 = cx.ctx.c.slice(0, at).trim();
      return names.map((n) => one(`${lead0} ${n}`));
    }
  }
  const parts = segments(raw);
  if (parts.length < 2) return [whole];
  // a command that takes a list (steps, tasks, a ritual) owns the commas of its phrase
  const kind = whole.action === 'clarify' ? whole.options[0]?.kind : whole.action === 'reject' ? '' : whole.parsed.kind;
  if (kind && LISTY.has(kind)) return [whole];
  let carry: string | undefined;
  const split: Decision[] = [];
  for (const p of parts) {
    let cands = candidates(p, env, opts);
    // «…завтра в девять зарядка, а потом в десять созвон»: the day carries over to the next task
    const top = cands[0];
    if (top?.kind === 'task.add') {
      if (!top.slots.day && carry) top.slots.day = carry;
      if (top.slots.day) carry = top.slots.day as string;
    }
    cands = cands.length ? cands : [];
    split.push(decide(cands, dopts(p)));
  }
  // the split wins only if every part is a command by itself
  const everyOk = split.every((d) => d.action !== 'reject');
  const wholeStrong = whole.action === 'execute' && whole.parsed.confidence >= 0.85 && !everyOk;
  return everyOk && !wholeStrong ? split : [whole];
}
