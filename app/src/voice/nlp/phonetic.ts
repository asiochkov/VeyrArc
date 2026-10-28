/*
 * A rough phonetic key of a word, so that what a recogniser writes («мидитацию», «тренеровку», «за рядку») lands next to
 * what the person has («медитация», «тренировка», «зарядка»). Russian rules by ТЗ 6.4.2: Latin is transliterated first.
 * Not linguistics — only enough that near-sounding words get a high similarity.
 */
const TRANSLIT: [RegExp, string][] = [
  [/sh/g, 'ш'], [/ch/g, 'ч'], [/th/g, 'т'], [/ph/g, 'ф'], [/oo/g, 'у'], [/ee/g, 'и'], [/ck/g, 'к'], [/qu/g, 'кв'], [/x/g, 'кс'], [/w/g, 'в'], [/y/g, 'й'],
  [/c(?=[eiy])/g, 'с'], [/c/g, 'к'], [/j/g, 'дж'], [/z/g, 'з'], [/h/g, 'х'],
];
const LATIN: Record<string, string> = { a: 'а', b: 'б', d: 'д', e: 'е', f: 'ф', g: 'г', i: 'и', k: 'к', l: 'л', m: 'м', n: 'н', o: 'о', p: 'п', r: 'р', s: 'с', t: 'т', u: 'у', v: 'в' };
const DEVOICE: Record<string, string> = { б: 'п', в: 'ф', г: 'к', д: 'т', ж: 'ш', з: 'с' };
const VOICELESS = 'пфктшсхцчщ';
const REDUCE: Record<string, string> = { о: 'а', е: 'и', я: 'и', ы: 'и', ю: 'у', э: 'и' };

export function phoneticKey(word: string): string {
  let s = word.toLowerCase().replace(/ё/g, 'е');
  if (/[a-z]/.test(s)) { for (const [re, to] of TRANSLIT) s = s.replace(re, to); s = s.replace(/[a-z]/g, (c) => LATIN[c] ?? c); }
  s = s.replace(/[ьъ]/g, '').replace(/ться|тся/g, 'ца');
  // devoicing: at the end of the word and before a voiceless consonant
  s = s.replace(/[бвгджз](?=$|[пфктшсхцчщ])/g, (c) => DEVOICE[c]);
  s = s.replace(/[оеяыюэ]/g, (c) => REDUCE[c]).replace(/тс/g, 'ц');
  void VOICELESS;
  return s.replace(/(.)\1+/g, '$1').replace(/[^а-я0-9]/g, '');
}

export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[b.length];
}
/** 1 − Levenshtein / the longer length, on the phonetic keys */
export function phoneticSim(a: string, b: string): number {
  const ka = phoneticKey(a), kb = phoneticKey(b);
  const m = Math.max(ka.length, kb.length);
  return m === 0 ? 0 : 1 - levenshtein(ka, kb) / m;
}
