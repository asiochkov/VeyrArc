/*
 * The assistant's understanding (ТЗ модуль 2, 0 ₽: everything on the device, no external API).
 * Spoken text → one or more intents. Built for loose phrasing: fillers are dropped, numbers and
 * times are read from words, verbs are matched by stems, and a phrase with no command word still
 * becomes a «guess» that the runner resolves against the person's own habits, tasks and goals.
 * Pure functions only — run.ts does the work through the app's actions.
 */
export type FocusOp = 'start' | 'pause' | 'resume' | 'stop' | 'break' | 'open';
export type AskWhat = 'plan' | 'planTomorrow' | 'next' | 'left' | 'progress' | 'streak' | 'focusToday' | 'mood' | 'goals' | 'time' | 'date' | 'week';
export type NavTo = '/' | '/disciplines' | '/planner' | '/goals' | '/analytics' | '/settings' | '/settings/account';

export type Intent =
  | { kind: 'mood'; level: number } // 0..4, as logMood
  | { kind: 'done'; query: string; amount: number | null; minutes: number | null } // a habit, a task or a goal step
  | { kind: 'undone'; query: string }
  | { kind: 'taskAdd'; title: string; day: string; time: string | null; end: string | null }
  | { kind: 'taskMove'; query: string; all: boolean; day: string | null; time: string | null }
  | { kind: 'taskDelete'; query: string }
  | { kind: 'focus'; op: FocusOp; minutes: number | null }
  | { kind: 'nav'; to: NavTo }
  | { kind: 'ask'; what: AskWhat }
  | { kind: 'habitAdd'; name: string; type: 'binary' | 'counter' | 'duration'; target: number | null; minutes: number | null; unit: string | null }
  | { kind: 'goalAdd'; title: string }
  | { kind: 'stepAdd'; goal: string; text: string }
  | { kind: 'relapse'; query: string }
  | { kind: 'quitAdd'; name: string }
  | { kind: 'quitArchive'; query: string }
  | { kind: 'habitArchive'; query: string }
  | { kind: 'habitRestore'; query: string }
  | { kind: 'habitDelete'; query: string }
  | { kind: 'goalComplete'; query: string }
  | { kind: 'goalDeadline'; query: string; day: string }
  | { kind: 'goalDiary'; query: string; text: string }
  | { kind: 'arcOath'; text: string }
  | { kind: 'settingsTheme'; to: 'light' | 'dark' | 'system' }
  | { kind: 'settingsReminder'; time: string }
  | { kind: 'habitStreakQuery'; query: string }
  | { kind: 'quitDaysQuery'; query: string }
  | { kind: 'review' }
  | { kind: 'weekReview' }
  | { kind: 'freeze' }
  | { kind: 'lang'; to: 'ru' | 'en' }
  | { kind: 'undo' }
  | { kind: 'help' }
  | { kind: 'chat'; say: 'hello' | 'thanks' | 'praise' | 'bye' }
  | { kind: 'guess'; query: string }
  | { kind: 'unknown'; text: string };

/* ---------------- text ---------------- */
const L = '(?<![a-zа-я0-9])'; // word start (\b is ASCII-only in JS)
const R = '(?![a-zа-я0-9])';  // word end
const w = (s: string) => new RegExp(L + '(?:' + s + ')' + R);
const st = (s: string) => new RegExp(L + '(?:' + s + ')'); // a stem: start only

const NUM: Record<string, number> = {
  ноль: 0, один: 1, одна: 1, одну: 1, одно: 1, два: 2, две: 2, три: 3, четыре: 4, пять: 5, шесть: 6, семь: 7, восемь: 8, девять: 9, десять: 10,
  одиннадцать: 11, двенадцать: 12, тринадцать: 13, четырнадцать: 14, пятнадцать: 15, шестнадцать: 16, семнадцать: 17, восемнадцать: 18, девятнадцать: 19,
  двадцать: 20, тридцать: 30, сорок: 40, пятьдесят: 50, шестьдесят: 60, девяносто: 90, сто: 100,
  первого: 1, второго: 2, третьего: 3, четвертого: 4, пятого: 5, шестого: 6, седьмого: 7, восьмого: 8, девятого: 9, десятого: 10,
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, fifteen: 15, twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60,
};
const TENS = 'двадцать|тридцать|сорок|пятьдесят|twenty|thirty|forty|fifty';
const ONES = 'один|одна|одну|два|две|три|четыре|пять|шесть|семь|восемь|девять|one|two|three|four|five|six|seven|eight|nine';

/** «двадцать пять» → 25, «пять» → 5, «полчаса» → «30 минут», «полтора часа» → «90 минут» */
export function wordsToDigits(s: string) {
  return s
    .replace(new RegExp(L + '(полчаса|пол часа)' + R, 'g'), '30 минут')
    .replace(new RegExp(L + 'полтора час(?:а|ов)?' + R, 'g'), '90 минут')
    .replace(new RegExp(L + '(?:на )?(единиц[ауы]|кол|двойк[ауи]|двоечк[ауи]|тройк[ауи]|троечк[ауи]|трояк|четверк[ауи]|четверочк[ауи]|пятерк[ауи]|пятерочк[ауи])' + R, 'g'),
      (_, g: string) => ' на ' + (/^(?:един|кол)/.test(g) ? 1 : /^дво/.test(g) ? 2 : /^тро/.test(g) ? 3 : /^четв/.test(g) ? 4 : 5))
    .replace(new RegExp(L + `(${TENS})\\s+(${ONES})` + R, 'g'), (_, a, b) => String(NUM[a] + NUM[b]))
    .replace(/[a-zа-я]+/g, (x) => (x in NUM ? String(NUM[x]) : x));
}

const FILLERS = 'пожалуйста|плиз|please|ну|короче|слушай|эй|окей гугл|давай-ка|давай|можешь|можно|могу|ли|бы|мне бы|хочу чтобы ты|сможешь|будь добр|будь другом|вейр|veyr|veyrarc|вейрарк|ассистент|вот|типа|как бы|значит|кстати|блин|короч|алло';
/** lower case, ё → е, no punctuation, no fillers, numbers as digits */
export function normalize(raw: string) {
  let s = raw.toLowerCase().replace(/ё/g, 'е').replace(/[«»"“”„!?…]/g, ' ').replace(/[,;]/g, ' , ').replace(/\s+/g, ' ');
  s = wordsToDigits(s);
  s = s.replace(new RegExp(L + '(?:' + FILLERS + ')' + R, 'g'), ' ');
  return s.replace(/\s+/g, ' ').replace(/^[\s,.:—-]+|[\s,.:—-]+$/g, '').trim();
}

const clean = (s: string) => s.replace(/\s+/g, ' ').replace(/^[\s,.:;—-]+|[\s,.:;—-]+$/g, '').trim();
const cap = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);

/* ---------------- dates and times ---------------- */
const pad = (n: number) => String(n).padStart(2, '0');
export const isoOf = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const MONTHS = ['январ', 'феврал', 'март', 'апрел', 'ма[йя]', 'июн', 'июл', 'август', 'сентябр', 'октябр', 'ноябр', 'декабр'];
const WD: [string, number][] = [
  ['понедельник|monday', 1], ['вторник|tuesday', 2], ['сред[ауы]|wednesday', 3], ['четверг|thursday', 4], ['пятниц[ауы]|friday', 5], ['суббот[ауы]|saturday', 6], ['воскресенье|sunday', 0],
];

/** day words → ISO date, and the text without them; null when the text names no day */
export function takeDay(text: string, now: Date): { day: string | null; rest: string } {
  const d = new Date(now);
  const hit = (re: RegExp, f: (m: RegExpMatchArray) => void) => {
    const m = text.match(re);
    if (!m) return false;
    f(m);
    text = text.replace(m[0], ' ');
    return true;
  };
  const found =
    hit(w('(?:на |в )?послезавтра|day after tomorrow'), () => d.setDate(d.getDate() + 2))
    || hit(w('(?:на )?завтра|tomorrow'), () => d.setDate(d.getDate() + 1))
    || hit(w('(?:на )?сегодня|today|сейчас же'), () => {})
    || hit(w('через (\\d+) (?:дн(?:я|ей)|день|сутки|суток)'), (m) => d.setDate(d.getDate() + Number(m[1])))
    || hit(w('через (?:1 )?неделю|in a week'), () => d.setDate(d.getDate() + 7))
    // B-05: «через две недели» — wordsToDigits already turned «две» into 2 by the time this runs
    || hit(w('через (\\d+) недел[а-я]*|in (\\d+) weeks?'), (m) => d.setDate(d.getDate() + Number(m[1] ?? m[2]) * 7))
    || hit(w('(?:на )?следующей неделе|next week'), () => d.setDate(d.getDate() + (((8 - d.getDay()) % 7) || 7)))
    || hit(w('(?:на |в )?выходн(?:ые|ых)|weekend'), () => d.setDate(d.getDate() + (((6 - d.getDay()) + 7) % 7 || 7)))
    // B-05: «в конце месяца» — last day of the current month (day 0 of next month)
    || hit(w('в конце месяца|at the end of the month'), () => d.setMonth(d.getMonth() + 1, 0))
    || hit(new RegExp(L + '(?:на |к )?(\\d{1,2})(?:-?(?:е|го|ое))? (' + MONTHS.join('|') + ')[а-я]*' + R), (m) => {
      const mon = MONTHS.findIndex((x) => new RegExp('^' + x).test(m[2]));
      d.setMonth(mon, Number(m[1]));
      if (d < new Date(now.getFullYear(), now.getMonth(), now.getDate())) d.setFullYear(d.getFullYear() + 1);
    })
    || hit(new RegExp(L + '(?:на )?(\\d{1,2})\\.(\\d{1,2})(?:\\.\\d{2,4})?' + R), (m) => {
      const day = Number(m[1]), mon = Number(m[2]) - 1;
      if (mon > 11 || day > 31) return;
      d.setMonth(mon, day);
      if (d < new Date(now.getFullYear(), now.getMonth(), now.getDate())) d.setFullYear(d.getFullYear() + 1);
    });
  if (found) return { day: isoOf(d), rest: text };
  for (const [re, wd] of WD) {
    if (hit(new RegExp(L + '(?:в |во |на |к |on )?(?:следующ[а-я]+ |эт[а-я]+ )?(?:' + re + ')' + R), () => {
      d.setDate(d.getDate() + (((wd - d.getDay() + 7) % 7) || 7));
    })) return { day: isoOf(d), rest: text };
  }
  return { day: null, rest: text };
}

const hhmm = (h: number, m: number) => `${pad(h)}:${pad(m)}`;
const fixPart = (h: number, part?: string) => {
  if (!part) return h;
  if (/дня|вечер|pm/.test(part) && h < 12) return h + 12;
  if (/ночи/.test(part) && h >= 9 && h < 12) return h + 12;
  if (/(ночи|утра|am)/.test(part) && h === 12) return 0;
  return h;
};
/**
 * «в 15», «в 15:30», «в 3 часа дня», «к 9 утра», «с 15 до 17», «в полдень», «вечером», «через 2 часа»,
 * «на час» (length) → start, end and the text without them.
 */
export function takeTime(text: string, now: Date): { time: string | null; end: string | null; rest: string; minutes: number | null } {
  let time: string | null = null, end: string | null = null, minutes: number | null = null;
  const take = (re: RegExp, f: (m: RegExpMatchArray) => boolean | void) => {
    const m = text.match(re);
    if (!m || f(m) === false) return false;
    text = text.replace(m[0], ' ');
    return true;
  };
  const PART = '(?:\\s*(утра|дня|вечера|ночи|am|pm))?';
  const T = '(\\d{1,2})(?:[:.](\\d{2})|\\s(\\d{2})(?!\\s*(?:минут|мин)))?(?:\\s*час(?:а|ов)?)?';
  take(new RegExp(L + 'с ' + T + PART + ' до ' + T + PART + R), (m) => {
    const p = m[4] ?? m[8];
    const h1 = fixPart(Number(m[1]), m[4] ?? p), h2 = fixPart(Number(m[5]), m[8] ?? p);
    const m1 = Number(m[2] ?? m[3] ?? 0), m2 = Number(m[6] ?? m[7] ?? 0);
    if (h1 > 23 || h2 > 23 || m1 > 59 || m2 > 59) return false;
    time = hhmm(h1, m1); end = hhmm(h2 < h1 && h2 + 12 <= 23 ? h2 + 12 : h2, m2);
  })
  // B-05: «в половине пятого» → 04:30 (wordsToDigits already turned «пятого» into 5)
  || take(new RegExp(L + 'в\\s+половине\\s+(\\d{1,2})' + R), (m) => {
    const h = Number(m[1]);
    if (h < 1 || h > 12) return false;
    time = hhmm(h === 1 ? 0 : h - 1, 30);
  })
  // B-05: «без пятнадцати шесть» / «без четверти шесть» → 05:45. Genitive minute-words
  // («пятнадцати», «двадцати пяти») aren't in NUM (only the nominative forms are), so they're
  // matched here directly rather than relying on wordsToDigits to have already converted them.
  || take(new RegExp(L + 'без\\s+(четверти|пятнадцати|двадцати\\s+пяти|двадцати|десяти|пяти|\\d{1,2})\\s+(\\d{1,2})' + R), (m) => {
    const MIN: Record<string, number> = { четверти: 15, пятнадцати: 15, 'двадцати пяти': 25, двадцати: 20, десяти: 10, пяти: 5 };
    const minsBefore = MIN[m[1]] ?? Number(m[1]);
    const h = Number(m[2]);
    if (h < 1 || h > 23 || minsBefore >= 60) return false;
    const total = ((h * 60 - minsBefore) % (24 * 60) + 24 * 60) % (24 * 60);
    time = hhmm(Math.floor(total / 60), total % 60);
  })
  || take(new RegExp(L + '(?:в|к|на|at|около|часов в)\\s+' + T + PART + R), (m) => {
    const h = fixPart(Number(m[1]), m[4]), mi = Number(m[2] ?? m[3] ?? 0);
    if (h > 23 || mi > 59) return false;
    // «в 5» with no part of day: a working-hours guess (5 → 17:00)
    time = hhmm(!m[4] && h >= 1 && h <= 7 ? h + 12 : h, mi);
  })
  || take(new RegExp(L + '(\\d{1,2}):(\\d{2})' + R), (m) => {
    const h = Number(m[1]), mi = Number(m[2]);
    if (h > 23 || mi > 59) return false;
    time = hhmm(h, mi);
  })
  || take(w('в полдень|в обед|at noon'), () => { time = '12:00'; })
  || take(w('в полночь|at midnight'), () => { time = '00:00'; })
  || take(w('через (\\d+) (минут[уы]?|мин|час(?:а|ов)?)|через час|через полчаса|in (\\d+) (minutes?|hours?)'), (m) => {
    const n = Number(m[1] ?? m[3] ?? 1);
    const unit = m[2] ?? m[4] ?? (/полчаса/.test(m[0]) ? 'мин' : 'час');
    const add = /^(час|hour)/.test(unit) ? n * 60 : /полчаса/.test(m[0]) ? 30 : n;
    const d = new Date(now.getTime() + add * 60000);
    time = hhmm(d.getHours(), Math.round(d.getMinutes() / 5) * 5 % 60);
  })
  || take(w('с утра|утром|in the morning'), () => { time = '09:00'; })
  || take(w('днем|после обеда|in the afternoon'), () => { time = '14:00'; })
  || take(w('вечером|in the evening|tonight'), () => { time = '19:00'; })
  || take(w('ночью|перед сном|at night'), () => { time = '22:00'; });
  // length: «на час», «на 2 часа», «на 30 минут»
  take(w('на (\\d+) (минут[уы]?|мин|час(?:а|ов)?)|на час|на полчаса|for (\\d+) (minutes?|hours?)|for an hour'), (m) => {
    const n = Number(m[1] ?? m[3] ?? 1);
    const unit = m[2] ?? m[4] ?? 'час';
    minutes = /полчаса/.test(m[0]) ? 30 : /^(час|hour)/.test(unit) || /час|hour/.test(m[0]) && !m[2] && !m[4] ? n * 60 : n;
    if (minutes > 24 * 60) return false;
  });
  if (time && !end && minutes) {
    const [h, mi] = (time as string).split(':').map(Number);
    const e = h * 60 + mi + minutes;
    end = e < 24 * 60 ? hhmm(Math.floor(e / 60), e % 60) : '23:59';
  }
  return { time, end, rest: text, minutes };
}

/* ---------------- matching ---------------- */
const END = /(?:ами|ями|иями|ого|его|ому|ему|ыми|ими|ой|ей|ий|ый|ая|яя|ое|ее|ые|ие|ую|юю|ом|ем|ам|ям|ах|ях|ов|ев|ия|ие|ию|ию|ть|ться|ся|а|я|ы|и|е|о|у|ю|ь)$/;
const PREFIX = /^(?:по|про|вы|за|с|от|на|до|при)(?=[а-я]{5,})/;
/** a crude Russian stem: endings off, at least 3 letters kept */
export function stem(word: string) {
  let s = word;
  for (let i = 0; i < 2 && s.length > 4 && END.test(s); i++) s = s.replace(END, '');
  return s;
}
const words = (s: string) => normalize(s).split(/[^a-zа-я0-9]+/).filter((x) => x.length >= 2);
const STOP = new Set(['в', 'на', 'с', 'и', 'по', 'для', 'за', 'к', 'у', 'о', 'об', 'из', 'от', 'до', 'мой', 'моя', 'мою', 'мои', 'свою', 'свой', 'это', 'эту', 'этот', 'the', 'a', 'my', 'to', 'of', 'all', 'все', 'всё', 'уже', 'еще', 'сегодня', 'сейчас', 'привычку', 'привычка', 'задачу', 'задача', 'шаг', 'цель', 'цели']);
const tri = (s: string) => { const p = `  ${s} `; const out = new Set<string>(); for (let i = 0; i < p.length - 2; i++) out.add(p.slice(i, i + 3)); return out; };
function wordSim(a: string, b: string) {
  if (a === b) return 1;
  const sa = stem(a), sb = stem(b);
  if (sa === sb) return 0.95;
  const pa = sa.replace(PREFIX, ''), pb = sb.replace(PREFIX, '');
  if (pa.length >= 3 && pb.length >= 3 && (pa.startsWith(pb) || pb.startsWith(pa))) return 0.85;
  const k = Math.min(pa.length, pb.length);
  if (k >= 4 && pa.slice(0, 4) === pb.slice(0, 4)) return 0.75;
  const ta = tri(pa), tb = tri(pb);
  let both = 0; for (const t of ta) if (tb.has(t)) both++;
  const dice = (2 * both) / (ta.size + tb.size);
  return dice >= 0.45 ? dice * 0.85 : 0;
}
/**
 * How well a spoken query names an item (0..1): each meaningful word of the shorter side finds its
 * best partner on the other — «медитацию» ≈ «Медитация», «помедитировал» ≈ «Медитация 10 мин»,
 * «воды» ≈ «Вода 8 стаканов», «звонок маме» ≈ «Позвонить маме».
 */
export function similarity(query: string, name: string) {
  const q = words(query).filter((x) => !STOP.has(x)), n = words(name).filter((x) => !STOP.has(x));
  if (!q.length || !n.length) return 0;
  const [short, long] = q.length <= n.length ? [q, n] : [n, q];
  let sum = 0;
  for (const a of short) sum += Math.max(...long.map((b) => wordSim(a, b)));
  const cover = sum / short.length;
  // a long query naming a short item well still counts, a vague one-word match counts less
  const spread = Math.min(1, short.length / Math.max(1, long.length) + 0.5);
  return Math.min(1, cover * spread);
}
/* spoken verbs and slang → the words people name their habits and quits with */
const ALIAS: [RegExp, string][] = [
  [st('чита|прочита|почита|книг|страниц'), 'чтение читать книга'],
  [st('бега|бежа|пробежа|побега|пробежк|километр|км' + R), 'бег пробежка'],
  [st('медитир|помедитир|медитац|подышал|дыхани'), 'медитация'],
  [st('отжима|отжал'), 'отжимания'],
  [st('приседа|присел'), 'приседания'],
  [st('подтяг'), 'подтягивания'],
  [st('растяг|растяжк|стретч|йог'), 'растяжка йога'],
  [st('зарядк|размял|разминк'), 'зарядка'],
  [st('гуля|погуля|прогулк|шаг|прош[её]л'), 'прогулка шаги'],
  [st('спал|поспал|выспал|сон|лег спать|лёг спать'), 'сон'],
  [st('вод[аыуе]|выпил воды|стакан'), 'вода'],
  [st('трениров|потренир|позанимал|спортзал|зал' + R + '|качал|фитнес'), 'тренировка спорт зал'],
  [st('учил|выучил|позанимался английск|английск|язык|слов'), 'английский язык учеба'],
  [st('дневник|записал мысли|журнал'), 'дневник'],
  [st('душ|холодн'), 'холодный душ'],
  [st('витамин|таблетк|лекарств'), 'витамины'],
  [st('кур|сигарет|вейп|затяну'), 'курение сигареты'],
  [st('алкогол|пив|вин[оа]|напил|выпил пиво|бухал'), 'алкоголь'],
  [st('сладк|сахар|конфет|шоколад|торт|десерт'), 'сладкое сахар'],
  [st('соцсет|инстаграм|тикток|рилс|ютуб|залип|телефон'), 'соцсети телефон'],
  [st('фастфуд|бургер|чипс'), 'фастфуд'],
  [st('позвонил|звонок|созвон'), 'позвонить звонок созвон'],
];
/** the query plus what its words usually mean — for matching only */
export function expand(query: string) {
  const t = normalize(query);
  const extra = ALIAS.filter(([re]) => re.test(t)).map(([, x]) => x);
  return extra.length ? `${query} ${extra.join(' ')}` : query;
}
/** best of the plain and the expanded match */
export const matchOf = (query: string, name: string) => Math.max(similarity(query, name), similarity(expand(query), name) * 0.92);

/** kept for the old tests and callers */
export const matchScore = (query: string, name: string) => Math.round(similarity(query, name) * 10);

/* ---------------- intents ---------------- */
const MOOD: [RegExp, number][] = [
  [st('ужасн|отвратительн|кошмарн|хуже некуда|очень плох|паршив|хренов|депресс|terribl|awful|horribl'), 0],
  [st('не очень|плох|грустн|так себе|устал|уныл|тяжел|тревожн|печальн|bad|sad|tired|not great'), 1],
  // B-02: bare «ничего» used to match inside «ничего не хочу» / «ничего не делал» — the worst
  // possible misread for someone in a bad state. Only count it as "fine" when it isn't a negation.
  [st('нормальн|норм|средн|ничего(?!\\s+(?:не|хорошего|особенного))|спокойн|ровн|ок' + R + '|окей|okay|fine|neutral|so so'), 2],
  [st('неплох|хорош|бодр|радост|good|nice'), 3],
  [st('отличн|прекрасн|супер|замечательн|великолепн|круто|кайф|счастлив|лучше всех|на высоте|огонь|great|amazing|excellent|awesome|fantastic'), 4],
];
function moodOf(t: string): number | null {
  const n = t.match(new RegExp(L + '(?:настроени[еяю]|настрой|mood|день|самочувствие|оцениваю(?: день)?)\\D{0,14}(\\d{1,2})(?:\\s*из\\s*(5|10))?' + R))
    ?? t.match(new RegExp(L + '(\\d{1,2})\\s*из\\s*(5|10)' + R));
  if (n) {
    const v = Number(n[1]), scale = Number(n[2] ?? (v > 5 ? 10 : 5));
    if (v >= 0 && v <= scale) return Math.max(0, Math.min(4, scale === 10 ? Math.ceil(v / 2) - 1 : v - 1));
  }
  const ctx = st('настроени|настрой|чувству|самочувств|mood|i feel|feeling').test(t)
    || (t.split(' ').length <= 6 && new RegExp('^(?:мне|я|у меня|сегодня|день|все|всё|чувствую|i am|i\'m|im)' + R).test(t));
  if (!ctx) return null;
  const neg = st('не (?:хорош|отличн|супер|нормальн)').test(t);
  if (neg) return 1;
  for (let i = MOOD.length - 1; i >= 0; i--) if (i !== 1 && MOOD[i][0].test(t) && !st('неплох').test(t)) return MOOD[i][1];
  if (st('неплох').test(t)) return 3;
  return MOOD[1][0].test(t) ? 1 : null;
}

const OPEN = 'открой|открыть|покажи|показать|перейди|перейти|зайди|иди|go to|open|show|верни на|переключи на|хочу в|давай в';
const PAGES: [RegExp, NavTo][] = [
  [st('аккаунт|учетн|account'), '/settings/account'],
  [st('настройк|settings|параметр'), '/settings'],
  [st('главн|сегодня|домой|дом' + R + '|today|home|начал'), '/'],
  [st('привычк|дисциплин|отказ|трекер|habits|disciplines'), '/disciplines'],
  [st('планер|планировщик|календар|расписани|план' + R + '|ежедневник|planner|calendar|schedule'), '/planner'],
  [st('цел|goals'), '/goals'],
  [st('аналитик|статистик|профил|прогресс|графи|отчет|analytics|stats|profile'), '/analytics'],
];

const DONE_V = 'вычеркни|вычеркнуть|сделал[аи]?|сделано|сделана|выполнил[аи]?|выполнено|выполнена|отметь|отметить|отметил[аи]?|отмечай|закончил[аи]?|закончила|завершил[аи]?|прочитал[аи]?|почитал[аи]?|выпил[аи]?|пробежал[аи]?|побегал[аи]?|позанимал[а-я]*|потренировал[а-я]*|помедитировал[аи]?|сходил[аи]?|погулял[аи]?|поспал[аи]?|принял[аи]?|записал[аи]?|позвонил[аи]?|написал[аи]?|убрал[аи]?с[ья]|приготовил[аи]?|готово|готова|done|did|completed|finished|mark';
const UNDO_V = 'сними (?:отметку|галочку)(?: с| со)?|сними(?: с| со)?|убери отметку(?: с)?|убери галочку(?: с)?|отмени отметку(?: с)?|не (?:сделал[аи]?|выполнил[аи]?|делал[аи]?)|unmark|uncheck';
const TASK_V = 'задач[ауи]|напомни(?:те)?(?: мне)?|напоминание|запланируй|запланировать|запиши(?: мне)?|занеси|поставь(?: мне)?|добавь(?: мне)?|создай|внеси|не забыть|нужно|надо|необходимо|должен|должна|remind me(?: to)?|add task|task|schedule';
const TASK_N = 'встреч[ауи]|созвон|звонок|дело|дела|событие|мероприятие|запись к|прием|приём|дедлайн|meeting|call|event';

function splitClauses(t: string) {
  return t.split(/\s*(?:,|;|\.\s|(?<![a-zа-я])(?:а потом|потом|затем|после этого|и ещ[её]|а ещ[её]|а также|и также|and then|then)(?![a-zа-я]))\s*/).map(clean).filter(Boolean);
}

function one(t: string, now: Date): Intent {
  if (!t) return { kind: 'unknown', text: t };

  // undo the last thing the assistant did
  if (new RegExp('^(?:отмени|отменить|верни|откати|undo)(?: (?:это|последнее|последнюю|действие|команду|что сделал|обратно|как было))?$').test(t)
    || /^(?:верни как было|отмени последнее|назад|не то|не надо|это ошибка|ошибся|ошиблась|undo that)$/.test(t)) return { kind: 'undo' };
  if (w('что ты умеешь|что умеешь|помощь|помоги|справка|какие команды|как тобой пользоваться|что можно сказать|help|what can you do').test(t)) return { kind: 'help' };
  if (/^(?:привет|здравствуй|здравствуйте|доброе утро|добрый день|добрый вечер|хай|hello|hi|hey)$/.test(t)) return { kind: 'chat', say: 'hello' };
  if (/^(?:спасибо|спс|благодарю|thanks|thank you)(?: большое| огромное)?$/.test(t)) return { kind: 'chat', say: 'thanks' };
  if (/^(?:молодец|умница|круто|класс|отлично сработал|good job|nice)$/.test(t)) return { kind: 'chat', say: 'praise' };
  if (/^(?:пока|до свидания|все|всё|хватит|закрой|закрыть|выход|bye|close|stop listening)$/.test(t)) return { kind: 'chat', say: 'bye' };

  // language
  if (st('английск|english').test(t) && st('язык|переключ|смени|сделай|switch|language|на английск').test(t)) return { kind: 'lang', to: 'en' };
  if (st('русск|russian').test(t) && st('язык|переключ|смени|сделай|switch|language|на русск').test(t)) return { kind: 'lang', to: 'ru' };

  // C-07: theme and reminder time (setTheme/setProfile already existed, not reachable by voice)
  if (st('тёмн|темн|ночн|dark').test(t) && st('тем[ауы]|режим|theme|mode').test(t)) return { kind: 'settingsTheme', to: 'dark' };
  if (st('светл|дневн|light').test(t) && st('тем[ауы]|режим|theme|mode').test(t)) return { kind: 'settingsTheme', to: 'light' };
  if (st('систем|system').test(t) && st('тем[ауы]|режим|theme|mode').test(t)) return { kind: 'settingsTheme', to: 'system' };
  const rem = t.match(new RegExp(L + '(?:напоминай(?: мне)?|поставь напоминание|измени напоминание|измени время напоминания)\\s*(.+)'));
  if (rem) {
    const tm = takeTime(rem[1], now);
    if (tm.time) return { kind: 'settingsReminder', time: tm.time };
  }

  // C-07: per-habit streak question (habitStreak/habitBest already existed, not reachable by voice)
  const hStreak = t.match(new RegExp(L + '(?:как(?:ая|ой|ое)|сколько дней подряд я|what.?s my)(?:\\s+у меня)?\\s+(?:серия|стрик|streak)\\s*(?:по|у меня по|for)?\\s*(.+)'));
  if (hStreak && clean(hStreak[1])) return { kind: 'habitStreakQuery', query: clean(hStreak[1]) };
  // C-07: «сколько дней я не курю» — a quit.days question, distinct from habit streaks
  const qDays = t.match(new RegExp(L + 'сколько(?: уже)?(?: дней)? я не\\s+(.+?)' + R));
  if (qDays && clean(qDays[1])) return { kind: 'quitDaysQuery', query: clean(qDays[1]) };

  // weekly review, freeze yesterday
  if (st('итоги недели|обзор недели|подвед[иу] (?:итоги )?недел|недельн[а-я]* (?:обзор|итог)|как прошла неделя|weekly review|review (?:the|my) week').test(t)) return { kind: 'weekReview' };
  if (st('замороз|freeze').test(t) && !st('что так|сколько|how many').test(t)) return { kind: 'freeze' };

  // evening review
  if (st('итог[иа]? дня|подвед[иу] итог|подытож|закр(?:ыть|ой|оем) день|завершить день|вечерн[а-я]* обзор|daily review|close the day|review the day').test(t)) return { kind: 'review' };

  // focus control
  const isFocus = st('фокус|помодоро|pomodoro|таймер|focus|концентрац|сосредоточ|глубок[а-я]* работ').test(t);
  if (isFocus || /^(?:пауза|продолжи|продолжить|стоп|перерыв)/.test(t)) {
    const n = t.match(/(\d{1,3})\s*(минут|мин|час)?/);
    // B-04: «на час» has no digit at all («1 час» would already match above) — only «полчаса»
    // gets converted to a number by wordsToDigits, bare «час» never did.
    const minutes = n ? Math.min(180, Math.max(1, Number(n[1]) * (n[2]?.startsWith('час') ? 60 : 1))) : st('час').test(t) ? 60 : null;
    if (st('пауз|приостанов|pause|подожди').test(t)) return { kind: 'focus', op: 'pause', minutes: null };
    if (st('продолж|возобнов|resume|continue').test(t)) return { kind: 'focus', op: 'resume', minutes: null };
    if (st('стоп|останов|выключ|сбрось|сброс|закончи|заверши|отмени|stop|reset|end').test(t)) return { kind: 'focus', op: 'stop', minutes: null };
    if (st('перерыв|отдых|передышк|break|rest').test(t)) return { kind: 'focus', op: 'break', minutes };
    if (st('покажи|открой|show|open').test(t) && !minutes) return { kind: 'focus', op: 'open', minutes: null };
    if (isFocus) return { kind: 'focus', op: 'start', minutes };
  }
  if (st('поработа[юем]|хочу поработать|сяду за работу|let me work|deep work').test(t) && /\d|час/.test(t)) {
    const n = t.match(/(\d{1,3})\s*(минут|мин|час)?/);
    return { kind: 'focus', op: 'start', minutes: n ? Math.min(180, Number(n[1]) * (n[2]?.startsWith('час') ? 60 : 1)) : 60 };
  }
  if (st('перерыв|передохн|отдохн').test(t) && t.split(' ').length <= 5) {
    const n = t.match(/(\d{1,3})/);
    return { kind: 'focus', op: 'break', minutes: n ? Number(n[1]) : null };
  }

  // navigation: «открой цели», «покажи статистику», «настройки»
  // B-03: short phrases starting with a done-verb («закончил отчёт») used to match nav-by-word-count
  // before ever reaching the done-marking logic below — «отчет» alone triggered Analytics.
  if ((st(OPEN).test(t) || t.split(' ').length <= 2) && !new RegExp('^(?:' + DONE_V + ')' + R).test(t)) {
    for (const [re, to] of PAGES) {
      if (!re.test(t)) continue;
      // «покажи прогресс / что на сегодня» are questions, not pages
      if (to === '/' && !st(OPEN).test(t)) continue;
      if (st('что|какие|сколько|как ').test(t)) break;
      return { kind: 'nav', to };
    }
  }

  // outside the app: said kindly, not guessed into a command
  if (st('погод|курс доллар|курс валют|новост|анекдот|шутк|расскажи сказк|кто такой|кто такая|столиц|weather|news|joke').test(t)) return { kind: 'unknown', text: 'offtopic' };

  // questions
  // B-08: «отметь ЧТО я позанимался…» — «что» here is the conjunction "that", not the question
  // word "what". Without this guard the whole phrase (incl. the mood clause later in it) read as
  // a single question and never reached the multi-clause split below.
  const reportingThat = new RegExp('^(?:' + DONE_V + '|' + UNDO_V + ')\\s+что' + R).test(t);
  if (!reportingThat && (st('что|чем|какие|какой|какая|какое|каких|который|которое|сколько|как |когда|есть ли|расскажи|напомни что|покажи что|what|how|which|when').test(t) || /\?$/.test(t))) {
    if (st('врем|час' + R + '|который час|сколько времени|time').test(t) && !st('фокус|работал').test(t)) return { kind: 'ask', what: 'time' };
    if (st('число|дата|какой сегодня день|какое сегодня|date|day is it').test(t)) return { kind: 'ask', what: 'date' };
    if (st('завтра|tomorrow').test(t)) return { kind: 'ask', what: 'planTomorrow' };
    if (st('дальше|следующ|сейчас делать|заняться|начать|в первую очередь|next|now').test(t)) return { kind: 'ask', what: 'next' };
    if (st('остал|не сделал|не выполнил|left|remaining').test(t)) return { kind: 'ask', what: 'left' };
    if (st('сери|streak|подряд').test(t)) return { kind: 'ask', what: 'streak' };
    if (st('фокус|работал|focus').test(t)) return { kind: 'ask', what: 'focusToday' };
    if (st('настроени|mood').test(t)) return { kind: 'ask', what: 'mood' };
    if (st('цел|goal').test(t)) return { kind: 'ask', what: 'goals' };
    if (st('недел|week').test(t)) return { kind: 'ask', what: 'week' };
    if (st('как я' + R + '|дела' + R + '|у меня дела|прогресс|успехи|индекс|балл|оценк|результат|progress|score|doing').test(t)) return { kind: 'ask', what: 'progress' };
    if (st('план|задач|встреч|расписан|дел[ао]?' + R + '|plan|schedule|agenda').test(t) || /(?:что|чем) (?:у меня )?(?:на |по )?сегодня|у меня сегодня|on today|today\??$/.test(t)) return { kind: 'ask', what: 'plan' };
  }
  if (/^(?:мой |мои )?(?:план|планы|расписание|дела)(?: на сегодня)?$/.test(t)) return { kind: 'ask', what: 'plan' };

  // mood
  const mood = moodOf(t);
  if (mood != null) return { kind: 'mood', level: mood };

  // a slip in a quit: «сорвался с курения», «я покурил», «выпил алкоголь» (quits only)
  const slip = t.match(new RegExp(L + '(?:сорвал(?:ся|ась|ись)|срыв|не удержал(?:ся|ась)|relapsed?|slipped)(?:\\s+(?:с|со|по|на|в))?\\s*(.*)'));
  if (slip) return { kind: 'relapse', query: clean(slip[1]) };

  // new habit
  const hab = t.match(new RegExp(L + '(?:добавь|создай|заведи|новая|новую|начни|хочу|add|new|create)(?: мне)?(?: новую| новая)? (?:привычк[ауи]|habit)\\s*(.*)'))
    ?? t.match(new RegExp('^(?:хочу|буду|начну|начинаю) (?:каждый день|ежедневно)\\s+(.*)'));
  if (hab && clean(hab[1])) return habitAdd(clean(hab[1]));

  // C-07: habit archive/restore/delete (createHabit already existed by voice, the rest of the
  // lifecycle — archiveHabit/restoreHabit/deleteHabit — did not)
  const habArchive = t.match(new RegExp(L + '(?:заархивируй|архивируй|останови|убери|приостанови|поставь на паузу|pause|archive)\\s+привычк[ауи]\\s+(.+)'));
  if (habArchive && clean(habArchive[1])) return { kind: 'habitArchive', query: clean(habArchive[1]) };
  const habRestore = t.match(new RegExp(L + '(?:восстанови|верни|возобнови|restore|resume)\\s+привычк[ауи]\\s+(.+)'));
  if (habRestore && clean(habRestore[1])) return { kind: 'habitRestore', query: clean(habRestore[1]) };
  const habDelete = t.match(new RegExp(L + '(?:удали|сотри|delete|remove)\\s+привычк[ауи]\\s+(.+)'));
  if (habDelete && clean(habDelete[1])) return { kind: 'habitDelete', query: clean(habDelete[1]) };

  // goals: «добавь шаг в цель марафон: растяжка», «в цель английский добавь слова»
  const step = t.match(new RegExp(L + '(?:добавь|запиши|создай|новый)? ?(?:шаг|подзадач[ау]|задач[ау]) (?:в|к|для) цел[иья]? ?(.+?)\\s*(?::|—|-|это| шаг )\\s*(.+)'))
    ?? t.match(new RegExp(L + '(?:в|к|для) цел[иья]? (.+?) (?:добавь|запиши|шаг)\\s+(.+)'));
  if (step) return { kind: 'stepAdd', goal: clean(step[1]), text: cap(clean(step[2])) };
  // C-07: goal completion and deadline (updateGoal already existed, not reachable by voice)
  const goalDone = t.match(new RegExp(L + '(?:заверши|закрой|выполнил[аи]?|достиг(?:ла)?)\\s+цель\\s+(.+)'))
    ?? t.match(new RegExp(L + 'цель\\s+(.+?)\\s+(?:завершена|выполнена|достигнута|готова)' + R));
  if (goalDone && clean(goalDone[1])) return { kind: 'goalComplete', query: clean(goalDone[1]) };
  const dl = t.match(new RegExp(L + '(?:поставь|измени|перенеси|сделай)\\s*дедлайн\\s*(?:цели|по цели|для цели)?\\s*(.+?)\\s+на\\s+(.+)'))
    ?? t.match(new RegExp(L + 'дедлайн\\s*(?:цели|по цели)?\\s*(.+?)\\s*(?:—|:|-)\\s*(.+)'));
  if (dl) {
    const { day } = takeDay(dl[2], now);
    if (day) return { kind: 'goalDeadline', query: clean(dl[1]), day };
  }
  // C-07: goal diary and arc oath (saveDiary/saveOath already existed, not reachable by voice)
  const diary = t.match(new RegExp(L + 'дневник(?:е)?\\s*(?:цели|по цели|для цели)?\\s*(.+?)\\s*(?:—|:|-)\\s*(.+)'));
  if (diary && clean(diary[2])) return { kind: 'goalDiary', query: clean(diary[1]), text: cap(clean(diary[2])) };
  const oath = t.match(new RegExp(L + 'клятв[ауы]\\s*(?:арки|на арку)?\\s*(?:—|:|-)\\s*(.+)'));
  if (oath && clean(oath[1])) return { kind: 'arcOath', text: cap(clean(oath[1])) };
  // C-07: quits (addQuit/archiveQuit already exist in state/actions.ts, just weren't reachable by voice)
  const quitStop = t.match(new RegExp(L + '(?:останови|прекрати|убери|заархивируй|удали|архивируй|stop|remove|archive)(?: трекать)?\\s*отказ(?:ы|а)?(?: от)?\\s+(.+)'));
  if (quitStop && clean(quitStop[1])) return { kind: 'quitArchive', query: clean(quitStop[1]) };
  const quitAdd = t.match(new RegExp(L + '(?:добавь|создай|новый|новую|заведи|начни(?: трекать)?|add|new)(?: мне)?\\s*отказ(?:ы|а)?(?: от)?\\s+(.+)'));
  if (quitAdd && clean(quitAdd[1])) {
    // «отказ от Х» names X in genitive («курения», «сладкого») — a small targeted fix for the two
    // most common endings; not a general nominative() fix (B-10 — that's its own, bigger problem)
    const name = clean(quitAdd[1]).replace(/ия$/, 'ие').replace(/ого$/, 'ое');
    return { kind: 'quitAdd', name: cap(name) };
  }
  const goal = t.match(new RegExp(L + '(?:добавь|создай|поставь|новая|новую|заведи|set|add|new)(?: мне)?(?: новую| новая)? (?:цель|goal)\\s*(.*)'))
    ?? t.match(new RegExp('^(?:моя )?(?:цель|goal)\\s*(?:—|-|:|это)\\s*(.+)'));
  if (goal && clean(goal[1])) return { kind: 'goalAdd', title: cap(clean(goal[1])) };
  const wish = t.match(new RegExp('^(?:я )?(?:хочу|мечтаю|планирую|собираюсь|моя цель|цель)\\s+((?:научиться|выучить|пробежать|похудеть|накопить|сбросить|прочитать|бросить|освоить|заработать|сдать|получить|набрать|подтянуть|улучшить|выйти|переехать|найти|запустить|написать|закончить)\\s.+)'));
  if (wish) return { kind: 'goalAdd', title: cap(clean(wish[1])) };

  // move / delete tasks
  const mv = t.match(new RegExp(L + '(?:перенеси|перенести|передвинь|сдвинь|подвинь|отложи|move|reschedule|postpone)\\s+(.*)'));
  if (mv || st('разгрузи|разгрузить|освободи день|clear my day').test(t)) {
    const body = mv ? mv[1] : 'все';
    const { day, rest } = takeDay(body, now);
    const { time, rest: r2 } = takeTime(rest, now);
    const all = !mv || st('все|всё|остальн|невыполнен|незакрыт|хвост|everything|all').test(r2);
    const query = clean(r2.replace(new RegExp(L + '(?:задач[ауи]?|дел[ао]?|событи[ея]|на|все|всё|мой|мои|остальные|невыполненные|незакрытые|сегодняшние|task|tasks|event|everything|all)' + R, 'g'), ' '));
    return { kind: 'taskMove', query, all: all && !query, day: day ?? (time ? null : isoOf(new Date(now.getTime() + 86400000))), time };
  }
  const del = t.match(new RegExp(L + '(?:удали|удалить|убери|сотри|отмени|delete|remove|cancel)\\s+(?:задач[ау]|встреч[ау]|событие|дело|созвон|из план[а-я]*|task|event|meeting)?\\s*(.*)'));
  if (del && clean(del[1]) && !new RegExp('^(?:отметку|галочку)').test(clean(del[1]))) {
    const q = clean(del[1].replace(st('из план[а-я]*|из календар[а-я]*'), ''));
    if (q && st('задач|встреч|событи|дело|созвон|task|event|meeting|план|календар').test(t)) return { kind: 'taskDelete', query: q };
    if (q) return { kind: 'undone', query: q }; // «убери зарядку» = unmark; the runner falls back to tasks
  }

  // unmark
  const un = t.match(new RegExp('^(?:я )?(?:' + UNDO_V + ')\\s+(.*)'));
  if (un && clean(un[1])) return { kind: 'undone', query: clean(un[1].replace(st('привычк[а-я]*|задач[а-я]*'), '')) };

  // add a task (with a command word, or a phrase that names a day or a time)
  const taskM = t.match(new RegExp(L + '(?:' + TASK_V + ')(?:\\s+(?:в план(?:ер)?|в календарь|в расписание|в список|задачу|напоминание|мне|что|чтобы))*\\s+(.+)'));
  const { day, rest } = takeDay(taskM ? taskM[1] : t, now);
  const tm = takeTime(rest, now);
  const markedTime = !!(day || tm.time);
  const hasTaskNoun = st(TASK_N).test(t);
  if ((taskM && !/^(?:поставь|ставь) (?:галочк|отметк|плюс)/.test(t)) || (markedTime && !doneVerb(t)) || (hasTaskNoun && st('добавь|создай|поставь|запиши').test(t))) {
    let title = clean(tm.rest.replace(new RegExp('(?:\\s(?:до|к|на|в|во|с|по|для|at|by|on))+\\s*$'), ' ').replace(new RegExp('^(?:о том(?:,)? что|про|что|чтобы|о|об|мне|в план(?:ер)?|в календарь)' + R, 'g'), ' '));
    title = clean(title.replace(new RegExp(L + '(?:задачу|задача|напоминание|в план(?:ер)?|в календарь)' + R, 'g'), ' '));
    title = clean(title.replace(new RegExp('^(?:(?:а|и|но|у меня|мне|я|нам|у нас|будет|есть|поставить|добавить|записать|запланировать|создать)\\s+)+'), ''));
    if (title && !(taskM === null && title.split(' ').length > 12)) {
      return { kind: 'taskAdd', title: cap(nominative(title)).slice(0, 120), day: day ?? isoOf(now), time: tm.time, end: tm.end };
    }
  }

  // mark done: «сделал зарядку», «выпил 2 стакана воды», «читал 20 минут», «зарядка готова»
  const more = t.match(new RegExp('^(?:ещ[её]|плюс|\\+)\\s+(?:(\\d{1,3})\\s+)?(.+)'));
  if (more && !st('задач|напомни').test(t)) return { kind: 'done', query: clean(more[2].replace(new RegExp(L + '(?:один|одну|раз)' + R, 'g'), ' ')), amount: Number(more[1] ?? 1), minutes: null };
  const doneHit = doneVerb(t);
  const madeIt = t.match(new RegExp('^(.+?)\\s+(?:сделан[аоы]?|выполнен[аоы]?|готов[аоы]?|есть|done|completed)$'));
  if (doneHit || madeIt) {
    let q = doneHit ? doneHit.object : madeIt![1];
    const verb = doneHit?.verb ?? '';
    const dur = q.match(/(\d{1,3})\s*(минут[уы]?|мин|час(?:а|ов)?)/);
    const minutes = dur ? Number(dur[1]) * (dur[2].startsWith('час') ? 60 : 1) : null;
    if (dur) q = q.replace(dur[0], ' ');
    const amountM = q.match(/(?:^|\s)(\d{1,3})(?=\s|$)/);
    const amount = amountM ? Number(amountM[1]) : st('ещ[её] (?:один|одну|стакан|раз)|another').test(t) ? 1 : null;
    if (amountM) q = q.replace(amountM[0], ' ');
    q = clean(q.replace(new RegExp(L + '(?:привычк[а-я]*|задач[а-я]*|шаг|как выполненн[а-я]*|выполненн[а-я]*|сделанн[а-я]*|галочку|отметку|раз|раза|еще|ещ[её]|что|я|уже|над|по|на|в|с)' + R, 'g'), ' '));
    q = clean(q.replace(new RegExp(L + '(?:' + DONE_V + ')' + R, 'g'), ' '));
    // «помедитировал», «пробежал 5 км»: the verb itself names the habit
    const generic = new RegExp('^(?:сделал|сделан|выполнил|выполнен|отмет|закончил|завершил|вычеркн|готов|done|did|complet|finish|mark)').test(verb);
    return { kind: 'done', query: clean(`${q} ${q.split(' ').length <= 2 && !generic ? verb : ''}`) || verb, amount, minutes };
  }

  return { kind: 'guess', query: t };
}

const LEAD = new Set(['я', 'уже', 'только', 'что', 'сегодня', 'сейчас', 'вот', 'тоже', 'наконец', 'утром', 'вечером', 'днем', 'и', 'а', 'все-таки', 'опять', 'снова', 'ещё', 'еще', 'i', 'just', 'already']);
const PAST = /^[а-я]{2,}(?:ал|ял|ил|ел|ул|ыл|ол|ался|ился|ялся|ась|илась|алась)(?:а|и|ся|ась|ись|сь)?$/;
// B-07: «напомнил» is a request about the future («хочу чтобы ты напомнил про тренировку»), not a
// completed habit/task — the generic PAST-tense matcher above was catching it as "done" anyway.
const NOT_DONE = /^(?:хотел|хотела|хотели|должен|должна|забыл|забыла|мог|могла|думал|думала|собирался|собиралась|планировал|сказал|сказала|спросил|просил|начал|начала|стал|стала|был|была|было|устал|устала|напомнил|напомнила|напомнили)$/;
/** a «did it» verb near the start (or at the very end: «воду выпил») and what it was done to */
function doneVerb(t: string): { verb: string; object: string } | null {
  const toks = t.split(' ');
  const isDone = (x: string) => new RegExp('^(?:' + DONE_V + ')$').test(x) || (PAST.test(x) && !NOT_DONE.test(x));
  for (let i = 0; i < Math.min(5, toks.length); i++) {
    if (isDone(toks[i])) return { verb: toks[i], object: toks.slice(i + 1).join(' ') };
    // «поставь галочку на чтении»
    if (/^(?:поставь|ставь|поставить)$/.test(toks[i]) && /^(?:галочк|отметк|плюс)/.test(toks[i + 1] ?? '')) return { verb: '', object: toks.slice(i + 2).join(' ') };
    if (!LEAD.has(toks[i])) break;
  }
  const last = toks[toks.length - 1];
  if (toks.length >= 2 && toks.length <= 5 && isDone(last)) return { verb: last, object: toks.slice(0, -1).join(' ') };
  return null;
}

/** «встречу с Аней» → «встреча с Аней»: the first noun back to the naming form */
function nominative(title: string) {
  return title.replace(/^([а-я]{3,}?)(к|ч|ц|г|н|д|т|л|р|с)у(?=\s|$)/, (m, a, b) => (/(?:ть|ти)$/.test(m) ? m : a + b + 'а'))
    .replace(/^([а-я]{3,})ию(?=\s|$)/, '$1ия');
}

function habitAdd(body: string): Intent {
  // «вода 8 стаканов в день», «читать 20 минут», «отжимания 50 раз»
  const dur = body.match(/(\d{1,3})\s*(минут[уы]?|мин|час(?:а|ов)?)/);
  if (dur) {
    const name = cap(clean(body.replace(dur[0], ' ').replace(st('в день|ежедневно|каждый день|по'), ' ')));
    return { kind: 'habitAdd', name, type: 'duration', target: null, minutes: Number(dur[1]) * (dur[2].startsWith('час') ? 60 : 1), unit: null };
  }
  const cnt = body.match(/(\d{1,3})\s*([а-я]+)?/);
  if (cnt && Number(cnt[1]) > 1) {
    const unit = cnt[2] && !/^(?:в|раз)$/.test(cnt[2]) ? cnt[2] : null;
    const name = cap(clean(body.replace(cnt[0], ' ').replace(st('в день|ежедневно|каждый день|раз|по'), ' '))) || cap(unit ?? '');
    return { kind: 'habitAdd', name, type: 'counter', target: Number(cnt[1]), minutes: null, unit };
  }
  return { kind: 'habitAdd', name: cap(clean(body.replace(st('каждый день|ежедневно|по утрам|по вечерам'), ' '))), type: 'binary', target: null, minutes: null, unit: null };
}

/**
 * Text → intents. Whole phrases that are one command stay whole («задача купить хлеб и молоко»);
 * others split into clauses, and a bare clause after «сделал …» inherits it
 * («сделал зарядку и медитацию» → two habits).
 */
export function understand(raw: string, now = new Date()): Intent[] {
  return understandLower(raw, now).map((it) => restoreCase(it, raw));
}
/** names keep the case they were said with: «с Аней», «отчёт для ВТБ» */
function restoreCase(it: Intent, raw: string): Intent {
  const fix = (s: string) => s.replace(/[а-яa-z]+/gi, (wd, i: number) => {
    const m = raw.match(new RegExp(L + wd.replace(/е/g, '[её]') + R, 'i'));
    const orig = m ? m[0] : wd;
    return i === 0 ? orig[0].toUpperCase() + orig.slice(1) : orig;
  });
  if (it.kind === 'taskAdd') return { ...it, title: fix(it.title) };
  if (it.kind === 'goalAdd') return { ...it, title: fix(it.title) };
  if (it.kind === 'stepAdd') return { ...it, text: fix(it.text) };
  if (it.kind === 'habitAdd') return { ...it, name: fix(it.name) };
  if (it.kind === 'quitAdd') return { ...it, name: fix(it.name) };
  return it;
}
function understandLower(raw: string, now: Date): Intent[] {
  const t = normalize(raw);
  const whole = one(t, now);
  if (!['guess', 'done', 'undone', 'mood'].includes(whole.kind)) return [whole];
  // B-08: «отметь что я позанимался и поставь настроение хорошее» — two different command types
  // joined by «и» used to only split when the *whole* phrase first read as done/undone; extended
  // to mood too, since the same two-commands-in-one-sentence shape happens there as well.
  const parts = splitClauses(t).flatMap((p) => (whole.kind === 'done' || whole.kind === 'undone' || whole.kind === 'mood' ? p.split(/\s+(?:и|а|and)\s+/) : [p])).map(clean).filter(Boolean);
  if (parts.length < 2) return [whole];
  const out: Intent[] = [];
  for (const p of parts) {
    let it = one(p, now);
    const prev = out[out.length - 1];
    if ((it.kind === 'guess' || it.kind === 'unknown') && prev && (prev.kind === 'done' || prev.kind === 'undone')) {
      it = prev.kind === 'done' ? { kind: 'done', query: p, amount: null, minutes: null } : { kind: 'undone', query: p };
    }
    out.push(it);
  }
  return out.every((x) => x.kind === 'guess') ? [whole] : out;
}

/** the old single-intent entry, kept for the tests written against it */
export function parseCommand(raw: string, now = new Date()) { return understand(raw, now)[0]; }
