import type { Lang } from '../stt/types';

/*
 * What can be said aloud from a text written for the eye (ТЗ 6.11.4): no marks, no quotes, numbers with their words in the
 * right form, the app's English words made pronounceable, no ISO dates, and never more than 220 characters
 * («… Подробности на экране.»).
 */
const MAX = 220;
const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/gu;

export function plural(n: number, one: string, few: string, many: string) {
  const m10 = n % 10, m100 = n % 100;
  return m10 === 1 && m100 !== 11 ? one : m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14) ? few : many;
}
const ruUnit = (n: number, one: string, few: string, many: string) => `${n} ${plural(n, one, few, many)}`;
const enUnit = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export function speechText(text: string, lang: Lang, max = MAX): string {
  let s = text
    .replace(/\b\d{4}-\d{2}-\d{2}\b/g, '') // ISO dates are never read out
    .replace(EMOJI, '')
    .replace(/[✓○·•→←↑↓✦…]/g, ' ')
    .replace(/[«»„“”"]/g, '')
    .replace(/\s[—–]\s/g, ', ');
  s = s.replace(/\bVeyrArc\b/g, lang === 'ru' ? 'Вейр-арк' : 'Vayr Arc').replace(/\bCore\b/g, lang === 'ru' ? 'кор' : 'core').replace(/\bExtra\b/g, lang === 'ru' ? 'экстра' : 'extra').replace(/\bPro\b/g, lang === 'ru' ? 'про' : 'pro');
  if (lang === 'ru') {
    s = s
      .replace(/(\d+)\s*мин(?![\p{L}])\.?/gu, (_, n) => ruUnit(+n, 'минуту', 'минуты', 'минут'))
      .replace(/(\d+)\s*ч(?![\p{L}])\.?/gu, (_, n) => ruUnit(+n, 'час', 'часа', 'часов'))
      .replace(/(\d+)\s*км(?![\p{L}])/gu, (_, n) => ruUnit(+n, 'километр', 'километра', 'километров'))
      .replace(/(\d+)\s*кг(?![\p{L}])/gu, (_, n) => ruUnit(+n, 'килограмм', 'килограмма', 'килограммов'))
      .replace(/(\d+)\s*%/g, (_, n) => ruUnit(+n, 'процент', 'процента', 'процентов'))
      .replace(/\b(\d{1,2}):00\b/g, (_, h) => ruUnit(+h, 'час', 'часа', 'часов'))
      .replace(/\b(\d{1,2}):(\d{2})\b/g, (_, h, m) => `${+h} ${+m < 10 ? 'ноль ' + +m : +m}`);
  } else {
    s = s
      .replace(/(\d+)\s*min\b\.?/g, (_, n) => enUnit(+n, 'minute', 'minutes'))
      .replace(/(\d+)\s*h\b/g, (_, n) => enUnit(+n, 'hour', 'hours'))
      .replace(/(\d+)\s*km\b/g, (_, n) => enUnit(+n, 'kilometer', 'kilometers'))
      .replace(/(\d+)\s*%/g, (_, n) => `${n} percent`)
      .replace(/\b(\d{1,2}):00\b/g, (_, h) => `${+h} o’clock`)
      .replace(/\b(\d{1,2}):(\d{2})\b/g, (_, h, m) => `${+h} ${+m < 10 ? 'oh ' + +m : +m}`);
  }
  s = s.replace(/\s+/g, ' ').replace(/\s+([,.!?])/g, '$1').replace(/,\s*,/g, ',').trim();
  if (s.length <= max) return s;
  const tail = lang === 'ru' ? ' Подробности на экране.' : ' Details on screen.';
  const sentences = s.split(/(?<=[.!?])\s+/);
  let out = '';
  for (const x of sentences) { if ((out + ' ' + x).trim().length + tail.length > max) break; out = (out + ' ' + x).trim(); }
  return (out || s.slice(0, max - tail.length).replace(/\s+\S*$/, '')) + tail;
}
