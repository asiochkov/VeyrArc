import { phoneticKey, phoneticSim } from './phonetic';
import type { Hypothesis } from '../stt/types';
import type { ParseEnv } from './types';

/*
 * The person's own words (ТЗ 6.4): names of habits, goals, steps, quits and the planner of the nearby days, personal
 * synonyms, the assistant's name — plus the app's fixed command vocabulary. Used to pick the best of the recogniser's variants
 * and to correct near-misses. Rebuilt when the data changes (debounced by the caller).
 */
export const DOMAIN_WORDS = ('отметь сделал сделала выпил выпила прочитал пробежал медитировал добавь создай удали перенеси отложи отмени запиши запланируй напомни закрой вычеркни ' +
  'покажи открой верни поставь включи останови продли начни фокус таймер настроение вода привычка привычку цель цели шаг задача задачу встреча отказ ' +
  'сегодня завтра послезавтра вчера понедельник вторник среда среду четверг пятница пятницу суббота субботу воскресенье январь февраль март апрель май июнь июль август сентябрь октябрь ноябрь декабрь ' +
  'утром днём вечером ночью минут минуты минуту часов часа час неделя неделю месяц серия серию индекс заметка дневник ' +
  'mark done add create delete move remind focus timer mood water habit goal task meeting today tomorrow').split(' ');
const DOMAIN_SET = new Set(DOMAIN_WORDS);
export const STOP = new Set('и в во на с со к ко у по до от из за для про а но или что чтобы то это я мне мой моя моё мою не ни же бы ли вот так как уже ещё еще ну э эм the a an of to for at in on my i is'.split(' '));

export type Lexicon = { terms: string[]; words: { word: string; key: string }[]; domain: Set<string> };

const wordsOf = (s: string) => s.toLowerCase().replace(/ё/g, 'е').split(/[^a-zа-я0-9]+/).filter((w) => w.length >= 3);

export function buildLexicon(env: Pick<ParseEnv, 'habits' | 'tasks' | 'goals' | 'quits' | 'aliases' | 'assistantName'>, extra: string[] = []): Lexicon {
  const terms = [
    ...env.habits.map((h) => h.name), ...env.tasks.map((t) => t.title), ...env.goals.flatMap((g) => [g.title, ...(g.steps ?? [])]), ...env.quits.map((q) => q.name),
    ...(env.aliases ?? []).flatMap((a) => [a.alias, a.target]), ...(env.assistantName ? [env.assistantName] : []), ...extra,
  ];
  const seen = new Set<string>();
  const words: Lexicon['words'] = [];
  for (const t of terms) for (const w of wordsOf(t)) if (!seen.has(w) && !STOP.has(w)) { seen.add(w); words.push({ word: w, key: phoneticKey(w) }); }
  for (const w of DOMAIN_WORDS) if (!seen.has(w)) { seen.add(w); words.push({ word: w, key: phoneticKey(w) }); }
  return { terms, words, domain: DOMAIN_SET };
}

/** how close a spoken token is to anything in the lexicon (0…1) */
export function lexMatch(token: string, lex: Lexicon): { sim: number; word: string | null } {
  const key = phoneticKey(token);
  let best = 0, word: string | null = null;
  for (const w of lex.words) {
    if (Math.abs(w.key.length - key.length) > 3) continue;
    const s = key === w.key ? 1 : 1 - levDist(key, w.key) / Math.max(key.length, w.key.length);
    if (s > best) { best = s; word = w.word; if (s === 1) break; }
  }
  return { sim: best, word };
}
function levDist(a: string, b: string): number {
  return Math.round((1 - phoneticSim(a, b)) * Math.max(phoneticKey(a).length, phoneticKey(b).length));
}

export type Rescored = { text: string; raw: string; index: number; score: number };

/**
 * Picks the variant that best matches what the person has and says (0.55 · recogniser confidence + 0.45 · lexicon match)
 * and fixes tokens that are one step from a known word («мидитацию» → «медитацию»). The raw variant is kept.
 */
export function rescore(alts: Hypothesis[], lex: Lexicon): Rescored | null {
  if (!alts.length) return null;
  let best: Rescored | null = null;
  alts.forEach((a, i) => {
    const toks = wordsOf(a.text).filter((w) => !STOP.has(w));
    const asr = a.confidence ?? 1 / (1 + i);
    const lx = toks.length ? toks.reduce((s, t) => s + lexMatch(t, lex).sim, 0) / toks.length : 0;
    const score = 0.55 * asr + 0.45 * lx;
    if (!best || score > best.score + 1e-9) best = { text: a.text, raw: a.text, index: i, score };
  });
  const chosen = best!;
  // correct tokens: a known word of the person's, not a command word, similar by ≥ 0.85
  const fixed = chosen.text.split(/(\s+)/).map((tok) => {
    const low = tok.toLowerCase().replace(/ё/g, 'е');
    if (low.length < 4 || STOP.has(low) || lex.domain.has(low)) return tok;
    const m = lexMatch(low, lex);
    if (m.word && m.word !== low && m.sim >= 0.85 && !lex.domain.has(m.word)) return m.word;
    return tok;
  }).join('');
  return { ...chosen, text: fixed };
}
