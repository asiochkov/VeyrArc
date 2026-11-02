import { speechText } from '../../src/voice/speechText';

// run: npx tsx tools/unit/voice-speechtext.test.ts
let fail = 0;
const check = (name: string, got: string, want: string) => { if (got !== want) { fail++; console.log('✗', name, '\n  got: ', JSON.stringify(got), '\n  want:', JSON.stringify(want)); } };

// §6.11.4 plural forms
check('5 мин', speechText('Фокус 5 мин', 'ru'), 'Фокус 5 минут');
check('1 мин', speechText('Фокус 1 мин', 'ru'), 'Фокус 1 минуту');
check('2 мин', speechText('Фокус 2 мин', 'ru'), 'Фокус 2 минуты');
check('11 мин (teen exception)', speechText('Фокус 11 мин', 'ru'), 'Фокус 11 минут');
check('1 ч', speechText('Фокус 1 ч', 'ru'), 'Фокус 1 час');
check('2 ч', speechText('Фокус 2 ч', 'ru'), 'Фокус 2 часа');
check('5 ч', speechText('Фокус 5 ч', 'ru'), 'Фокус 5 часов');
check('km', speechText('5 км', 'ru'), '5 километров');
check('kg', speechText('3 кг', 'ru'), '3 килограммов');
check('percent one', speechText('1%', 'ru'), '1 процент');
check('percent few', speechText('3%', 'ru'), '3 процента');
check('percent many', speechText('10%', 'ru'), '10 процентов');

// times
check('HH:00 → "HH часов" with correct form', speechText('в 17:00', 'ru'), 'в 17 часов');
check('HH:00 one', speechText('в 1:00', 'ru'), 'в 1 час');
check('HH:MM, MM<10 → "ноль M"', speechText('в 15:05', 'ru'), 'в 15 ноль 5');
check('HH:MM, MM>=10', speechText('в 15:30', 'ru'), 'в 15 30');

// brand terms
check('Core → кор', speechText('Core привычка', 'ru'), 'кор привычка');
check('Extra → экстра', speechText('Extra привычка', 'ru'), 'экстра привычка');
check('Pro → про', speechText('VeyrArc Pro', 'ru'), 'Вейр-арк про');

// ISO dates never spoken
check('ISO date stripped', speechText('перенёс на 2026-11-05', 'ru'), 'перенёс на');

// symbols/quotes
check('symbols stripped', speechText('Отметил «Зарядка» ✓', 'ru'), 'Отметил Зарядка');
check('dash → comma', speechText('Готово — дальше', 'ru'), 'Готово, дальше');

// 220-char truncation, whole sentences only
const long = 'Первое предложение тут. ' + 'Второе предложение длинное и подробное, чтобы перевалить порог. '.repeat(3) + 'Последнее.';
const truncated = speechText(long, 'ru');
check('truncation adds the screen pointer', truncated.endsWith('Подробности на экране.'), true as unknown as string);
check('truncation stays within budget', truncated.length <= 220 + 'Подробности на экране.'.length + 1, true as unknown as string);
check('short text is untouched (no pointer)', speechText('Коротко.', 'ru').includes('Подробности'), false as unknown as string);

// EN: no RU-specific reformatting, but symbols/quotes/ISO dates still handled
check('EN leaves times/plurals alone', speechText('Focus 5 min at 17:00', 'en'), 'Focus 5 min at 17:00');
check('EN strips symbols', speechText('Marked "Workout" ✓', 'en'), 'Marked Workout');
check('EN strips ISO dates', speechText('moved to 2026-11-05', 'en'), 'moved to');

console.log(fail ? `${fail} failed` : 'all speechText checks passed');
if (fail) process.exit(1);
