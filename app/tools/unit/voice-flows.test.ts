import { QueryClient } from '@tanstack/react-query';
import { bindSystem, getSystem } from '../../src/state/system';
import { logHabit, logMood } from '../../src/state/actions';
import { handlePhrase } from '../../src/voice/dialog/manager';
import { dialog } from '../../src/voice/dialog/context';
import { envFromSystem } from '../../src/voice/exec/env';
import { journal } from '../../src/voice/journal';
import { flowActive } from '../../src/voice/flows/engine';

// run: npx tsx --import ./tools/unit/css-register.mjs tools/unit/voice-flows.test.ts — the guided flows on the seeded demo data (ТЗ 6.9)
(globalThis as any).localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
bindSystem(new QueryClient());
let fail = 0, n = 0;
const ok = (c: boolean, m: string) => { n++; if (!c) { fail++; console.log('✗', m); } };
const sys = () => getSystem()!;
const say = (t: string) => handlePhrase(t, 'text', null, envFromSystem('ru', new Date(2026, 9, 28, 19, 0)));
const open = () => sys().habits.filter((h) => !h.archived_at);

// make sure something is open today
const day = sys().day;
for (const h of open().slice(0, 2)) logHabit(h.id, 0, false, day);

// walk: a question per habit, «да» marks, «нет» skips, «хватит» ends; everything marked can be undone
dialog.reset();
let r = say('проведи меня по привычкам');
ok(r.kind === 'ask' && /Пойд/.test(r.screen) && flowActive(), 'walk starts with the count and the first question');
const before = sys().logs.filter((l) => l.day === day && l.done).length;
r = say('да');
const afterYes = sys().logs.filter((l) => l.day === day && l.done).length;
ok(afterYes === before + 1, '«да» marks the habit');
r = say('нет');
ok(sys().logs.filter((l) => l.day === day && l.done).length === afterYes, '«нет» marks nothing');
r = say('хватит');
ok(!flowActive() && /остановил/i.test(r.screen), '«хватит» leaves the flow');
journal.undo(1);
ok(sys().logs.filter((l) => l.day === day && l.done).length === before, 'the mark taken back by «отмени»');

// an unrelated command is not an answer: a yes/no step lets it through to the parser
dialog.reset();
say('проведи меня по привычкам');
r = say('что у меня сегодня');
ok(flowActive() && r.screen !== '', 'a command during a flow is parsed, the flow stays');
say('стоп');
ok(!flowActive(), '«стоп» ends it');

// evening: mood, a win, then the day closes
dialog.reset();
logMood(null as never, day);
r = say('подведи вечер');
ok(/пятибалльной/.test(r.screen), 'evening asks the mood first when it is not set');
r = say('четыре');
ok(/получилось/.test(r.screen) && sys().days.find((d) => d.day === day)?.mood === 4, 'the mood is saved, then asks what went well');
r = say('закончил отчёт');
ok(/победа: закончил отч/i.test(sys().days.find((d) => d.day === day)?.note ?? ''), 'the answer lands in the day note');
for (let i = 0; i < 4 && flowActive(); i++) r = say('нет');
ok(!flowActive() && /День закрыт/.test(r.screen), 'the evening ends with the closing line');

// morning: greeting and at most three facts
dialog.reset();
r = handlePhrase('утренний брифинг', 'text', null, envFromSystem('ru', new Date(2026, 9, 28, 8, 0)));
ok(/^Доброе утро/.test(r.screen) && r.screen.split('. ').length <= 4, 'morning greets by the time of day with up to three facts');

// fit
r = say('у меня полчаса что успеть');
ok(/30 минут/.test(r.screen) && (r.chips?.length ?? 0) > 0, 'fit offers what fits into the time');

// week
dialog.reset();
r = say('подведи неделю');
ok(/Дней в ритме/.test(r.screen) && flowActive(), 'week gives the numbers and asks what to carry');
r = say('больше спать');
ok(!flowActive() && /больше спать/.test(r.screen), 'the week focus is saved');

// tough: three buttons, nothing marked by itself
dialog.reset();
const marks = sys().logs.length;
r = say('мне тяжело сегодня');
ok((r.choices?.length ?? 0) === 3 && sys().logs.length === marks, 'tough offers three ways and marks nothing');

console.log(fail ? `${fail} failed of ${n}` : `all ${n} passed`);
if (fail) process.exit(1);
