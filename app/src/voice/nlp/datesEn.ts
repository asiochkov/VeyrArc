import { hour24, isoDay, type DateHit, type TimeHit } from './dates';

/* English times, dates and durations (the same contract as dates.ts), on normalised text with numbers as digits. Pure. */
const B = '(?<![\\p{L}\\d])';
const E = '(?![\\p{L}\\d])';
const pad = (n: number) => String(n).padStart(2, '0');
const re = (src: string) => new RegExp(src.replace(/\^B/g, B).replace(/\^E/g, E), 'u');
const cut = (s: string, m: RegExpMatchArray) => (s.slice(0, m.index) + ' ' + s.slice((m.index ?? 0) + m[0].length)).replace(/\s+/g, ' ').trim();
const at0 = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const addMonths = (d: Date, n: number) => { const r = new Date(d.getFullYear(), d.getMonth() + n, 1); r.setDate(Math.min(d.getDate(), new Date(r.getFullYear(), r.getMonth() + 1, 0).getDate())); return r; };
const mon0 = (d: Date) => (d.getDay() + 6) % 7;
const hhmm = (h: number, m: number) => `${pad(h)}:${pad(m)}`;

type Pod = 'morning' | 'day' | 'evening' | 'night' | null;
const MER = '(am|pm|a m|p m|in the morning|in the afternoon|in the evening|at night|tonight)';
const meridiem = (w?: string): Pod => (!w ? null : /^(?:am|a m|in the morning)$/.test(w) ? 'morning' : /^(?:pm|p m|in the afternoon)$/.test(w) ? 'day' : /^(?:in the evening|tonight)$/.test(w) ? 'evening' : /night/.test(w) ? 'night' : null);
const h24 = (h: number, pod: Pod, w?: string) => (w === 'pm' || w === 'p m' ? (h === 12 ? 12 : h + 12) : w === 'am' || w === 'a m' ? (h === 12 ? 0 : h) : hour24(h, pod));

export function takeTimeEn(s: string, now: Date): TimeHit | null {
  let m: RegExpMatchArray | null;
  if ((m = s.match(re(`^Bfrom (\\d{1,2})(?::(\\d{2}))? to (\\d{1,2})(?::(\\d{2}))?(?: ${MER})?^E`)))) {
    const w = m[5], p = meridiem(w);
    return { time: hhmm(h24(Number(m[1]), p, w) % 24, Number(m[2] ?? 0)), end: hhmm(h24(Number(m[3]), p, w) % 24, Number(m[4] ?? 0)), rest: cut(s, m) };
  }
  if ((m = s.match(re('^Bin (?:(\\d+) )?(minutes?|hours?)^E')))) {
    const n = m[1] ? Number(m[1]) : 1;
    const t = new Date(now.getTime() + (/^min/.test(m[2]) ? n : n * 60) * 60000);
    t.setMinutes(Math.round(t.getMinutes() / 5) * 5, 0, 0);
    return { time: hhmm(t.getHours(), t.getMinutes()), date: isoDay(t) !== isoDay(now) ? isoDay(t) : undefined, rel: true, rest: cut(s, m) };
  }
  if ((m = s.match(re('^B(?:at )?midnight^E')))) return { time: '00:00', rest: cut(s, m) };
  if ((m = s.match(re('^B(?:at )?noon^E')))) return { time: '12:00', rest: cut(s, m) };
  if ((m = s.match(re('^B(?:at )?(?:half past|quarter past|quarter to|(\\d{1,2}) (?:minutes? )?(past|to)) (\\d{1,2})(?: ' + MER + ')?^E')))) {
    const kind = m[0].match(/half past|quarter past|quarter to/)?.[0];
    const hh = Number(m[3]), w = m[4];
    const mins = kind === 'half past' ? 30 : kind === 'quarter past' ? 15 : kind === 'quarter to' ? 45 : m[2] === 'past' ? Number(m[1]) : 60 - Number(m[1]);
    const toward = kind === 'quarter to' || m[2] === 'to';
    const base = h24(hh, meridiem(w), w) - (toward ? 1 : 0);
    return { time: hhmm(((base % 24) + 24) % 24, mins), rest: cut(s, m) };
  }
  if ((m = s.match(re(`^B(?:at )?(\\d{1,2})(?::(\\d{2}))?(?: ${MER})?^E`)))) {
    const hh = Number(m[1]), mm = Number(m[2] ?? 0), w = m[3];
    const hasAt = /(?:^|[^\p{L}])at \d/u.test(m[0]) || m[0].startsWith('at') || !!w || !!m[2];
    if (hasAt && hh <= 24 && mm < 60 && !(s.slice((m.index ?? 0) + m[0].length).match(/^ (?:minutes?|hours?|days?|weeks?|times)/))) return { time: hhmm(h24(hh, meridiem(w), w) % 24, mm), rest: cut(s, m) };
  }
  if ((m = s.match(re('^B(?:in the |this )(morning|afternoon|evening)^E')))) return { time: m[1] === 'morning' ? '09:00' : m[1] === 'afternoon' ? '14:00' : '19:00', rest: cut(s, m) };
  return null;
}

export function takeDurationEn(s: string): { minutes: number; rest: string } | null {
  let m: RegExpMatchArray | null;
  if ((m = s.match(re('^B(?:for|by) (\\d+) (minutes?|hours?)^E')))) return { minutes: /^min/.test(m[2]) ? Number(m[1]) : Number(m[1]) * 60, rest: cut(s, m) };
  if ((m = s.match(re('^Bfor 1 (?:hour|minute)^E')))) return { minutes: 60, rest: cut(s, m) };
  return null;
}

const DAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
const WD = `(${DAYS.join('|')})`;

export function takeDateEn(s: string, now: Date): DateHit | null {
  const today = at0(now);
  const hit = (d: Date, m: RegExpMatchArray): DateHit => ({ date: isoDay(d), rest: cut(s, m) });
  let m: RegExpMatchArray | null;
  if ((m = s.match(re('^Bday after tomorrow^E')))) return hit(addDays(today, 2), m);
  if ((m = s.match(re('^Btomorrow^E')))) return hit(addDays(today, 1), m);
  if ((m = s.match(re('^Btoday^E')))) return hit(today, m);
  if ((m = s.match(re('^Byesterday^E')))) return hit(addDays(today, -1), m);
  if ((m = s.match(re('^Bin (?:(\\d+) |an? )?(days?|weeks?|months?)^E')))) {
    const n = m[1] ? Number(m[1]) : 1;
    if (n < 1 || n > 365) return null;
    return hit(/^d/.test(m[2]) ? addDays(today, n) : /^w/.test(m[2]) ? addDays(today, 7 * n) : addMonths(today, n), m);
  }
  if ((m = s.match(re('^B(?:on |for )?next week^E')))) return hit(addDays(today, 7 - mon0(today)), m);
  if ((m = s.match(re('^B(?:on |for |this )?(?:the )?weekend^E')))) return hit(addDays(today, mon0(today) === 6 ? 0 : 5 - mon0(today)), m);
  if ((m = s.match(re('^B(?:by |at |on )?(?:the )?end of (?:the |this )?week^E')))) return hit(addDays(today, mon0(today) <= 4 ? 4 - mon0(today) : 11 - mon0(today)), m);
  if ((m = s.match(re('^B(?:by |at |on )?(?:the )?(?:start|beginning) of (?:the |next )?month^E')))) return hit(new Date(today.getFullYear(), today.getMonth() + 1, 1), m);
  if ((m = s.match(re('^B(?:by |at |on )?(?:the )?end of (?:the |this )?month^E')))) {
    const last = new Date(today.getFullYear(), today.getMonth() + 1, 0);
    return hit(last > today ? last : new Date(today.getFullYear(), today.getMonth() + 2, 0), m);
  }
  if ((m = s.match(re('^B(?:in |at |by )?(?:the )?middle of (?:the |this )?month^E')))) {
    const mid = new Date(today.getFullYear(), today.getMonth(), 15);
    return hit(mid > today ? mid : new Date(today.getFullYear(), today.getMonth() + 1, 15), m);
  }
  if ((m = s.match(re(`^B(?:(?:on|by|before|until) )?(next )?${WD}^E`)))) {
    const wd = DAYS.indexOf(m[2]);
    let diff = (wd - today.getDay() + 7) % 7 || 7;
    if (m[1] && mon0(addDays(today, diff)) > mon0(today) && diff < 7 - mon0(today)) diff += 7;
    return hit(addDays(today, diff), m);
  }
  const mo = MONTHS.join('|');
  let d: RegExpMatchArray | null;
  if ((d = s.match(re(`^B(?:on )?(?:the )?(\\d{1,2})(?:th)?(?: of)? (${mo})(?: (\\d{4}))?^E`))) || (d = s.match(re(`^B(?:on )?(${mo}) (?:the )?(\\d{1,2})(?:th)?(?: (\\d{4}))?^E`)))) {
    const day = Number(/^\d/.test(d[1]) ? d[1] : d[2]), mi = MONTHS.indexOf(/^\d/.test(d[1]) ? d[2] : d[1]);
    let dt = new Date(d[3] ? Number(d[3]) : today.getFullYear(), mi, day);
    if (dt.getDate() !== day) return null;
    if (!d[3] && dt < today) dt = new Date(today.getFullYear() + 1, mi, day);
    return hit(dt, d);
  }
  return null;
}
