import { R, speechOf, toneTail } from '../../src/voice/reply';

// run: npx tsx --import ./tools/unit/css-register.mjs tools/unit/voice-reply.test.ts
let fail = 0, n = 0;
const eq = (a: unknown, b: unknown, m: string) => { n++; if (a !== b) { fail++; console.log(`✗ ${m}: got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`); } };
const base = { style: 'normal' as const, speakLists: false, muted: false };
const r = R.answer('Сегодня 3 дела. Первое — созвон в 15:00.', { list: ['созвон', 'зал', 'ужин'] });
eq(speechOf(r, 'ru', base), 'Сегодня 3 дела. Первое, созвон в 15 часов.', 'normal speech, list not read');
eq(speechOf(r, 'ru', { ...base, style: 'brief' }), 'Сегодня 3 дела.', 'brief: the first sentence');
eq(speechOf(r, 'ru', { ...base, style: 'detailed', speakLists: true }), 'Сегодня 3 дела. Первое, созвон в 15 часов. созвон, зал, ужин.', 'detailed with lists');
eq(speechOf(r, 'ru', { ...base, muted: true }), null, 'muted says nothing');
eq(speechOf(R.done('Готово', { speech: null }), 'ru', base), null, 'a reply with no speech');
eq(R.done('Отметил «Зарядка»').speech, 'Отметил «Зарядка»', 'speech defaults to the screen text before normalisation');
eq(R.error('Не вышло').ok, false, 'errors are not ok');
eq(toneTail('ru', 'soft') !== '' && toneTail('ru', 'strict') === '' && toneTail('ru', 'neutral') === '', true, 'soft tone only');
const long = R.answer('Предложение. '.repeat(40));
eq(speechOf(long, 'ru', base)!.length <= 220, true, 'never more than 220 characters');
console.log(fail ? `${fail} failed of ${n}` : `all ${n} passed`);
if (fail) process.exit(1);
