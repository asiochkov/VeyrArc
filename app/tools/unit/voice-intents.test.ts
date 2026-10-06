import { matchScore, parseCommand } from '../../src/voice/intents';

// run: npx tsx tools/unit/voice-intents.test.ts
const now = new Date('2026-10-06T10:00:00'); // вторник
const cases: [string, unknown][] = [
  ['Настроение 4', { kind: 'mood', level: 3 }],
  ['настроение отличное', { kind: 'mood', level: 4 }],
  ['mood 8', { kind: 'mood', level: 3 }],
  ['настроение пять', { kind: 'mood', level: 4 }],
  ['Сделал зарядку', { kind: 'habit', query: 'зарядку', undo: false }],
  ['выполнил привычку медитация', { kind: 'habit', query: 'медитация', undo: false }],
  ['сними отметку с чтения', { kind: 'habit', query: 'чтения', undo: true }],
  ['Задача позвонить маме завтра в 15:30', { kind: 'task', title: 'Позвонить маме', day: '2026-10-07', time: '15:30' }],
  ['напомни купить молоко', { kind: 'task', title: 'Купить молоко', day: '2026-10-06', time: null }],
  ['добавь задачу тренировка в пятницу в 7 вечера', { kind: 'task', title: 'Тренировка', day: '2026-10-09', time: '19:00' }],
  ['запусти фокус на двадцать пять минут', { kind: 'focus', minutes: 25 }],
  ['фокус', { kind: 'focus', minutes: null }],
  ['какая погода', { kind: 'unknown', text: 'какая погода' }],
];
let fail = 0;
for (const [input, want] of cases) {
  const got = parseCommand(input, now);
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fail++;
  console.log(ok ? '✓' : '✗', input, ok ? '' : `→ ${JSON.stringify(got)} (want ${JSON.stringify(want)})`);
}
const ms: [string, string, boolean][] = [['зарядку', 'Зарядка', true], ['воду', 'Вода 8 стаканов', true], ['чтения', 'Чтение 20 мин', true], ['медитацию', 'Холодный душ', false]];
for (const [q, n, want] of ms) { const ok = (matchScore(q, n) > 0) === want; if (!ok) fail++; console.log(ok ? '✓' : '✗', 'match', q, '~', n, matchScore(q, n)); }
if (fail) { console.error(fail + ' failed'); process.exit(1); }
