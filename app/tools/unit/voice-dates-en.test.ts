import { normalize } from '../../src/voice/nlp/normalize';
import { wordsToDigitsEn } from '../../src/voice/nlp/itnEn';
import { takeDateEn, takeDurationEn, takeTimeEn } from '../../src/voice/nlp/datesEn';

// run: npx tsx tools/unit/voice-dates-en.test.ts — English counterpart of the 6.5 tables (now = Wed 28.10.2026 15:00)
const now = new Date(2026, 9, 28, 15, 0);
let fail = 0, n = 0;
const eq = (got: unknown, want: unknown, m: string) => { n++; if (JSON.stringify(got) !== JSON.stringify(want)) { fail++; console.log('✗', m, '→', JSON.stringify(got), 'want', JSON.stringify(want)); } };
const prep = (p: string) => wordsToDigitsEn(normalize(p));

for (const [a, b] of [['twenty five', '25'], ['one hundred twenty', '120'], ['eight thousand', '8000'], ['a couple of hours', '2 hours'], ['half an hour', '30 minutes'], ['two and a half hours', '150 minutes'], ['fifth', '5th'], ['twenty ninth', '29th'], ['fifteen', '15']] as [string, string][]) eq(prep(a), b, 'num: ' + a);

const T = (p: string) => { const h = takeTimeEn(prep(p), now); return h ? (h.end ? `${h.time}–${h.end}` : h.time) : null; };
for (const [a, b] of [
  ['at 6 pm', '18:00'], ['at 6:30 pm', '18:30'], ['at 5', '17:00'], ['at 9 am', '09:00'], ['at 15', '15:00'], ['at 15:30', '15:30'], ['at noon', '12:00'], ['at midnight', '00:00'],
  ['at half past five', '17:30'], ['at quarter past five', '17:15'], ['at quarter to six', '17:45'], ['at ten to seven', '18:50'], ['in the morning', '09:00'], ['in the evening', '19:00'],
  ['in two hours', '17:00'], ['in half an hour', '15:30'], ['in 40 minutes', '15:40'], ['in an hour', '16:00'], ['from 3 to 4 pm', '15:00–16:00'],
] as [string, string][]) eq(T(a), b, 'time: ' + a);
const D = (p: string) => takeDurationEn(prep(p))?.minutes ?? null;
for (const [a, b] of [['for an hour', 60], ['for half an hour', 30], ['for ninety minutes', 90], ['for two and a half hours', 150]] as [string, number][]) eq(D(a), b, 'duration: ' + a);
const dd = (p: string) => takeDateEn(prep(p), now)?.date ?? null;
for (const [a, b] of [
  ['today', '2026-10-28'], ['tomorrow', '2026-10-29'], ['day after tomorrow', '2026-10-30'], ['yesterday', '2026-10-27'], ['in three days', '2026-10-31'], ['in two weeks', '2026-11-11'], ['in a month', '2026-11-28'],
  ['on friday', '2026-10-30'], ['on wednesday', '2026-11-04'], ['next friday', '2026-11-06'], ['next week', '2026-11-02'], ['on the weekend', '2026-10-31'], ['at the end of the week', '2026-10-30'],
  ['at the end of the month', '2026-10-31'], ['at the beginning of the month', '2026-11-01'], ['in the middle of the month', '2026-11-15'],
  ['november 5th', '2026-11-05'], ['the fifth of november', '2026-11-05'], ['25 december', '2026-12-25'], ['january first', '2027-01-01'], ['by friday', '2026-10-30'],
] as [string, string][]) eq(dd(a), b, 'date: ' + a);
eq(takeTimeEn(prep('drink 2 glasses'), now), null, 'a bare number is not a time');
console.log(fail ? `${fail} failed of ${n}` : `all ${n} passed`);
if (fail) process.exit(1);
