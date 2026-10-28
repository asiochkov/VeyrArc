/*
 * Text cleaning before parsing (ТЗ 6.5): lower case, ё→е, punctuation out (digits keep their ":" "." "-"), filler words and the
 * assistant's own name removed. Pure: no store, no clock.
 */
const FILLERS = ['это самое', 'в общем', 'так сказать', 'ну вот', 'как бы', 'ну', 'э', 'эм', 'ээ', 'значит', 'типа', 'слушай', 'пожалуйста', 'вот', 'please', 'um', 'uh', 'like'];
const B = '(?<![\\p{L}\\d])';
const E = '(?![\\p{L}\\d])';
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const fillerRe = new RegExp(`${B}(?:${FILLERS.map(esc).join('|')})${E}`, 'gu');
// «короче» at the end is the comparative («сделай встречу короче»); anywhere else it is a filler
const shortlyRe = new RegExp(`${B}короче(?= \\S)`, 'gu');

export function normalize(raw: string, o: { assistantName?: string | null } = {}): string {
  let s = raw.toLowerCase().replace(/ё/g, 'е').replace(/(\p{L})['’](\p{L})/gu, '$1$2');
  // keep a separator that sits between digits (15:30, 05.11, 15-16); everything else that is not a letter or digit is a space
  s = s.replace(/(\d):(?=\d)/g, '$1\u0001').replace(/(\d)\.(?=\d)/g, '$1\u0002').replace(/(\d)-(?=[\d\p{L}])/gu, '$1\u0003');
  s = s.replace(/[^\p{L}\d\u0001\u0002\u0003]+/gu, ' ');
  s = s.replace(/\u0001/g, ':').replace(/\u0002/g, '.').replace(/\u0003/g, '-');
  if (o.assistantName) {
    const n = o.assistantName.toLowerCase().replace(/ё/g, 'е').trim();
    if (n) s = s.replace(new RegExp(`${B}${esc(n)}${E}`, 'gu'), ' ');
  }
  s = s.replace(shortlyRe, ' ').replace(fillerRe, ' ');
  // a polite opening is not part of the command: «а можно завтра в девять поставить встречу»
  return s.replace(/\s+/g, ' ').trim().replace(/^(?:а )?(?:можно|будь добр[а]?|ты не мог(?:ла)? бы|не мог(?:ла)? бы ты|ты мог(?:ла)? бы|мог(?:ла)? бы ты)(?! ли )(?= \S)\s*/u, '');
}

/** letters only, for comparing a phrase with names (similarity) */
export const words = (s: string): string[] => normalize(s).split(' ').filter(Boolean);
