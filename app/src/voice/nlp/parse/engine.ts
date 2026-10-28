import { normalize } from '../normalize';
import { wordsToDigits } from '../itn';
import { wordsToDigitsEn } from '../itnEn';
import { takeDateEn, takeDurationEn, takeTimeEn } from '../datesEn';
import { takeDate, takeDuration, takeTime } from '../dates';
import { DOMAIN_WORDS, STOP, type Lexicon } from '../lexicon';
import { levenshtein, phoneticKey } from '../phonetic';
import { forms, stem, wordSim } from './morph';
import { specOf } from '../intents';
import { missingSlots } from '../risk';
import type { Parsed, ParseEnv } from '../types';

/*
 * The rule engine (ТЗ 6.6): a rule is a pattern over the cleaned phrase plus a function that reads its slots. The phrase is
 * cleaned once (fillers out, numbers as digits, near-miss words fixed against the app's vocabulary and the person's own
 * words), the time, date and duration are cut out of it, and every rule is tried. Every hit becomes a candidate with a
 * score; the pipeline then mixes the scores with the classifier and decides. Rules live in rules/*.ts, one file per group.
 */
export type When = { date?: string; time?: string; end?: string; duration?: number; rel?: boolean };
export type Ent = { id: string; name: string; sim: number };
export type Ctx = {
  raw: string;
  /** normalised, numbers still words */
  n: string;
  /** cleaned, numbers as digits, words fixed */
  c: string;
  /** the same with time, date and duration cut out */
  body: string;
  when: When;
  env: ParseEnv;
  lex: Lexicon;
  lang: 'ru' | 'en';
  habit(q: string): Ent | null;
  task(q: string): Ent | null;
  goal(q: string): Ent | null;
  quit(q: string): Ent | null;
  /** time / date in a loose piece of text */
  time(s: string): string | null;
  date(s: string): string | null;
};
export type Slots = Record<string, unknown>;
export type Rule = {
  kind: string;
  re: RegExp | RegExp[];
  /** read the slots; return null to drop the hit */
  slots?: (m: RegExpMatchArray, c: Ctx) => Slots | null;
  /** 0.9 explicit command · 0.6 template without a verb · 0.35 weak */
  score?: number;
  /** match against the whole cleaned phrase (with time and date) instead of the body */
  full?: boolean;
  lang?: 'ru' | 'en';
  /** these kinds lose when this rule hits (the more specific rule wins) */
  over?: string[];
  /** a template without a verb («завтра в 10 стоматолог»): loses to any other rule and is never used for repaired text */
  bare?: boolean;
  /** match the normalised text with the numbers still in words (free text: notes, oaths) */
  src?: 'n' | 'raw';
};

/** a rule source with ‹ and › as word edges (Cyrillic has no \b) */
export const rx = (src: string, flags = 'u') => new RegExp(src.replace(/‹/g, '(?<![\\p{L}\\d])').replace(/›/g, '(?![\\p{L}\\d])'), flags);

export const RULES: Rule[] = [];
export const add = (...r: Rule[]) => { RULES.push(...r); ruleWords = null; };

/* ---------- vocabulary for fixing near-misses ---------- */
let ruleWords: { words: Set<string>; stems: string[] } | null = null;
const COMMON = 'привет спасибо пожалуйста сегодня завтра послезавтра вчера через минут минуты минуту часа часов неделю недели месяц месяца день дней утром вечером днём ночью утра вечера ночи хорошее плохое отличное нормальное тревожно грустно'.split(' ');
/** whole words and stems (written «слово\\p{L}*») that the rules know */
function baseVocab() {
  if (ruleWords) return ruleWords;
  const words = new Set<string>(DOMAIN_WORDS.map((w) => w.replace(/ё/g, 'е')));
  const stems = new Set<string>();
  for (const w of COMMON) words.add(w.replace(/ё/g, 'е'));
  for (const r of RULES) for (const re of Array.isArray(r.re) ? r.re : [r.re]) {
    for (const m of re.source.matchAll(/([а-яё]{4,})(\\p\{L\}[*+])?/g)) (m[2] ? stems : words).add(m[1].replace(/ё/g, 'е'));
  }
  ruleWords = { words, stems: [...stems] };
  return ruleWords;
}

const TEMPORAL = 'неделе неделя недели месяце месяц месяца вечер утро день утра дня вечера ночи сегодня завтра послезавтра вчера понедельник вторник среда среду четверг пятница пятницу суббота субботу воскресенье января февраля марта апреля июня июля августа сентября октября ноября декабря утром вечером днем ночью неделю недели месяц месяца'.split(' ');
function fixTemporal(t: string): string {
  if (t.length < 5 || TEMPORAL.includes(t)) return t;
  for (const w of TEMPORAL) if (Math.abs(w.length - t.length) <= 1 && w[0] === t[0] && levenshtein(t, w) <= 1) return w;
  return t;
}

const isDeletion = (t: string, w: string) => { if (w.length !== t.length + 1) return false; for (let i = 0; i < w.length; i++) if (w.slice(0, i) + w.slice(i + 1) === t) return true; return false; };
const isSwap = (t: string, w: string) => { if (t.length !== w.length) return false; for (let i = 0; i + 1 < t.length; i++) if (t.slice(0, i) + t[i + 1] + t[i] + t.slice(i + 2) === w) return true; return false; };
export const vocabWords = (): Set<string> => baseVocab().words;
export const knownWord = (w: string): boolean => { const v = baseVocab(); return v.words.has(w) || v.stems.some((s) => w.startsWith(s)); };
export const vocabStems = (): string[] => baseVocab().stems;

function fixWords(tokens: string[], extra: Set<string>, level: Fix): string[] {
  const { words, stems } = baseVocab();
  const known = (w: string) => words.has(w) || extra.has(w) || stems.some((s) => w.startsWith(s));
  const pool = level === 'all' ? [...words, ...extra] : [...extra];
  const out: string[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const t = fixTemporal(tokens[i]);
    if (/\d/.test(t) || t.length < 3 || known(t) || STOP.has(t)) { out.push(t); continue; }
    // two halves of one word: «заряд ку» → «зарядку»
    const nx = tokens[i + 1];
    if (nx && !known(nx) && known(t + nx)) { out.push(t + nx); i++; continue; }
    if (t.length < 4 || !/^[а-я]+$/.test(t)) { out.push(t); continue; }
    let best: string | null = null, bd = t.length >= 8 ? 2 : 1;
    const key = phoneticKey(t);
    for (const w of pool) {
      if (Math.abs(w.length - t.length) > bd) continue;
      const same = phoneticKey(w) === key;
      // a slip sounds the same, or is one letter in a long word; short words that differ by a letter are other words («курить»/«купить»)
      // a deleted or swapped letter is a slip even in a short word; otherwise one letter in a long word
      const slip = !same && w[0] === t[0] && (isDeletion(t, w) || isSwap(t, w));
      if (t.length === 4 && !slip) continue;
      if (!same && !slip && (w[0] !== t[0] || t.length < 8)) continue;
      if (stem(w) === stem(t)) continue; // another case of the same word, not a slip
      const d = same ? 0 : slip ? 1 : levenshtein(t, w);
      if (d < bd || (d <= bd && best === null)) { best = w; bd = same ? 0 : Math.min(bd, 1); }
    }
    out.push(best ?? t);
  }
  return out;
}

/* ---------- entities ---------- */
const UNIT_WORDS = new Set('мин минут минуты минуту час часа часов раз стаканов стакан км шагов штук страниц'.split(' '));
const meaningful = (s: string) => s.toLowerCase().replace(/ё/g, 'е').split(/[^a-zа-я0-9]+/).filter((w) => w && !/^\d+$/.test(w) && !UNIT_WORDS.has(w) && !STOP.has(w));
export function rankEntities<T>(query: string, list: T[], id: (t: T) => string, name: (t: T) => string, floor = 0.6): { item: T; id: string; sim: number }[] {
  const q = meaningful(query);
  if (!q.length) return [];
  const out: { item: T; id: string; sim: number }[] = [];
  for (const item of list) {
    const nameWords = meaningful(name(item));
    if (!nameWords.length) continue;
    const per = q.map((w) => Math.max(...nameWords.map((n) => wordSim(w, n))));
    if (!per.some((x) => x >= 0.75)) continue;
    const mean = per.reduce((a, b) => a + b, 0) / per.length;
    const covered = nameWords.filter((n) => q.some((w) => wordSim(w, n) >= 0.75)).length / nameWords.length;
    const sim = Math.max(...per) * 0.5 + mean * 0.35 + covered * 0.15;
    if (sim >= floor) out.push({ item, id: id(item), sim });
  }
  return out.sort((a, b) => b.sim - a.sim);
}
export function matchEntity(query: string, list: { id: string; name: string }[], floor = 0.6): Ent | null {
  const top = rankEntities(query, list, (e) => e.id, (e) => e.name, floor)[0];
  return top ? { id: top.id, name: top.item.name, sim: top.sim } : null;
}

/* ---------- context ---------- */
const DANGLING = /\s+(?:на|в|во|к|до|по|за|с|со|от|у|to|at|on|for|by|in|from|until|till|as|of|the|a|an)(?=\s*$)/;
/** 'lex': only the person's own words are fixed; 'all': also the app's command words (second pass, when nothing matched) */
export type Fix = 'lex' | 'all';
export function buildCtx(raw: string, env: ParseEnv, lex: Lexicon, level: Fix = 'lex'): Ctx {
  let n = normalize(raw);
  for (const name of [env.assistantName, 'вейр', 'veyr']) if (name) n = normalize(n, { assistantName: name });
  const en = env.lang === 'en';
  const d = en ? wordsToDigitsEn(n) : wordsToDigits(n);
  const extra = new Set(lex.words.filter((w) => !lex.domain.has(w.word)).flatMap((w) => forms(w.word)));
  const c = fixWords(d.split(' ').filter(Boolean), extra, level).join(' ');
  let body = c;
  const when: When = {};
  const dur = (en ? takeDurationEn : takeDuration)(body); if (dur) { when.duration = dur.minutes; body = dur.rest; }
  const t = (en ? takeTimeEn : takeTime)(body, env.now); if (t) { when.time = t.time; when.end = t.end; if (t.date) when.date = t.date; if (t.rel) when.rel = true; body = t.rest; }
  const dt = (en ? takeDateEn : takeDate)(body, env.now); if (dt) { when.date = dt.date; body = dt.rest; }
  body = body.replace(DANGLING, '').replace(/\s+/g, ' ').trim();
  return {
    raw, n, c, body, when, env, lex, lang: env.lang,
    habit: (q) => matchEntity(q, env.habits.map((h) => ({ id: h.id, name: h.name }))),
    task: (q) => matchEntity(q, env.tasks.map((x) => ({ id: x.id, name: x.title }))),
    goal: (q) => matchEntity(q, env.goals.map((g) => ({ id: g.id, name: g.title }))),
    quit: (q) => matchEntity(q, env.quits.map((x) => ({ id: x.id, name: x.name }))),
    time: (s) => (en ? takeTimeEn(`at ${s}`, env.now) : takeTime(`в ${s}`, env.now))?.time ?? null,
    date: (s) => (en ? takeDateEn : takeDate)(s, env.now)?.date ?? null,
  };
}

/* ---------- running the rules ---------- */
export type Hit = Parsed & { rule: Rule };
export function runRules(ctx: Ctx): Hit[] {
  let out: Hit[] = [];
  for (const rule of RULES) {
    if ((rule.lang ?? 'ru') !== ctx.lang) continue;
    const text = rule.src === 'raw' ? ctx.raw.toLowerCase().replace(/ё/g, 'е').trim() : rule.src === 'n' ? ctx.n : rule.full ? ctx.c : ctx.body;
    for (const re of Array.isArray(rule.re) ? rule.re : [rule.re]) {
      const m = text.match(re);
      if (!m) continue;
      const slots = rule.slots ? rule.slots(m, ctx) : {};
      if (!slots) continue;
      const clean: Slots = {};
      for (const [k, v] of Object.entries(slots)) if (v !== undefined && !k.startsWith('_')) clean[k] = v;
      const missing = missingSlots(rule.kind, clean);
      if (typeof slots._ask === 'string' && !missing.includes(slots._ask)) missing.push(slots._ask);
      out.push({ kind: rule.kind, slots: clean, confidence: typeof slots._score === 'number' ? slots._score : rule.score ?? 0.9, risk: specOf(rule.kind).risk, missing, why: [`rule:${rule.kind}`], rule });
      break;
    }
  }
  if (out.some((h) => !h.rule.bare && h.confidence >= 0.5)) out = out.filter((h) => !h.rule.bare);
  // a more specific rule removes the hits of the kinds it names — also those of other rules of its own kind
  out = out.filter((h) => !out.some((g) => g.rule !== h.rule && g.rule.over?.includes(h.kind)));
  return out;
}