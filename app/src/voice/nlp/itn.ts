/*
 * Number words → digits (ТЗ 6.5.1), Russian. Works on normalised text. Cardinals 0–999 and thousands, the genitive forms used
 * in «с девяти до одиннадцати» / «без пяти девять», ordinals in the genitive («пятого», «двадцать девятого») as «5-го», and
 * the fixed phrases «полчаса», «полтора часа», «пару часов», «десяток». Pure.
 */
const UNITS: Record<string, number> = {
  ноль: 0, нуля: 0, один: 1, одна: 1, одну: 1, одно: 1, одного: 1, два: 2, две: 2, двух: 2, три: 3, трех: 3, четыре: 4, четырех: 4, пять: 5, пяти: 5, шесть: 6, шести: 6,
  семь: 7, семи: 7, восемь: 8, восьми: 8, девять: 9, девяти: 9, десять: 10, десяти: 10, одиннадцать: 11, одиннадцати: 11, двенадцать: 12, двенадцати: 12,
  тринадцать: 13, тринадцати: 13, четырнадцать: 14, четырнадцати: 14, пятнадцать: 15, пятнадцати: 15, шестнадцать: 16, шестнадцати: 16,
  семнадцать: 17, семнадцати: 17, восемнадцать: 18, восемнадцати: 18, девятнадцать: 19, девятнадцати: 19,
};
const TENS: Record<string, number> = {
  двадцать: 20, двадцати: 20, тридцать: 30, тридцати: 30, сорок: 40, сорока: 40, пятьдесят: 50, пятидесяти: 50, шестьдесят: 60, шестидесяти: 60,
  семьдесят: 70, семидесяти: 70, восемьдесят: 80, восьмидесяти: 80, девяносто: 90, девяноста: 90,
};
const HUNDS: Record<string, number> = {
  сто: 100, ста: 100, двести: 200, двухсот: 200, триста: 300, трехсот: 300, четыреста: 400, четырехсот: 400, пятьсот: 500, пятисот: 500,
  шестьсот: 600, шестисот: 600, семьсот: 700, семисот: 700, восемьсот: 800, восьмисот: 800, девятьсот: 900, девятисот: 900,
};
/** genitive ordinals: the day of the month and «половине пятого» */
const ORD_UNITS: Record<string, number> = {
  первого: 1, второго: 2, третьего: 3, четвертого: 4, пятого: 5, шестого: 6, седьмого: 7, восьмого: 8, девятого: 9, десятого: 10, одиннадцатого: 11,
  двенадцатого: 12, тринадцатого: 13, четырнадцатого: 14, пятнадцатого: 15, шестнадцатого: 16, семнадцатого: 17, восемнадцатого: 18, девятнадцатого: 19,
};
// the neuter nominative is what people say before a month: «на пятое ноября»
Object.assign(ORD_UNITS, { первое: 1, второе: 2, третье: 3, четвертое: 4, пятое: 5, шестое: 6, седьмое: 7, восьмое: 8, девятое: 9, десятое: 10, одиннадцатое: 11, двенадцатое: 12, тринадцатое: 13, четырнадцатое: 14, пятнадцатое: 15, шестнадцатое: 16, семнадцатое: 17, восемнадцатое: 18, девятнадцатое: 19 });
const ORD_TENS: Record<string, number> = { двадцатого: 20, тридцатого: 30, двадцатое: 20, тридцатое: 30 };
const THOUS = /^тысяч(?:а|и|у|е)?$/;

type Hit = { value: number; next: number; ord: boolean };

/** reads one number (< 1000, optionally × thousand) starting at token i */
function read(t: string[], i: number): Hit | null {
  const seg = (j: number): { v: number; next: number; ord: boolean; any: boolean } => {
    let v = 0, any = false, ord = false;
    if (HUNDS[t[j]] !== undefined) { v += HUNDS[t[j]]; j++; any = true; }
    if (TENS[t[j]] !== undefined) {
      v += TENS[t[j]]; j++; any = true;
      if (ORD_UNITS[t[j]] !== undefined && ORD_UNITS[t[j]] < 10) { v += ORD_UNITS[t[j]]; j++; ord = true; }
      else if (UNITS[t[j]] !== undefined && UNITS[t[j]] >= 1 && UNITS[t[j]] < 10) { v += UNITS[t[j]]; j++; }
    } else if (ORD_TENS[t[j]] !== undefined) { v += ORD_TENS[t[j]]; j++; any = true; ord = true; }
    else if (ORD_UNITS[t[j]] !== undefined) { v += ORD_UNITS[t[j]]; j++; any = true; ord = true; }
    else if (UNITS[t[j]] !== undefined && !(any && UNITS[t[j]] === 0)) { v += UNITS[t[j]]; j++; any = true; }
    return { v, next: j, ord, any };
  };
  const a = seg(i);
  if (a.any && !a.ord && t[a.next] === 'с' && t[a.next + 1] === 'половиной' && THOUS.test(t[a.next + 2] ?? '')) return { value: a.v * 1000 + 500, next: a.next + 3, ord: false };
  if (a.any && THOUS.test(t[a.next] ?? '') && !a.ord) {
    const b = seg(a.next + 1);
    return { value: a.v * 1000 + (b.any ? b.v : 0), next: b.any ? b.next : a.next + 1, ord: false };
  }
  if (!a.any && THOUS.test(t[i] ?? '')) {
    const b = seg(i + 1);
    return { value: 1000 + (b.any ? b.v : 0), next: b.any ? b.next : i + 1, ord: false };
  }
  return a.any ? { value: a.v, next: a.next, ord: a.ord } : null;
}

export function wordsToDigits(text: string): string {
  let s = text;
  // fixed phrases first
  s = s.replace(/(?<![\p{L}\d])ноль ноль(?![\p{L}\d])/gu, '00')
    .replace(/(?<![\p{L}\d])полчаса(?![\p{L}\d])/gu, '30 минут')
    .replace(/(?<![\p{L}\d])полтора часа(?![\p{L}\d])/gu, '90 минут')
    .replace(/(?<![\p{L}\d])полторы тысячи(?![\p{L}\d])/gu, '1500')
    .replace(/(?<![\p{L}\d])пару (?=час|минут|стакан)/gu, '2 ')
    .replace(/(?<![\p{L}\d])десяток(?![\p{L}\d])/gu, '10');
  const t = s.split(' ');
  const out: string[] = [];
  for (let i = 0; i < t.length;) {
    const h = read(t, i);
    if (!h) { out.push(t[i]); i++; continue; }
    out.push(h.ord ? `${h.value}-го` : String(h.value));
    i = h.next;
  }
  s = out.join(' ');
  // «два с половиной часа» → minutes; «две с половиной тысячи» → 2500
  s = s.replace(/(\d+) с половиной час\p{L}*/gu, (_m, n) => `${Number(n) * 60 + 30} минут`)
    .replace(/(\d+) с половиной тысяч\p{L}*/gu, (_m, n) => String(Number(n) * 1000 + 500));
  return s;
}
