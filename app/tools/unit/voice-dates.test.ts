import { normalize } from '../../src/voice/nlp/normalize';
import { wordsToDigits } from '../../src/voice/nlp/itn';
import { takeDate, takeDuration, takeTime } from '../../src/voice/nlp/dates';

// run: npx tsx tools/unit/voice-dates.test.ts — every row of the tables in ТЗ 6.5 (now = Wed 28.10.2026 15:00)
const now = new Date(2026, 9, 28, 15, 0);
let fail = 0, n = 0;
const eq = (got: unknown, want: unknown, m: string) => { n++; if (JSON.stringify(got) !== JSON.stringify(want)) { fail++; console.log('✗', m, '→', JSON.stringify(got), 'want', JSON.stringify(want)); } };
const prep = (p: string) => wordsToDigits(normalize(p));

// 6.5.1 numbers and filler words
const NUMS: [string, string][] = [
  ['двадцать пять', '25'], ['сто двадцать', '120'], ['восемь тысяч', '8000'], ['две с половиной тысячи', '2500'], ['полторы тысячи', '1500'],
  ['пару часов', '2 часов'], ['пару минут', '2 минут'], ['пару стаканов', '2 стаканов'], ['полчаса', '30 минут'], ['полтора часа', '90 минут'], ['десяток', '10'],
  ['ну э эм короче значит типа слушай пожалуйста вот как бы выпил воды', 'выпил воды'], ['триста сорок два', '342'], ['тысяча двести', '1200'], ['сорок', '40'],
];
for (const [a, b] of NUMS) eq(prep(a), b, 'num: ' + a);
eq(normalize('Сфера, отметь зарядку', { assistantName: 'Сфера' }), 'отметь зарядку', 'assistant name removed');
eq(normalize('Сделал ЗАРЯДКУ!!! ёж'), 'сделал зарядку еж', 'case, ё, punctuation');
eq(normalize('в 15:30, 05.11'), 'в 15:30 05.11', 'digit separators survive');

// 6.5.2 time
const T = (p: string) => { const h = takeTime(prep(p), now); return h ? (h.end ? `${h.time}–${h.end}` : h.time) : null; };
const TIMES: [string, string][] = [
  ['в 15', '15:00'], ['в 15:30', '15:30'], ['в 15 30', '15:30'], ['в пятнадцать тридцать', '15:30'], ['в девять ноль ноль', '09:00'],
  ['в 5', '17:00'], ['в 9 утра', '09:00'], ['в 9 вечера', '21:00'], ['в двенадцать ночи', '00:00'], ['в полночь', '00:00'],
  ['в полдень', '12:00'], ['в обед', '12:00'], ['в половине пятого', '16:30'], ['в половине девятого утра', '08:30'], ['в половине седьмого вечера', '18:30'],
  ['в четверть пятого', '16:15'], ['без четверти восемь вечера', '19:45'], ['без пятнадцати шесть', '17:45'], ['без десяти семь вечера', '18:50'],
  ['без пяти девять', '08:55'], ['в пять с половиной', '17:30'], ['десять минут шестого', '17:10'],
  ['утром', '09:00'], ['днём', '14:00'], ['вечером', '19:00'], ['ночью', '22:00'],
  ['через пару часов', '17:00'], ['через полтора часа', '16:30'], ['через сорок минут', '15:40'], ['через час', '16:00'], ['через полчаса', '15:30'],
  ['с 15 до 16', '15:00–16:00'], ['с девяти до одиннадцати', '09:00–11:00'],
];
for (const [a, b] of TIMES) eq(T(a), b, 'time: ' + a);
eq(takeTime(prep('через двенадцать часов'), now)?.date, '2026-10-29', 'relative time past midnight carries the date');
eq(takeTime(prep('напомни позвонить маме в 15'), now)?.rest, 'напомни позвонить маме', 'rest without the time');
eq(takeTime(prep('просто текст'), now), null, 'no time');

// durations
const D = (p: string) => takeDuration(prep(p))?.minutes ?? null;
for (const [a, b] of [['на час', 60], ['на полчаса', 30], ['на полтора часа', 90], ['на два с половиной часа', 150], ['на пару часов', 120], ['на 45 минут', 45]] as [string, number][]) eq(D(a), b, 'duration: ' + a);

// 6.5.3 dates
const dd = (p: string) => takeDate(prep(p), now)?.date ?? null;
const DATES: [string, string][] = [
  ['сегодня', '2026-10-28'], ['завтра', '2026-10-29'], ['послезавтра', '2026-10-30'],
  ['через три дня', '2026-10-31'], ['через неделю', '2026-11-04'], ['через две недели', '2026-11-11'], ['через месяц', '2026-11-28'],
  ['в пятницу', '2026-10-30'], ['в среду', '2026-11-04'], ['в следующую пятницу', '2026-11-06'],
  ['на следующей неделе', '2026-11-02'], ['на выходных', '2026-10-31'], ['в конце недели', '2026-10-30'],
  ['в начале месяца', '2026-11-01'], ['в конце месяца', '2026-10-31'], ['в середине месяца', '2026-11-15'],
  ['пятого ноября', '2026-11-05'], ['5 ноября', '2026-11-05'], ['05.11', '2026-11-05'], ['двадцать девятого', '2026-10-29'],
  ['25 декабря', '2026-12-25'], ['первого января', '2027-01-01'], ['до пятницы', '2026-10-30'], ['к пятнице', '2026-10-30'],
  ['через 365 дней', '2027-10-28'],
];
for (const [a, b] of DATES) eq(dd(a), b, 'date: ' + a);
eq(takeDate(prep('через 400 дней'), now), null, 'N over 365 is refused');
eq(takeDate(prep('двадцать восьмого'), now)?.date, '2026-10-28', 'the day number of today is today');
eq(takeDate(prep('купить хлеб завтра'), now)?.rest, 'купить хлеб', 'rest without the date');
// edge: last day of the month → end of the next
eq(takeDate('в конце месяца', new Date(2026, 9, 31, 9))?.date, '2026-11-30', 'last day: next month end');
// on a Sunday «на выходных» is today
eq(takeDate('на выходных', new Date(2026, 10, 1, 9))?.date, '2026-11-01', 'Sunday: weekend is today');

console.log(fail ? `${fail} failed of ${n}` : `all ${n} passed`);
if (fail) process.exit(1);
