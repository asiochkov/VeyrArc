import { phoneticKey, phoneticSim } from '../../src/voice/nlp/phonetic';
import { buildLexicon, rescore, lexMatch } from '../../src/voice/nlp/lexicon';

// run: npx tsx tools/unit/voice-lexicon.test.ts — phonetic key, lexicon, rescoring of recogniser variants (ТЗ 6.4)
let fail = 0, n = 0;
const ok = (c: boolean, m: string) => { n++; if (!c) { fail++; console.log('✗', m); } };

ok(phoneticSim('медитация', 'мидитация') >= 0.9, 'медитация ~ мидитация');
ok(phoneticSim('тренировка', 'тренеровка') >= 0.85, 'тренировка ~ тренеровка');
ok(phoneticSim('зарядка', 'зарятка') >= 0.85, 'devoicing: зарядка ~ зарятка');
ok(phoneticSim('вода', 'книга') < 0.5, 'unrelated words stay far');
ok(phoneticKey('meditation').length > 0 && phoneticSim('медитейшн', 'meditation') > 0.5, 'latin is transliterated');

const env = {
  habits: [{ name: 'Медитация' }, { name: 'Зарядка' }, { name: 'Чтение' }],
  tasks: [{ title: 'Позвонить маме' }],
  goals: [{ title: 'Пробежать полумарафон', steps: ['Купить кроссовки'] }],
  quits: [{ name: 'Сахар' }],
  aliases: [{ alias: 'качалка', target: 'Тренировка' }],
  assistantName: 'Сфера',
// eslint-disable-next-line @typescript-eslint/no-explicit-any
} as any;
const lex = buildLexicon(env);

ok(lex.words.some((w) => w.word === 'медитация') && lex.words.some((w) => w.word === 'качалка') && lex.words.some((w) => w.word === 'сфера'), 'own words are in the lexicon');
ok(lex.words.some((w) => w.word === 'отметь'), 'command vocabulary is in the lexicon');
ok(lexMatch('мидитацию', lex).word === 'медитация', 'lexMatch finds the nearest own word');
ok(lexMatch('ксенон', lex).sim < 0.7, 'a stranger word does not match');

let r = rescore([{ text: 'сделал мидитацию', confidence: 0.8 }], lex);
ok(r?.text === 'сделал медитация' || r?.text === 'сделал медитацию' || /медитаци/.test(r?.text ?? ''), 'near-miss is corrected: ' + r?.text);
ok(r?.raw === 'сделал мидитацию', 'raw text is kept');

// the lexicon picks between alternatives when the recogniser is unsure
r = rescore([{ text: 'сделал за рядку', confidence: 0.5 }, { text: 'сделал зарядку', confidence: 0.45 }], lex);
ok(r?.index === 1, 'lexicon match lifts the better variant (index ' + r?.index + ')');

// a confident recogniser is not overridden by a weak lexicon match
r = rescore([{ text: 'отметь воду', confidence: 0.95 }, { text: 'отметь сахар', confidence: 0.2 }], lex);
ok(r?.index === 0, 'confident first variant stays');

// command words are never "corrected" into the person's words
r = rescore([{ text: 'отметь', confidence: 0.9 }], lex);
ok(r?.text === 'отметь', 'command words are left alone');

ok(rescore([], lex) === null, 'no variants → null');

console.log(fail ? `${fail} failed of ${n}` : `all ${n} passed`);
if (fail) process.exit(1);
