import { normalize } from '../nlp/normalize';
import { wordsToDigits } from '../nlp/itn';
import { wordsToDigitsEn } from '../nlp/itnEn';

/* What an answer to a question may be (ТЗ 6.8.7). An answer is read as the value of the slot, not as a new command. */
export type YesNo = 'yes' | 'no' | 'later' | 'skip';
const YES = /^(?:да|ага|угу|конечно|давай|ок|окей|верно|точно|правильно|подтверждаю|хорошо|ладно|yes|yeah|yep|sure|ok|okay|confirm)(?: .*)?$/;
const NO = /^(?:нет|не надо|не нужно|отмена|отмени|не|no|nope|cancel|stop)(?: .*)?$/;
const LATER = /^(?:позже|потом|пока нет|later|not now)$/;
const SKIP = /^(?:пропусти|пропустить|дальше|skip|next)$/;

export function yesno(text: string): YesNo | null {
  const t = normalize(text);
  if (SKIP.test(t)) return 'skip';
  if (LATER.test(t)) return 'later';
  if (NO.test(t)) return 'no';
  if (YES.test(t)) return 'yes';
  return null;
}
export const cancels = (text: string) => /^(?:стоп|хватит|отмена|отмени|не надо|не нужно|cancel|stop|enough)$/.test(normalize(text));

const digits = (text: string) => wordsToDigitsEn(wordsToDigits(normalize(text)));
export function number(text: string): number | null {
  const m = digits(text).match(/\d+(?:[.,]\d+)?/);
  return m ? Number(m[0].replace(',', '.')) : null;
}
const MOODW: [RegExp, number][] = [[/ужасн|паршив|отвратительн|terrible|awful/, 1], [/плох|так себе|грустн|bad|sad/, 2], [/нормальн|ничего|okay|ok$|so so/, 3], [/хорош|good|fine/, 4], [/отличн|супер|great|awesome/, 5]];
export function mood(text: string): number | null {
  const n = number(text);
  if (n && n >= 1 && n <= 5) return n;
  const t = normalize(text);
  for (const [re, v] of MOODW) if (re.test(t)) return v;
  return null;
}
const ORD: [RegExp, number][] = [[/^(?:перв|1$|один|one|first)/, 0], [/^(?:втор|2$|два|two|second)/, 1], [/^(?:трет|3$|три|three|third)/, 2], [/^(?:четв[её]рт|4$|четыре|four|fourth)/, 3], [/^(?:пят|5$|five|fifth)/, 4]];
/** «вторую» → 1, «последнюю» → n−1 */
export function ordinal(text: string, n: number): number | null {
  const t = normalize(text).replace(/^(?:на |the |number )/, '');
  if (/^(?:последн|last)/.test(t) && n) return n - 1;
  for (const [re, i] of ORD) if (re.test(t) && i < n) return i;
  return null;
}
