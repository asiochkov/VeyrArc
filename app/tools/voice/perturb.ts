// Deterministic noise for the golden set (ТЗ 7.2): the kind of damage speech recognition really does.
// Every function is pure; the choice of damage is a hash of (seed, phrase) so the file never changes by itself.
export const hash = (s: string) => { let h = 2166136261; for (const c of s) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };

// near-sounding confusions (word → what a recogniser writes instead)
const CONFUSION: Record<string, string> = {
  'зарядку': 'за рядку', 'зарядка': 'заряд ка', 'медитацию': 'мидитацию', 'медитация': 'мидитация', 'тренировку': 'тренеровку',
  'тренировка': 'тренеровка', 'стоматолог': 'стамотолог', 'встречу': 'встерчу', 'созвон': 'за звон', 'фокус': 'фокос', 'привычку': 'привычьку',
  'настроение': 'настроенье', 'сегодня': 'сегодне', 'завтра': 'завтро', 'послезавтра': 'после завтра', 'перенеси': 'перенеси', 'добавь': 'добавь',
  'отметь': 'отмеь', 'выпил': 'выпил', 'прочитал': 'прочитал', 'пробежал': 'пробежал', 'стакана': 'стакан', 'стаканов': 'стакан', 'цель': 'цел', 'шаг': 'шак',
};
const FILL = ['э', 'ну', 'эм', 'как бы'];
const PREPS = new Set(['в', 'на', 'с', 'к', 'по', 'до', 'за']);

const swapNeighbours = (w: string[], h: number) => { if (w.length < 3) return w; const i = 1 + (h % (w.length - 2)); const o = [...w]; [o[i], o[i + 1]] = [o[i + 1], o[i]]; return o; };
const dropPrep = (w: string[]) => { const i = w.findIndex((x) => PREPS.has(x)); return i < 0 ? w : w.filter((_, j) => j !== i); };
const insertFill = (w: string[], h: number) => { const i = 1 + (h % Math.max(1, w.length - 1)); const o = [...w]; o.splice(i, 0, FILL[h % FILL.length]); return o; };
const confuse = (w: string[]) => w.map((x) => CONFUSION[x] ?? x);
const typo = (w: string[], h: number) => { const i = h % w.length; const x = w[i]; if (x.length < 5) return w; const k = 1 + (h >> 3) % (x.length - 2); const o = [...w]; o[i] = x.slice(0, k) + x.slice(k + 1); return o; };
const yo = (w: string[]) => w.map((x) => x.replace(/е/g, 'ё').replace(/ё/g, (m, o) => (o % 2 ? 'е' : m)));
const glue = (w: string[], h: number) => { if (w.length < 3) return w; const i = h % (w.length - 1); const o = [...w]; o.splice(i, 2, o[i] + o[i + 1]); return o; };
const caseErr = (w: string[]) => w.map((x) => x.replace(/ку$/, 'ка').replace(/у$/, 'а'));

export type Damage = 'confuse' | 'dropPrep' | 'fill' | 'swap' | 'glue' | 'case' | 'typo' | 'yo';
const ALL: Damage[] = ['confuse', 'dropPrep', 'fill', 'swap', 'glue', 'case', 'typo', 'yo'];
export function perturb(text: string, seed: string): { text: string; damage: Damage } | null {
  const h = hash(seed + '|' + text);
  const w0 = text.split(/\s+/);
  for (let a = 0; a < ALL.length; a++) {
    const d = ALL[(h + a) % ALL.length];
    let w: string[];
    switch (d) {
      case 'confuse': w = confuse(w0); break;
      case 'dropPrep': w = dropPrep(w0); break;
      case 'fill': w = insertFill(w0, h); break;
      case 'swap': w = swapNeighbours(w0, h); break;
      case 'glue': w = glue(w0, h); break;
      case 'case': w = caseErr(w0); break;
      case 'typo': w = typo(w0, h); break;
      default: w = yo(w0);
    }
    const out = w.join(' ');
    if (out !== text) return { text: out, damage: d };
  }
  return null;
}
