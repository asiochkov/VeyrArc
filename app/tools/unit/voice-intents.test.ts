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
  // B-02: «ничего» inside a negation must not read as neutral mood
  ['я устал и ничего не хочу', { kind: 'mood', level: 1 }],
  ['настроение ничего', { kind: 'mood', level: 2 }], // bare «ничего» as context still means "fine"
  ['i feel great', { kind: 'mood', level: 4 }],
  ['сделал зарядку и медитацию', [{ kind: 'done', query: 'зарядку' }, { kind: 'done', query: 'медитацию' }]],
  // B-07: «напомнил» is a request about the future, not a completed habit — must not read as done
  ['хочу чтобы ты напомнил про тренировку', { kind: 'guess', query: 'напомнил про тренировку' }],
  // B-08: two different command types joined by «и» used to misread as one «ask mood» question;
  // now splits into two intents. The first one's query is imperfect («отметь», not a habit name —
  // «позанимался» has no content beyond being the trigger verb itself, a separate deeper gap).
  ['отметь что я позанимался и поставь настроение хорошее', [{ kind: 'done', query: 'отметь' }, { kind: 'mood', level: 3 }]],
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
  // B-05: natural RU time/date idioms that used to be silently dropped
  ['запиши встречу с Аней в половине пятого', { kind: 'taskAdd', title: 'Встреча с Аней', time: '04:30' }],
  ['запиши встречу с Аней без пятнадцати шесть', { kind: 'taskAdd', title: 'Встреча с Аней', time: '05:45' }],
  ['запиши встречу с Аней без четверти шесть', { kind: 'taskAdd', title: 'Встреча с Аней', time: '05:45' }],
  ['запланируй звонок через две недели', { kind: 'taskAdd', title: 'Звонок', day: '2026-10-28' }],
  ['запланируй звонок в конце месяца', { kind: 'taskAdd', title: 'Звонок', day: '2026-10-31' }],
  ['remind me to call John tomorrow at 5 pm', { kind: 'taskAdd', title: 'Call John', time: '17:00' }],
  ['перенеси все задачи на завтра', { kind: 'taskMove', all: true, day: '2026-10-15' }],
  ['сдвинь встречу с Аней на пятницу в 12', { kind: 'taskMove', day: '2026-10-16', time: '12:00' }],
  ['удали задачу купить хлеб', { kind: 'taskDelete', query: 'купить хлеб' }],
  ['фокус 25', { kind: 'focus', op: 'start', minutes: 25 }],
  // B-04: bare «час» (no digit) must mean 60 minutes, not nothing
  ['начни фокус на час', { kind: 'focus', op: 'start', minutes: 60 }],
  ['запусти помодоро на полчаса', { kind: 'focus', op: 'start', minutes: 30 }],
  ['хочу поработать час', { kind: 'focus', op: 'start', minutes: 60 }],
  ['пауза', { kind: 'focus', op: 'pause' }],
  ['перерыв 5 минут', { kind: 'focus', op: 'break', minutes: 5 }],
  ['открой цели', { kind: 'nav', to: '/goals' }],
  ['покажи статистику', { kind: 'nav', to: '/analytics' }],
  // B-03: a done-verb short phrase must not be hijacked by nav-by-word-count
  ['закончил отчёт', { kind: 'done', query: 'отчет' }],
  ['покажи отчёт', { kind: 'nav', to: '/analytics' }], // but an explicit OPEN verb still navigates
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
  // C-07: quits (addQuit/archiveQuit now reachable by voice)
  ['добавь отказ от курения', { kind: 'quitAdd', name: 'Курение' }],
  ['заведи отказ от сладкого', { kind: 'quitAdd', name: 'Сладкое' }],
  ['хочу бросить курить', { kind: 'goalAdd', title: 'Бросить курить' }], // must not be hijacked by quitAdd
  ['убери отказ курение', { kind: 'quitArchive', query: 'курение' }],
  // C-07: habit archive/restore/delete
  ['заархивируй привычку чтение', { kind: 'habitArchive', query: 'чтение' }],
  ['восстанови привычку чтение', { kind: 'habitRestore', query: 'чтение' }],
  ['удали привычку чтение', { kind: 'habitDelete', query: 'чтение' }],
  // C-07: goal completion and deadline
  ['заверши цель марафон', { kind: 'goalComplete', query: 'марафон' }],
  ['цель марафон завершена', { kind: 'goalComplete', query: 'марафон' }],
  ['поставь дедлайн цели марафон на 20 ноября', { kind: 'goalDeadline', query: 'марафон', day: '2026-11-20' }],
  ['добавь шаг в цель марафон: растяжка', { kind: 'stepAdd', goal: 'марафон', text: 'Растяжка' }], // must not be hijacked by goal intents
  // C-07: goal diary and arc oath
  ['запиши в дневник цели марафон: сегодня пробежал 5 км', { kind: 'goalDiary', query: 'марафон', text: 'Сегодня пробежал 5 км' }],
  ['поставь клятву: не сдаваться', { kind: 'arcOath', text: 'Не сдаваться' }],
  ['подведи итоги', { kind: 'review' }],
  ['переключи на английский', { kind: 'lang', to: 'en' }],
  // C-07: theme and reminder time
  ['включи тёмную тему', { kind: 'settingsTheme', to: 'dark' }],
  ['включи светлую тему', { kind: 'settingsTheme', to: 'light' }],
  ['напоминай мне в 9 утра', { kind: 'settingsReminder', time: '09:00' }],
  ['поставь напоминание на 21:00', { kind: 'settingsReminder', time: '21:00' }],
  // C-07: per-habit streak question
  ['какая серия по бегу', { kind: 'habitStreakQuery', query: 'бегу' }],
  ['какой у меня стрик по чтению', { kind: 'habitStreakQuery', query: 'чтению' }],
  ['какая у меня серия', { kind: 'ask', what: 'streak' }], // must stay the general question
  // C-07: «сколько дней я не курю» — quit.days query
  ['сколько дней я не курю', { kind: 'quitDaysQuery', query: 'курю' }],
  // search.all
  ['найди марафон', { kind: 'search', query: 'марафон' }],
  ['где у меня встреча с Аней', { kind: 'search', query: 'встреча с аней' }],
  // habit.weakest / habit.top
  ['где я просел', { kind: 'habitWeakest' }],
  ['какая у меня лучшая привычка', { kind: 'habitTop' }],
  ['верни как было', { kind: 'undo' }],
  ['что ты умеешь', { kind: 'help' }],
  ['медитация', { kind: 'guess' }],
  ['подведи итоги недели', { kind: 'weekReview' }],
  ['заморозь вчера', { kind: 'freeze' }],
  // B-12: health questions get a care-aware disclaimer, not a generic offtopic brush-off
  ['у меня болит голова', { kind: 'unknown', text: 'offtopic-health' }],
  ['как похудеть', { kind: 'unknown', text: 'offtopic-health' }],
  ['сегодня погода хорошая', { kind: 'unknown', text: 'offtopic' }], // non-health offtopic unaffected
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
