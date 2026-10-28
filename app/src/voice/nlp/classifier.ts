import raw from './model.json';

/*
 * A small multinomial naive Bayes over character n-grams (2–4, with word edges) and word stems (ТЗ 6.7.3).
 * Classes are the domains of the taxonomy plus «oos» (not for this app). It does not decide anything alone: its
 * probability is mixed into the rule score (decide.ts) and it is what refuses «поставь будильник на семь».
 * The model is trained offline by `npm run train:voice` and committed (≤ 150 KB gzip).
 */
type Model = { v: number; classes: string[]; scale: number; floor: number[]; prior: number[]; feats: string[]; w: string; dv?: string };

export const DOMAIN_OF = (kind: string): string => {
  const d = kind.split('.')[0];
  const MAP: Record<string, string> = {
    holiday: 'date', timer: 'focus', share: 'arc', report: 'arc', referral: 'settings', export: 'settings', account: 'settings', profile: 'settings', info: 'settings',
    feedback: 'support', prefs: 'assistant', repeat: 'assistant', journal: 'assistant', undo: 'assistant', whatsnew: 'assistant', howto: 'assistant', help: 'assistant', demo: 'assistant', unexplored: 'assistant',
    ui: 'nav', wins: 'notes', search: 'notes', template: 'ritual', rule: 'ritual', list: 'plan',
  };
  return MAP[d] ?? d;
};

/** same normalisation as training: lower case, ё → е, digits → #, no punctuation */
export function cleanForModel(text: string) {
  return text.toLowerCase().replace(/ё/g, 'е').replace(/\d+/g, '#').replace(/[^a-zа-я# ]/g, ' ').replace(/\s+/g, ' ').trim();
}
export function featuresOf(text: string): string[] {
  const t = cleanForModel(text);
  const out = new Set<string>();
  for (const w of t.split(' ')) {
    if (!w) continue;
    out.add('w:' + w.slice(0, 6));
    const p = `^${w}$`;
    for (let n = 2; n <= 4; n++) for (let i = 0; i + n <= p.length; i++) out.add(p.slice(i, i + n));
  }
  return [...out];
}

export const OOV_BOOST = 4;
let cache: { index: Map<string, number>; w: Int8Array; m: Model; dv: Set<string> } | null = null;
function load() {
  if (cache) return cache;
  const m = raw as unknown as Model;
  const bin = atob(m.w);
  const w = new Int8Array(bin.length);
  for (let i = 0; i < bin.length; i++) w[i] = (bin.charCodeAt(i) << 24) >> 24;
  cache = { index: new Map(m.feats.map((f, i) => [f, i])), w, m, dv: new Set((m.dv ?? '').split(' ')) };
  return cache;
}

/** probability per class, best first */
export function classify(text: string): { domain: string; p: number }[] {
  const { index, w, m, dv } = load();
  const C = m.classes.length;
  const feats = featuresOf(text);
  const score = new Float64Array(C);
  for (let c = 0; c < C; c++) score[c] = m.prior[c] / m.scale;
  let known = 0;
  for (const f of feats) {
    const i = index.get(f);
    if (i === undefined) { for (let c = 0; c < C; c++) score[c] += m.floor[c] / m.scale; continue; }
    known++;
    for (let c = 0; c < C; c++) score[c] += w[i * C + c] / m.scale;
  }
  // naive Bayes is over-confident: temper by the number of features
  const T = Math.max(1, Math.sqrt(feats.length) * 0.9);
  const max = Math.max(...score);
  let sum = 0;
  const p = Array.from(score, (s) => { const e = Math.exp((s - max) / T); sum += e; return e; });
  void known;
  // words the app's own vocabulary has never seen push towards «not for this app» (names of the person's habits are handled by the parser)
  const words = cleanForModel(text).split(' ').filter((x) => x.length >= 4);
  const oov = words.length ? words.filter((x) => !dv.has(x.slice(0, 6))).length / words.length : 0;
  const oosIdx = m.classes.indexOf('oos');
  const boost = oosIdx >= 0 ? Math.exp(OOV_BOOST * oov * Math.min(words.length, 3) / 3) : 1;
  if (oosIdx >= 0) { sum += p[oosIdx] * (boost - 1); p[oosIdx] *= boost; }
  return m.classes.map((domain, c) => ({ domain, p: p[c] / sum })).sort((a, b) => b.p - a.p);
}
export const pOos = (text: string) => classify(text).find((x) => x.domain === 'oos')?.p ?? 0;
