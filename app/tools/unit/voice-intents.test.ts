import { similarity, understand } from '../../src/voice/nlu';

// run: npx tsx tools/unit/voice-intents.test.ts
const now = new Date(2026, 9, 14, 10, 0); // среда, 14 октября 2026, 10:00
type C = [string, Record<string, unknown> | Record<string, unknown>[]];
const cases: C[] = [
  ['настроение 4', { kind: 'mood', level: 3 }],
  ['мне сегодня хреново', { kind: 'mood', level: 0 }],
  ['настроение так себе', { kind: 'mood', level: 1 }],
  ['настроение на троечку', { kind: 'mood', level: 2 }],
  ['день на 8 из 10', { kind: 'mood', level: 3 }],
  ['я устал', { kind: 'mood', level: 1 }],
  ['i feel great', { kind: 'mood', level: 4 }],
  ['сделал зарядку и медитацию', [{ kind: 'done', query: 'зарядку' }, { kind: 'done', query: 'медитацию' }]],
  ['выпил 2 стакана воды', { kind: 'done', amount: 2 }],
  ['ещё стакан воды', { kind: 'done', amount: 1 }],
  ['поработал 2 часа над проектом', { kind: 'done', minutes: 120 }],
  ['я сегодня пробежал 5 километров', { kind: 'done', amount: 5 }],
  ['воду выпил', { kind: 'done' }],
  ['поставь галочку на чтении', { kind: 'done', query: 'чтении' }],
  ['вычеркни поход в магазин', { kind: 'done' }],
  ['сними галочку с медитации', { kind: 'undone', query: 'медитации' }],
  ['я не делал зарядку', { kind: 'undone', query: 'зарядку' }],
  ['задача позвонить маме завтра в 15:30', { kind: 'taskAdd', title: 'Позвонить маме', day: '2026-10-15', time: '15:30' }],
  ['завтра в 10 стоматолог', { kind: 'taskAdd', title: 'Стоматолог', day: '2026-10-15', time: '10:00' }],
  ['в пятницу созвон с командой с 15 до 16', { kind: 'taskAdd', title: 'Созвон с командой', day: '2026-10-16', time: '15:00', end: '16:00' }],
  ['надо отправить отчёт до пятницы', { kind: 'taskAdd', title: 'Отправить отчёт', day: '2026-10-16' }],
  ['запиши встречу с Аней 20 октября в 18', { kind: 'taskAdd', title: 'Встреча с Аней', day: '2026-10-20', time: '18:00' }],
  ['слушай а можно завтра в девять утра поставить встречу с врачом', { kind: 'taskAdd', title: 'Встреча с врачом', time: '09:00' }],
  ['в понедельник в восемь вечера тренировка на полтора часа', { kind: 'taskAdd', day: '2026-10-19', time: '20:00', end: '21:30' }],
  ['через 2 часа забрать посылку', { kind: 'taskAdd', time: '12:00' }],
  ['remind me to call John tomorrow at 5 pm', { kind: 'taskAdd', title: 'Call John', time: '17:00' }],
  ['перенеси все задачи на завтра', { kind: 'taskMove', all: true, day: '2026-10-15' }],
  ['сдвинь встречу с Аней на пятницу в 12', { kind: 'taskMove', day: '2026-10-16', time: '12:00' }],
  ['удали задачу купить хлеб', { kind: 'taskDelete', query: 'купить хлеб' }],
  ['фокус 25', { kind: 'focus', op: 'start', minutes: 25 }],
  ['запусти помодоро на полчаса', { kind: 'focus', op: 'start', minutes: 30 }],
  ['хочу поработать час', { kind: 'focus', op: 'start', minutes: 60 }],
  ['пауза', { kind: 'focus', op: 'pause' }],
  ['перерыв 5 минут', { kind: 'focus', op: 'break', minutes: 5 }],
  ['открой цели', { kind: 'nav', to: '/goals' }],
  ['покажи статистику', { kind: 'nav', to: '/analytics' }],
  ['что у меня сегодня', { kind: 'ask', what: 'plan' }],
  ['какие планы на завтра', { kind: 'ask', what: 'planTomorrow' }],
  ['чем заняться', { kind: 'ask', what: 'next' }],
  ['сколько дней подряд я держусь', { kind: 'ask', what: 'streak' }],
  ['который час', { kind: 'ask', what: 'time' }],
  ['какая сегодня погода', { kind: 'unknown' }],
  ['новая привычка вода 8 стаканов в день', { kind: 'habitAdd', name: 'Вода', type: 'counter', target: 8 }],
  ['хочу каждый день читать 20 минут', { kind: 'habitAdd', type: 'duration', minutes: 20 }],
  ['хочу научиться играть на гитаре', { kind: 'goalAdd', title: 'Научиться играть на гитаре' }],
  ['в цель английский добавь выучить 20 слов', { kind: 'stepAdd', goal: 'английский', text: 'Выучить 20 слов' }],
  ['сорвался с курения', { kind: 'relapse', query: 'курения' }],
  ['подведи итоги', { kind: 'review' }],
  ['переключи на английский', { kind: 'lang', to: 'en' }],
  ['верни как было', { kind: 'undo' }],
  ['что ты умеешь', { kind: 'help' }],
  ['медитация', { kind: 'guess' }],
];
let fail = 0;
for (const [text, want] of cases) {
  const got = understand(text, now);
  const wants = Array.isArray(want) ? want : [want];
  const ok = wants.every((w, i) => got[i] && Object.entries(w).every(([k, v]) => (got[i] as Record<string, unknown>)[k] === v));
  if (!ok) { fail++; console.log('✗', text, '→', JSON.stringify(got), 'want', JSON.stringify(want)); }
}
const sims: [string, string, boolean][] = [
  ['медитацию', 'Медитация', true], ['помедитировал', 'Медитация 10 мин', true], ['звонок маме', 'Позвонить маме', true],
  ['душ', 'Холодный душ', true], ['зарядку', 'Чтение', false],
];
for (const [a, b, yes] of sims) { const v = similarity(a, b); if ((v >= 0.45) !== yes) { fail++; console.log('✗ similarity', a, b, v.toFixed(2)); } }
console.log(fail ? `${fail} failed of ${cases.length + sims.length}` : `all ${cases.length + sims.length} passed`);
if (fail) process.exit(1);
