/* English number words → digits (ТЗ 6.5, EN parity): 0–999 and thousands, «a couple», «half an hour», «an hour and a half». Pure. */
const U: Record<string, number> = { zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19 };
const T: Record<string, number> = { twenty: 20, thirty: 30, forty: 40, fourty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90 };
const O: Record<string, number> = { first: 1, second: 2, third: 3, fourth: 4, fifth: 5, sixth: 6, seventh: 7, eighth: 8, ninth: 9, tenth: 10, eleventh: 11, twelfth: 12, thirteenth: 13, fourteenth: 14, fifteenth: 15, sixteenth: 16, seventeenth: 17, eighteenth: 18, nineteenth: 19, twentieth: 20, thirtieth: 30 };

function read(t: string[], i: number): { v: number; next: number; ord: boolean } | null {
  let v = 0, j = i, any = false, ord = false;
  const seg = () => {
    let s = 0, got = false;
    if (U[t[j]] !== undefined && t[j + 1] === 'hundred') { s += U[t[j]] * 100; j += 2; got = true; if (t[j] === 'and' && (U[t[j + 1]] !== undefined || T[t[j + 1]] !== undefined)) j++; }
    if (T[t[j]] !== undefined) { s += T[t[j]]; j++; got = true; if (U[t[j]] !== undefined && U[t[j]] > 0 && U[t[j]] < 10) { s += U[t[j]]; j++; } else if (O[t[j]] !== undefined && O[t[j]] < 10) { s += O[t[j]]; j++; ord = true; } }
    else if (O[t[j]] !== undefined) { s += O[t[j]]; j++; got = true; ord = true; }
    else if (U[t[j]] !== undefined) { s += U[t[j]]; j++; got = true; }
    return { s, got };
  };
  const a = seg();
  if (!a.got) return null;
  any = true; v = a.s;
  if (t[j] === 'thousand' && !ord) { v *= 1000; j++; const b = seg(); if (b.got) v += b.s; }
  return any ? { v, next: j, ord } : null;
}

export function wordsToDigitsEn(text: string): string {
  let s = text
    .replace(/(?<![\p{L}\d])half an hour(?![\p{L}\d])/gu, '30 minutes')
    .replace(/(?<![\p{L}\d])an hour and a half(?![\p{L}\d])/gu, '90 minutes')
    .replace(/(?<![\p{L}\d])(?:a )?couple of (?=minutes|hours|glasses|cups)/gu, '2 ')
    .replace(/(?<![\p{L}\d])a couple (?=minutes|hours)/gu, '2 ')
    .replace(/(?<![\p{L}\d])(?:an|a) (?=hour|minute|glass|cup)/gu, '1 ')
    .replace(/(?<![\p{L}\d])noon(?![\p{L}\d])/gu, 'noon');
  const t = s.split(' ');
  const out: string[] = [];
  for (let i = 0; i < t.length;) {
    const h = read(t, i);
    if (!h) { out.push(t[i]); i++; continue; }
    out.push(h.ord ? `${h.v}th` : String(h.v));
    i = h.next;
  }
  s = out.join(' ');
  return s.replace(/(\d+) and a half (hours?)/g, (_m, n) => `${Number(n) * 60 + 30} minutes`).replace(/(\d+)(?:st|nd|rd)(?![\p{L}\d])/gu, '$1th');
}
