import type { Ctx, Slots } from '../engine';
import { isoDay } from '../../dates';

export const num = (s: string | undefined) => (s === undefined ? undefined : Number(s.replace(',', '.')));
export const addDay = (now: Date, n: number) => isoDay(new Date(now.getFullYear(), now.getMonth(), now.getDate() + n));
export const today = (c: Ctx) => addDay(c.env.now, 0);
export const tidy = (s: string | undefined) => (s ?? '').replace(/\s+/g, ' ').trim();
/** words that open a question or ask for advice: a write is never made from them */
export const QUESTION = /‹(?:как|какой|какая|какое|какие|где|когда|сколько|кто|почему|зачем|ли|посоветуй|подскажи|что делать|что мне|стоит ли|можно ли|нужно ли)›/u;
/** the first word is an imperative: «позвони маме» is a command to a phone, not a task */
export const IMPERATIVE = /^(?:\p{L}+(?:йте|ите|ай|яй|уй)|позвони|включи|открой|поставь|сделай|покажи|найди|скажи|расскажи|принеси|отправь|закажи|вызови|запусти|выключи|построй|спой|дай|посоветуй|подскажи)$/u;
export const PRON = /‹(?:я|мне|мы|ты|меня|тебе|был|была|было|были|стал|стала|буду|будет|будем)›/u;
const E = (s: string) => s.replace(/‹/g, '(?<![\\p{L}\\d])').replace(/›/g, '(?![\\p{L}\\d])');
export const has = (re: RegExp, s: string) => new RegExp(E(re.source), 'u').test(s);
export { E as edges };
/** entity lookup with a score: 0.9 · (0.75 + 0.25 · similarity), or low when nothing matches */
export function withEntity(c: Ctx, kind: 'habit' | 'task' | 'goal' | 'quit', query: string, base = 0.9): Slots {
  const e = c[kind](query);
  // a bare past-tense verb («позанимался») names no habit yet: the executor asks which one
  const verb = !e && kind === 'habit' && /^(?:по|вы|про|с)?\p{L}+(?:лся|лась|ла|л)$/u.test(tidy(query));
  return { query: tidy(query), id: e?.id, _score: e ? Math.min(0.97, base * (0.75 + 0.25 * e.sim)) : verb ? 0.86 : 0.3 };
}
