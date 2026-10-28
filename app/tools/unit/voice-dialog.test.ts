import { readFileSync } from 'node:fs';
import { handlePhrase } from '../../src/voice/dialog/manager';
import { dialog } from '../../src/voice/dialog/context';
import { register } from '../../src/voice/exec';
import { cancels, mood, number, ordinal, yesno } from '../../src/voice/dialog/grammars';
import { R } from '../../src/voice/reply';
import type { ParseEnv } from '../../src/voice/nlp/types';

// run: npx tsx --import ./tools/unit/css-register.mjs tools/unit/voice-dialog.test.ts — the dialog manager with stub executors (ТЗ 6.8)
let fail = 0, n = 0;
const ok = (c: boolean, m: string) => { n++; if (!c) { fail++; console.log('✗', m); } };
const fx = JSON.parse(readFileSync(new URL('../voice/golden/fixture.json', import.meta.url), 'utf8'));
const env = { ...fx, now: new Date(fx.now) } as ParseEnv;

// grammars
ok(yesno('да') === 'yes' && yesno('ага') === 'yes' && yesno('не надо') === 'no' && yesno('позже') === 'later' && yesno('пропусти') === 'skip' && yesno('купить хлеб') === null, 'yes/no grammar');
ok(number('двадцать пять') === 25 && number('три') === 3 && number('ничего') === null, 'number grammar');
ok(mood('четыре') === 4 && mood('отлично') === 5 && mood('паршиво') === 1, 'mood grammar');
ok(ordinal('вторую', 3) === 1 && ordinal('последнюю', 3) === 2 && ordinal('пятую', 3) === null, 'ordinal grammar');
ok(cancels('хватит') && cancels('стоп') && !cancels('да'), 'cancel words');

// stub executors that record what they were asked
const calls: { kind: string; slots: Record<string, unknown> }[] = [];
register(['task.add', 'plan.day', 'task.move', 'mood.set', 'task.delete', 'habit.done'], (p) => { calls.push({ kind: p.kind, slots: p.slots }); return R.done(`ok ${p.kind}`, { undoable: true, list: ['Созвон 16:00', 'Купить молоко', 'Встреча 19:00'] } as never); });
const last = () => calls[calls.length - 1];

// a missing detail is asked once, then the answer fills it
dialog.reset(); calls.length = 0;
let r = handlePhrase('в пятницу встреча с Димой', 'text', null, env);
ok(r.kind === 'ask' && /время/i.test(r.screen) && (r.choices?.length ?? 0) === 4, 'asks the time with four buttons');
r = handlePhrase('в десять утра', 'text', null, env);
ok(last()?.kind === 'task.add' && last().slots.time === '10:00' && last().slots.day === '2026-10-30', 'the answer fills the slot');
dialog.reset(); calls.length = 0;
handlePhrase('в пятницу встреча с Димой', 'text', null, env);
handlePhrase('без времени', 'text', null, env);
ok(last()?.kind === 'task.add' && last().slots.time === undefined, '«без времени» leaves it empty');
dialog.reset(); calls.length = 0;
handlePhrase('в пятницу встреча с Димой', 'text', null, env);
r = handlePhrase('нет', 'text', null, env);
ok(calls.length === 0 && /отмен/.test(r.screen), '«нет» drops the question');

// the button of a question works too
dialog.reset(); calls.length = 0;
r = handlePhrase('в пятницу встреча с Димой', 'text', null, env);
r.choices?.[2].run();
ok(last()?.slots.time === '19:00', 'the «Вечером» button fills 19:00');

// a verb left out: «а на завтра?»
dialog.reset(); calls.length = 0;
handlePhrase('что у меня сегодня', 'text', null, env);
handlePhrase('а на завтра', 'text', null, env);
ok(last()?.kind === 'plan.day' && last().slots.day === '2026-10-29', '«а на завтра» keeps the kind and changes the day');

// a correction right after an action
dialog.reset(); calls.length = 0;
handlePhrase('перенеси созвон на завтра на 11', 'text', null, env);
handlePhrase('нет на четверг', 'text', null, env);
ok(calls.length === 2 && last().kind === 'task.move' && last().slots.day === '2026-10-29' && last().slots.time === '11:00', '«нет, на четверг» redoes the last action with the new day');

// references
dialog.reset(); calls.length = 0;
handlePhrase('перенеси созвон на пятницу', 'text', null, env);
handlePhrase('удали его', 'text', null, env).choices?.[0].run(); // deleting asks first
ok(last()?.kind === 'task.delete' && /созвон/i.test(String(last().slots.query)), '«его» is the task just touched');
dialog.reset(); calls.length = 0;
handlePhrase('что у меня сегодня', 'text', null, env);
handlePhrase('удали вторую', 'text', null, env).choices?.[0].run();
ok(last()?.kind === 'task.delete' && /молоко/i.test(String(last().slots.query)), '«вторую» is the second line of the last list');

// not understood: hints on the second, the text field on the third
dialog.reset();
let a = handlePhrase('какая погода', 'text', null, env);
ok(!a.typing && !a.ok, 'first miss: a refusal');
a = handlePhrase('включи музыку', 'text', null, env);
ok((a.chips?.length ?? 0) === 4, 'second miss: four hints');
a = handlePhrase('позвони маме', 'text', null, env);
ok(a.typing === true, 'third miss: the text field opens');
handlePhrase('настроение четыре', 'text', null, env);
ok(dialog.get().misses === 0, 'a success resets the counter');

console.log(fail ? `${fail} failed of ${n}` : `all ${n} passed`);
if (fail) process.exit(1);
