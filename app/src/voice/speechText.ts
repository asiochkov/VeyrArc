/*
 * §6.11.4 speechText(text, lang): the reply shown on screen and the reply spoken aloud are not the
 * same string — screen text keeps "·"/quotes/ISO dates, speech needs them translated or dropped so
 * the synthesizer doesn't read punctuation literally or mangle plural forms. Pure and DOM-free so
 * it's testable the same way nlu.ts is (tools/unit/voice-speechtext.test.ts).
 */

/** classic RU 1/2-4/5+ plural selection, with the 11-14 "many" exception */
function ruForm(n: number, [one, few, many]: [string, string, string]): string {
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 14) return many;
  const mod10 = n % 10;
  if (mod10 === 1) return one;
  if (mod10 >= 2 && mod10 <= 4) return few;
  return many;
}

const SYMBOLS = /[✓○·•→←↑↓✦…]/g;
const QUOTES = /[«»„“”"]/g;

function speechTextRu(raw: string): string {
  let s = raw.replace(SYMBOLS, '').replace(QUOTES, '').replace(/—/g, ',');
  s = s.replace(/(\d+)\s*мин\.?(?![а-я])/gi, (_, n) => `${n} ${ruForm(Number(n), ['минуту', 'минуты', 'минут'])}`);
  s = s.replace(/(\d+)\s*ч\.?(?![а-я])/gi, (_, n) => `${n} ${ruForm(Number(n), ['час', 'часа', 'часов'])}`);
  // \b doesn't work after a Cyrillic letter — \w is ASCII-only, so a word boundary never forms
  // between two non-\w characters (the same pitfall nlu.ts's L/R helpers exist to avoid)
  s = s.replace(/(\d+)\s*км(?![а-я])/gi, (_, n) => `${n} километров`);
  s = s.replace(/(\d+)\s*кг(?![а-я])/gi, (_, n) => `${n} килограммов`);
  s = s.replace(/(\d+)\s*%/g, (_, n) => `${n} ${ruForm(Number(n), ['процент', 'процента', 'процентов'])}`);
  // times: HH:00 → "HH часов" (correct form); HH:MM → "HH MM" ("ноль M" when MM < 10, so the
  // synthesizer doesn't drop the leading zero and read "15:05" as "fifteen five")
  s = s.replace(/\b([01]?\d|2[0-3]):([0-5]\d)\b/g, (_, h: string, m: string) => {
    const hn = Number(h);
    if (m === '00') return `${hn} ${ruForm(hn, ['час', 'часа', 'часов'])}`;
    return `${hn} ${m[0] === '0' ? `ноль ${Number(m)}` : m}`;
  });
  s = s.replace(/\bCore\b/gi, 'кор').replace(/\bExtra\b/gi, 'экстра').replace(/\bPro\b/gi, 'про').replace(/\bVeyrArc\b/gi, 'Вейр-арк');
  s = s.replace(/\b\d{4}-\d{2}-\d{2}\b/g, ''); // ISO dates are never spoken — replies always phrase dates in words
  return s.replace(/[ \t]+/g, ' ').replace(/\s+([,.])/g, '$1').trim();
}

function speechTextEn(raw: string): string {
  // EN TTS engines handle digits/times natively well enough that the RU-specific declension and
  // HH:MM reformatting isn't needed — just the symbol/quote/brand cleanup that applies either way.
  let s = raw.replace(SYMBOLS, '').replace(QUOTES, '').replace(/—/g, ',');
  s = s.replace(/\bVeyrArc\b/g, 'VeyrArc'); // left as-is; EN doesn't need a phonetic respelling
  s = s.replace(/\b\d{4}-\d{2}-\d{2}\b/g, '');
  return s.replace(/[ \t]+/g, ' ').trim();
}

const MAX_SPEECH_CHARS = 220;

/** too-long replies are cut to whole sentences within the budget, with a pointer to the screen */
function truncateForSpeech(text: string, ru: boolean): string {
  if (text.length <= MAX_SPEECH_CHARS) return text;
  const sentences = text.split(/(?<=[.!?])\s+/);
  let out = '';
  for (const s of sentences) {
    const next = out ? `${out} ${s}` : s;
    if (next.length > MAX_SPEECH_CHARS) break;
    out = next;
  }
  if (!out) out = text.slice(0, MAX_SPEECH_CHARS);
  return `${out} ${ru ? 'Подробности на экране.' : 'More details on screen.'}`;
}

export function speechText(text: string, lang: 'ru' | 'en'): string {
  const normalized = lang === 'ru' ? speechTextRu(text) : speechTextEn(text);
  return truncateForSpeech(normalized, lang === 'ru');
}
