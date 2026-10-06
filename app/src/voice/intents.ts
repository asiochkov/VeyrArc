/*
 * Voice commands → intents (ТЗ модуль 2, уровень 1: детерминированный разбор, без внешних API).
 * Pure function: text in, intent out — the app's own actions do the work (see run.ts).
 */
export type Intent =
  | { kind: 'mood'; level: number } // 0..4 (как logMood)
  | { kind: 'habit'; query: string; undo: boolean }
  | { kind: 'task'; title: string; day: string; time: string | null }
  | { kind: 'focus'; minutes: number | null }
  | { kind: 'unknown'; text: string };

const WORD_NUM: Record<string, number> = {
  ноль: 0, один: 1, одна: 1, одну: 1, два: 2, две: 2, три: 3, четыре: 4, пять: 5, шесть: 6, семь: 7, восемь: 8, девять: 9, десять: 10,
  одиннадцать: 11, двенадцать: 12, пятнадцать: 15, двадцать: 20, тридцать: 30, сорок: 40, пятьдесят: 50,
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, fifteen: 15, twenty: 20, thirty: 30,
};
/** «двадцать пять» → 25, «пять» → 5, digits stay */
export function wordsToDigits(s: string) {
  // \b is ASCII-only in JS, so Cyrillic word edges are spelled out with lookarounds
  return s.replace(/(?<![a-zа-яё])(двадцать|тридцать|сорок|пятьдесят)\s+(один|одна|два|две|три|четыре|пять|шесть|семь|восемь|девять)(?![a-zа-яё])/gi,
    (_, a, b) => String(WORD_NUM[a.toLowerCase()] + WORD_NUM[b.toLowerCase()]))
    .replace(/[a-zа-яё]+/gi, (w) => (w.toLowerCase() in WORD_NUM ? String(WORD_NUM[w.toLowerCase()]) : w));
}

const MOOD_WORDS: [RegExp, number][] = [
  [/(ужасн|отвратительн|очень плох|terrible|awful)/, 0],
  [/(плох|грустн|так себе|bad|sad)/, 1],
  [/(нормальн|средн|ок\b|окей|okay|ok\b|fine|neutral)/, 2],
  [/(хорош|good)/, 3],
  [/(отличн|прекрасн|супер|great|amazing|excellent)/, 4],
];

const pad = (n: number) => String(n).padStart(2, '0');
const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const WEEKDAYS: [RegExp, number][] = [
  [/в\s+понедельник|on monday/, 1], [/во\s+вторник|on tuesday/, 2], [/в\s+среду|on wednesday/, 3], [/в\s+четверг|on thursday/, 4],
  [/в\s+пятницу|on friday/, 5], [/в\s+субботу|on saturday/, 6], [/в\s+воскресенье|on sunday/, 0],
];

/** day words → ISO date, and the text without them */
function takeDay(text: string, now: Date): { day: string; rest: string } {
  const d = new Date(now);
  let rest = text;
  if (/послезавтра|day after tomorrow/.test(rest)) { d.setDate(d.getDate() + 2); rest = rest.replace(/(на\s+)?послезавтра|day after tomorrow/, ' '); }
  else if (/завтра|tomorrow/.test(rest)) { d.setDate(d.getDate() + 1); rest = rest.replace(/(на\s+)?завтра|tomorrow/, ' '); }
  else if (/сегодня|today/.test(rest)) { rest = rest.replace(/(на\s+)?сегодня|today/, ' '); }
  else {
    for (const [re, wd] of WEEKDAYS) {
      if (re.test(rest)) { const diff = (wd - d.getDay() + 7) % 7 || 7; d.setDate(d.getDate() + diff); rest = rest.replace(re, ' '); break; }
    }
  }
  return { day: iso(d), rest };
}

/** «в 15», «в 15:30», «в 3 часа дня», «at 9 pm» → «15:00» */
function takeTime(text: string): { time: string | null; rest: string } {
  const m = text.match(/(?:^|\s)(?:в|at|к)\s+(\d{1,2})(?:[:.\s](\d{2}))?\s*(?:час(?:а|ов)?)?\s*(утра|дня|вечера|ночи|am|pm)?/);
  if (!m) return { time: null, rest: text };
  let h = Number(m[1]);
  const min = m[2] ? Number(m[2]) : 0;
  const part = m[3];
  if ((part === 'дня' || part === 'вечера' || part === 'pm') && h < 12) h += 12;
  if ((part === 'ночи' || part === 'am') && h === 12) h = 0;
  if (h > 23 || min > 59) return { time: null, rest: text };
  return { time: `${pad(h)}:${pad(min)}`, rest: text.replace(m[0], ' ') };
}

const clean = (s: string) => s.replace(/\s+/g, ' ').replace(/^[\s,.:;—-]+|[\s,.:;—-]+$/g, '').trim();

export function parseCommand(raw: string, now = new Date()): Intent {
  const text = wordsToDigits(raw.toLowerCase().replace(/ё/g, 'е')).trim();

  // mood: «настроение 4», «настроение отличное», «mood 7» (1–5; 6–10 читаем как десятибалльную)
  const moodM = text.match(/(?:настроени[ея]|настрой|mood|оцениваю день|день на)\D{0,12}(\d{1,2})/);
  if (moodM) {
    const n = Number(moodM[1]);
    if (n >= 1 && n <= 10) return { kind: 'mood', level: n <= 5 ? n - 1 : Math.min(4, Math.ceil(n / 2) - 1) };
  }
  if (/настроени|настрой|mood|чувствую себя|i feel/.test(text)) {
    for (const [re, level] of MOOD_WORDS) if (re.test(text)) return { kind: 'mood', level };
  }

  // focus: «фокус 25», «запусти фокус», «помодоро на 50 минут»
  if (/фокус|помодоро|pomodoro|focus/.test(text)) {
    const n = text.match(/(\d{1,3})/);
    return { kind: 'focus', minutes: n ? Math.min(180, Math.max(1, Number(n[1]))) : null };
  }

  // task: «задача …», «напомни …», «добавь задачу …», «запланируй …»
  const taskM = text.match(/^(?:создай задачу|добавь задачу|новая задача|задача|задачу|напомни(?:\s+мне)?|запланируй|remind me to|add task|task)\s+(.+)/);
  if (taskM) {
    const { day, rest } = takeDay(taskM[1], now);
    const { time, rest: rest2 } = takeTime(rest);
    const title = clean(rest2);
    if (title) return { kind: 'task', title: title[0].toUpperCase() + title.slice(1), day, time };
  }

  // habit: «сделал зарядку», «выполнил медитацию», «отметь воду», «сними отметку с чтения»
  const undoM = text.match(/^(?:сними отметку(?:\s+с)?|отмени|убери отметку(?:\s+с)?|undo)\s+(.+)/);
  if (undoM) return { kind: 'habit', query: clean(undoM[1].replace(/привычк\S*/, '')), undo: true };
  const habitM = text.match(/^(?:я\s+)?(?:сделал[аи]?|выполнил[аи]?|отметь|отметил[аи]?|закончил[аи]?|прочитал[аи]?|выпил[аи]?|done|did|completed)\s+(.+)/);
  if (habitM) return { kind: 'habit', query: clean(habitM[1].replace(/привычк\S*/, '')), undo: false };

  return { kind: 'unknown', text: raw };
}

/** «медитацию» ≈ «Медитация», «воду» ≈ «Вода 8 стаканов»: common stems of 4+ letters */
export function matchScore(query: string, name: string) {
  const words = (s: string) => s.toLowerCase().replace(/ё/g, 'е').split(/[^a-zа-я0-9]+/).filter((w) => w.length >= 3);
  const q = words(query), n = words(name);
  let score = 0;
  for (const a of q) for (const b of n) {
    const k = Math.min(a.length, b.length, 5);
    if (k >= 3 && a.slice(0, Math.max(3, k - 1)) === b.slice(0, Math.max(3, k - 1))) score += k;
  }
  return score;
}
