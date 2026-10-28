import { levenshtein, phoneticKey } from '../phonetic';

/*
 * Just enough Russian morphology for matching the person's words (ТЗ 6.4/6.6): the case forms of a noun («зарядка» →
 * «зарядку», «зарядки», «зарядке»), a crude stem, and the verb → noun pairs that habits use («медитировал» → «медитация»).
 * English gets the plain plural / -ing forms. Not linguistics: every table here exists because a phrase needed it.
 */
/** [pattern, letters to cut to get the stem, case endings] */
const ENDINGS: [RegExp, number, string[]][] = [
  [/ый$/, 2, ['ый', 'ого', 'ому', 'ым', 'ом', 'ая', 'ую', 'ой', 'ое', 'ые', 'ых', 'ыми']],
  [/ое$/, 2, ['ое', 'ого', 'ому', 'ым', 'ом', 'ая', 'ую', 'ой', 'ые', 'ых']],
  [/ий$/, 2, ['ий', 'ого', 'ему', 'его', 'им', 'ом', 'ая', 'ую', 'ой', 'ое', 'ие', 'их', 'ими']],
  [/ия$/, 2, ['ия', 'ии', 'ию', 'ией']],
  [/ие$/, 2, ['ие', 'ия', 'ии', 'ию', 'ием']],
  [/а$/, 1, ['а', 'у', 'ы', 'е', 'ой', 'и']],
  [/я$/, 1, ['я', 'ю', 'и', 'е', 'ей']],
  [/ь$/, 1, ['ь', 'и', 'я', 'ю', 'ью']],
  [/й$/, 1, ['й', 'я', 'ю', 'ем', 'е']],
  [/о$/, 1, ['о', 'а', 'у', 'ом', 'е']],
  [/е$/, 1, ['е', 'я', 'ю', 'ем']],
  [/[бвгджзклмнпрстфхцчшщ]$/, 0, ['', 'а', 'у', 'ом', 'е', 'ы', 'ов']],
];
export function forms(word: string): string[] {
  for (const [re, cutN, ends] of ENDINGS) if (re.test(word)) {
    const st = word.slice(0, word.length - cutN);
    return [...new Set(ends.map((e) => st + e))];
  }
  return [word];
}

/** the part of a word that stays the same through its cases */
export function stem(w: string): string {
  let s = w.toLowerCase().replace(/ё/g, 'е');
  if (/^[a-z]+$/.test(s)) return s.replace(/(?:ing|ed|es|s)$/, '').replace(/(.)\1$/, '$1');
  if (s.length <= 4) return s.length === 4 && /[ауыиоюея]$/.test(s) ? s.slice(0, 3) : s;
  s = s.replace(/(?:иями|ями|ами|ого|его|ому|ему|ыми|ими|ией|ает|ует|ешь|ишь|ать|ять|еть|ить|оть|ул[аи]?|ал[аи]?|ил[аи]?|ел[аи]?|ол[аи]?|ся|ия|ие|ии|ию|ий|ой|ей|ым|им|ом|ем|ов|ев|ам|ям|ах|ях|ую|юю|ая|яя|ое|ее|ые|ие|ых|их|ка|ку|ки|ке|а|у|ы|е|и|о|ю|я|ь|й|л)$/, '');
  return s.length >= 3 ? s : w;
}

/** verb stem → noun stem, for «медитировал» ≈ «Медитация» */
const VERB_NOUN: [string, string][] = [
  ['медитир', 'медитац'], ['тренир', 'тренировк'], ['зарядк', 'зарядк'], ['читал', 'чтен'], ['чита', 'чтен'], ['бега', 'бег'], ['медит', 'медит'], ['кур', 'курен'], ['сладк', 'сладк'], ['пью', 'алкогол'], ['пить', 'алкогол'], ['почитал', 'чтен'], ['прочитал', 'чтен'], ['бегал', 'бег'], ['побегал', 'бег'], ['пробежал', 'бег'],
  ['плавал', 'плаван'], ['поплавал', 'плаван'], ['занимал', 'занят'], ['позанимал', 'занят'], ['учил', 'учеб'], ['выучил', 'учеб'], ['гулял', 'прогулк'], ['погулял', 'прогулк'], ['прогулял', 'прогулк'],
  ['отжал', 'отжиман'], ['отжимал', 'отжиман'], ['растягивал', 'растяжк'], ['растянул', 'растяжк'], ['спал', 'сон'], ['выспал', 'сон'], ['пил', 'вод'], ['выпил', 'вод'], ['писал', 'письм'], ['записал', 'дневник'],
  ['ходил', 'ходьб'], ['сходил', 'зал'], ['зал', 'тренировк'], ['качал', 'тренировк'], ['рисовал', 'рисован'], ['нарисовал', 'рисован'], ['готовил', 'готовк'], ['приготовил', 'готовк'], ['убирал', 'уборк'], ['убрал', 'уборк'], ['прибрал', 'уборк'],
  ['workout', 'workout'], ['worked', 'workout'], ['exercis', 'workout'], ['jogged', 'run'], ['studied', 'spanish'], ['exercis', 'exercis'], ['meditat', 'meditat'], ['read', 'read'], ['ran', 'run'], ['run', 'run'], ['stretch', 'stretch'], ['walk', 'walk'],
];
const norm = (w: string) => w.toLowerCase().replace(/ё/g, 'е');

/** 0…1: how well one spoken word matches a name's word */
export function wordSim(spoken: string, name: string): number {
  const a = norm(spoken), b = norm(name);
  if (a === b) return 1;
  const sa = stem(a), sb = stem(b);
  if (sa === sb && sa.length >= 3) return 0.97;
  for (const [v, n] of VERB_NOUN) if ((a.includes(v) || sa.includes(v)) && (sb.startsWith(n) || b.startsWith(n))) return 0.93;
  const ka = phoneticKey(a), kb = phoneticKey(b);
  const m = Math.max(ka.length, kb.length);
  const ph = m ? 1 - levenshtein(ka, kb) / m : 0;
  const m2 = Math.max(sa.length, sb.length);
  const st = m2 ? 1 - levenshtein(sa, sb) / m2 : 0;
  // a shared start of ≥ 5 letters is a strong hint («тренеровку»/«тренировка»)
  let common = 0;
  while (common < Math.min(a.length, b.length) && a[common] === b[common]) common++;
  const pre = common >= 5 ? 0.78 : 0;
  return Math.max(ph * 0.95, st * 0.95, pre);
}
