/*
 * Times, dates and durations from normalised, number-converted text (ТЗ 6.5.2–6.5.3). Each «take» function finds the
 * first phrase of its kind, returns the value and the text without it. Pure: «now» comes in as a parameter.
 */
const B = '(?<![\\p{L}\\d])';
const E = '(?![\\p{L}\\d])';
const pad = (n: number) => String(n).padStart(2, '0');
export const isoDay = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const at0 = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const addMonths = (d: Date, n: number) => {
  const r = new Date(d.getFullYear(), d.getMonth() + n, 1);
  r.setDate(Math.min(d.getDate(), new Date(r.getFullYear(), r.getMonth() + 1, 0).getDate()));
  return r;
};
const re = (src: string) => new RegExp(src.replace(/\^B/g, B).replace(/\^E/g, E), 'u');
const cut = (s: string, m: RegExpMatchArray) => (s.slice(0, m.index) + ' ' + s.slice((m.index ?? 0) + m[0].length)).replace(/\s+/g, ' ').trim();

/* ---------- time ---------- */
type Pod = 'morning' | 'day' | 'evening' | 'night' | null;
const podOf = (w?: string): Pod => {
  if (!w) return null;
  if (/^утр/.test(w)) return 'morning';
  if (/^дн/.test(w)) return 'day';
  if (/^вечер/.test(w)) return 'evening';
  if (/^ноч/.test(w)) return 'night';
  return null;
};
/** a spoken hour → 0–23 by the part of the day; with none: 1–7 mean the afternoon, 8–11 the morning */
export function hour24(h: number, pod: Pod): number {
  if (h > 24) return h;
  switch (pod) {
    case 'morning': return h === 12 ? 0 : h;
    case 'day': return h === 12 ? 12 : h <= 6 ? h + 12 : h;
    case 'evening': return h < 12 ? h + 12 : h;
    case 'night': return h === 12 ? 0 : h <= 5 ? h : h < 12 ? h + 12 : h;
    default: return h >= 1 && h <= 7 ? h + 12 : h;
  }
}
const hhmm = (h: number, m: number) => `${pad(h)}:${pad(m)}`;
const POD = '(утра|утром|дня|днем|вечера|вечером|ночи|ночью)';
const NUM = '(\\d{1,2})(?:-го)?';
export const PART_OF_DAY: Record<string, string> = { morning: '09:00', day: '14:00', evening: '19:00', night: '22:00' };

export type TimeHit = { time: string; end?: string; date?: string; rel?: boolean; rest: string };
const valid = (h: number, m: number) => h >= 0 && h <= 24 && m >= 0 && m <= 59 && !(h === 24 && m > 0);
const norm24 = (h: number) => (h === 24 ? 0 : h);

export function takeTime(s: string, now: Date): TimeHit | null {
  let m: RegExpMatchArray | null;
  // a range: «с 15 до 16», «с 9 до 11 утра»
  if ((m = s.match(re(`^Bс ${NUM}(?::(\\d{2}))? до ${NUM}(?::(\\d{2}))?(?: ${POD})?^E`)))) {
    const pod = podOf(m[5]);
    const h1 = Number(m[1]), h2 = Number(m[3]);
    const a = hour24(h1, pod), b = hour24(h2, pod);
    // «с 9 до 11» with no part of the day: both by the plain rule; «с 5 до 6» both in the afternoon
    if (valid(a, Number(m[2] ?? 0)) && valid(b, Number(m[4] ?? 0))) return { time: hhmm(norm24(a), Number(m[2] ?? 0)), end: hhmm(norm24(b), Number(m[4] ?? 0)), rest: cut(s, m) };
  }
  // relative: «через 2 часов», «через 40 минут», «через час»
  if ((m = s.match(re('^Bчерез (?:(\\d+) )?(минут\\p{L}*|час\\p{L}*)^E')))) {
    const n = m[1] ? Number(m[1]) : 1;
    if (n >= 1 && n <= 24 * 60) {
      const mins = /^мин/.test(m[2]) ? n : n * 60;
      const t = new Date(now.getTime() + mins * 60000);
      t.setMinutes(Math.round(t.getMinutes() / 5) * 5, 0, 0);
      return { time: hhmm(t.getHours(), t.getMinutes()), date: isoDay(t) !== isoDay(now) ? isoDay(t) : undefined, rel: true, rest: cut(s, m) };
    }
  }
  if ((m = s.match(re('^B(?:в )?полночь^E')))) return { time: '00:00', rest: cut(s, m) };
  if ((m = s.match(re('^B(?:в )?(?:полдень|обед)^E')))) return { time: '12:00', rest: cut(s, m) };
  // «в половине пятого» = 4:30, «в четверть пятого» = 4:15, «без четверти восемь» = 7:45, «без десяти семь» = 6:50
  if ((m = s.match(re(`^B(?:в )?(половине|четверть|без четверти|без (\\d{1,2})) ${NUM}(?: ${POD})?^E`)))) {
    const kind = m[1], hh = Number(m[3]), pod = podOf(m[4]);
    const base = hour24(hh, pod) - 1;
    const mins = kind === 'половине' ? 30 : kind === 'четверть' ? 15 : kind === 'без четверти' ? 45 : 60 - Number(m[2]);
    if (hh >= 1 && hh <= 12 && mins >= 0 && mins < 60 && valid(base, mins)) return { time: hhmm(base, mins), rest: cut(s, m) };
  }
  // «десять минут шестого» = 5:10
  if ((m = s.match(re(`^B(?<!через )(?<!на )(\\d{1,2}) минут ${NUM}(?: ${POD})?^E`)))) {
    const mm = Number(m[1]), hh = Number(m[2]);
    if (mm < 60 && hh >= 1 && hh <= 12) return { time: hhmm(hour24(hh, podOf(m[3])) - 1, mm), rest: cut(s, m) };
  }
  // «в пять с половиной»
  if ((m = s.match(re(`^Bв ${NUM} с половиной(?: ${POD})?^E`)))) {
    const hh = Number(m[1]);
    if (hh >= 1 && hh <= 12) return { time: hhmm(hour24(hh, podOf(m[2])), 30), rest: cut(s, m) };
  }
  // «в 15:30», «в 15 30», «в 9 00», with an optional part of the day
  if ((m = s.match(re(`^Bв (\\d{1,2})(?::| )(\\d{2})(?: ${POD})?^E`)))) {
    const hh = Number(m[1]), mm = Number(m[2]);
    if (valid(hh, mm)) return { time: hhmm(norm24(hh < 13 && podOf(m[3]) ? hour24(hh, podOf(m[3])) : hh), mm), rest: cut(s, m) };
  }
  // «в 15», «в 9 утра»
  if ((m = s.match(re(`^Bв ${NUM}(?: ${POD})?(?! (?:минут|час|дн|недел|месяц|раз))^E`)))) {
    const hh = Number(m[1]);
    if (hh >= 0 && hh <= 24) return { time: hhmm(norm24(hour24(hh, podOf(m[2]))), 0), rest: cut(s, m) };
  }
  if ((m = s.match(re('^B(утром|днем|вечером|ночью)^E')))) return { time: PART_OF_DAY[podOf(m[1])!], rest: cut(s, m) };
  return null;
}

/* ---------- duration ---------- */
export function takeDuration(s: string): { minutes: number; rest: string } | null {
  let m: RegExpMatchArray | null;
  if ((m = s.match(re('^Bна (\\d+) (минут\\p{L}*|час\\p{L}*)^E')))) {
    const n = Number(m[1]);
    return { minutes: /^мин/.test(m[2]) ? n : n * 60, rest: cut(s, m) };
  }
  if ((m = s.match(re('^Bна час^E')))) return { minutes: 60, rest: cut(s, m) };
  return null;
}

/* ---------- dates ---------- */
const WEEKDAYS: [RegExp, number][] = [
  [/^понедельник/, 1], [/^вторник/, 2], [/^сред(?:а|у|ы|е|ой)$/, 3], [/^четверг/, 4], [/^пятниц/, 5], [/^суббот/, 6], [/^воскресень/, 0],
];
const WD = '(понедельник\\p{L}*|вторник\\p{L}*|сред(?:а|у|ы|е|ой)|четверг\\p{L}*|пятниц\\p{L}*|суббот\\p{L}*|воскресень\\p{L}*)';
const MONTHS = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
const wdNum = (w: string) => WEEKDAYS.find(([r]) => r.test(w))?.[1] ?? -1;
/** Monday = 0 … Sunday = 6 */
const mon0 = (d: Date) => (d.getDay() + 6) % 7;

export type DateHit = { date: string; rest: string };

/** the nearest date with this day of month that is today or later */
function nextDom(today: Date, dom: number): Date | null {
  for (let k = 0; k < 14; k++) {
    const d = new Date(today.getFullYear(), today.getMonth() + k, dom);
    if (d.getDate() === dom && d >= today) return d;
  }
  return null;
}

export function takeDate(s: string, now: Date): DateHit | null {
  const today = at0(now);
  const hit = (d: Date, m: RegExpMatchArray): DateHit => ({ date: isoDay(d), rest: cut(s, m) });
  let m: RegExpMatchArray | null;
  if ((m = s.match(re('^Bпослезавтра^E')))) return hit(addDays(today, 2), m);
  if ((m = s.match(re('^Bзавтра^E')))) return hit(addDays(today, 1), m);
  if ((m = s.match(re('^Bсегодня^E')))) return hit(today, m);
  if ((m = s.match(re('^Bчерез (?:(\\d+) )?(день|дня|дней|неделю|недели|недель|месяц|месяца|месяцев)^E')))) {
    const n = m[1] ? Number(m[1]) : 1;
    if (n < 1 || n > 365) return null;
    return hit(/^д/.test(m[2]) ? addDays(today, n) : /^н/.test(m[2]) ? addDays(today, 7 * n) : addMonths(today, n), m);
  }
  if ((m = s.match(re('^Bна следующей неделе^E')))) return hit(addDays(today, 7 - mon0(today)), m);
  if ((m = s.match(re('^Bна выходных?^E')))) return hit(addDays(today, mon0(today) === 6 ? 0 : 5 - mon0(today)), m);
  if ((m = s.match(re('^Bв конце недели^E')))) return hit(addDays(today, mon0(today) <= 4 ? 4 - mon0(today) : 11 - mon0(today)), m);
  if ((m = s.match(re('^Bв начале месяца^E')))) return hit(new Date(today.getFullYear(), today.getMonth() + 1, 1), m);
  if ((m = s.match(re('^Bв конце месяца^E')))) {
    const last = new Date(today.getFullYear(), today.getMonth() + 1, 0);
    return hit(last > today ? last : new Date(today.getFullYear(), today.getMonth() + 2, 0), m);
  }
  if ((m = s.match(re('^Bв середине месяца^E')))) {
    const mid = new Date(today.getFullYear(), today.getMonth(), 15);
    return hit(mid > today ? mid : new Date(today.getFullYear(), today.getMonth() + 1, 15), m);
  }
  // a weekday: the nearest strictly after today; «следующий» pushes it a week on when it is still in this calendar week
  if ((m = s.match(re(`^B(?:(?:в|во|на|до|к) )?(следующ\\p{L}+ )?${WD}^E`)))) {
    const wd = wdNum(m[2]);
    if (wd >= 0) {
      let diff = (wd - today.getDay() + 7) % 7 || 7;
      if (m[1] && mon0(addDays(today, diff)) > mon0(today) && diff < 7 - mon0(today)) diff += 7;
      return hit(addDays(today, diff), m);
    }
  }
  // «5 ноября», «пятого ноября», «25 декабря»: the next such date
  if ((m = s.match(re(`^B(\\d{1,2})(?:-го)? (${MONTHS.join('|')})(?: (\\d{4}))?^E`)))) {
    const day = Number(m[1]), mo = MONTHS.indexOf(m[2]);
    let d = new Date(m[3] ? Number(m[3]) : today.getFullYear(), mo, day);
    if (d.getDate() !== day) return null;
    if (!m[3] && d < today) d = new Date(today.getFullYear() + 1, mo, day);
    return hit(d, m);
  }
  if ((m = s.match(re('^B(\\d{1,2})\\.(\\d{1,2})(?:\\.(\\d{2,4}))?^E')))) {
    const day = Number(m[1]), mo = Number(m[2]) - 1;
    const y = m[3] ? (m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3])) : today.getFullYear();
    let d = new Date(y, mo, day);
    if (mo > 11 || d.getDate() !== day) return null;
    if (!m[3] && d < today) d = new Date(y + 1, mo, day);
    return hit(d, m);
  }
  // only a day of the month: «двадцать девятого»
  if ((m = s.match(re('^B(?:(?:на|до|к|в) )?(\\d{1,2})-го^E')))) {
    const d = nextDom(today, Number(m[1]));
    if (d) return hit(d, m);
  }
  return null;
}
