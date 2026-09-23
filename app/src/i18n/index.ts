import { create } from 'zustand';
import { en } from './en';
import { ru, type Dict, type Plural } from './ru';

export type Lang = 'ru' | 'en';

const STORAGE_KEY = 'ww.lang'; // same key the design prototypes use
const DICTS: Record<Lang, Dict> = { ru, en };

function readLang(): Lang {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'en' ? 'en' : 'ru';
  } catch {
    return 'ru';
  }
}

type LangState = {
  lang: Lang;
  fading: boolean;
  setLang: (l: Lang) => void;
};

/* Cross-fade 150ms, as in VeyrArc Settings.dc.html setLang(). */
export const useLangStore = create<LangState>((set, get) => ({
  lang: readLang(),
  fading: false,
  setLang: (l) => {
    if (l === get().lang) return;
    set({ fading: true });
    setTimeout(() => {
      try {
        localStorage.setItem(STORAGE_KEY, l);
      } catch {
        /* storage unavailable: keep in memory */
      }
      document.documentElement.lang = l;
      set({ lang: l, fading: false });
    }, 150);
  },
}));

type Leaf = string | readonly string[] | Plural;
type Paths<T, P extends string = ''> = {
  [K in keyof T & string]: T[K] extends Leaf
    ? `${P}${K}`
    : Paths<T[K], `${P}${K}.`>;
}[keyof T & string];

export type TKey = Paths<Dict>;
type Vars = Record<string, string | number>;

function lookup(dict: Dict, key: string): Leaf | undefined {
  let cur: unknown = dict;
  for (const part of key.split('.')) {
    if (cur == null || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[part];
  }
  return cur as Leaf | undefined;
}

function fill(s: string, vars?: Vars) {
  if (!vars) return s;
  return s.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m));
}

const pluralRules: Record<Lang, Intl.PluralRules> = {
  ru: new Intl.PluralRules('ru-RU'),
  en: new Intl.PluralRules('en-US'),
};

function isPlural(v: Leaf): v is Plural {
  return typeof v === 'object' && !Array.isArray(v) && 'other' in v;
}

export function translate(lang: Lang, key: TKey, vars?: Vars): string {
  const v = lookup(DICTS[lang], key) ?? lookup(DICTS.ru, key);
  if (v == null) return key;
  if (typeof v === 'string') return fill(v, vars);
  if (isPlural(v)) {
    const n = Number(vars?.n ?? 0);
    const cat = pluralRules[lang].select(n) as keyof Plural;
    return fill(v[cat] ?? v.other, vars);
  }
  return key;
}

export function translateList(lang: Lang, key: TKey): readonly string[] {
  const v = lookup(DICTS[lang], key);
  return Array.isArray(v) ? v : [];
}

export type Bilingual = { ru: string; en: string };

export function useT() {
  const lang = useLangStore((s) => s.lang);
  const t = (key: TKey, vars?: Vars) => translate(lang, key, vars);
  t.list = (key: TKey) => translateList(lang, key);
  t.lang = lang;
  /* user content that exists in both languages (mock / seed data) */
  t.pick = (v: Bilingual) => v[lang];
  /* "3ч20" / "3h20", "4ч", "40м" — the compact duration format used across the design */
  t.hm = (minutes: number) => {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    if (h && m) return translate(lang, 'units.hm', { h, m });
    if (h) return translate(lang, 'units.h', { h });
    return translate(lang, 'units.m', { m });
  };
  return t;
}
export type T = ReturnType<typeof useT>;

const LOCALE: Record<Lang, string> = { ru: 'ru-RU', en: 'en-US' };

/* Dates and numbers follow the language, not just the labels (audit §3). */
export function formatDate(lang: Lang, d: Date, opts: Intl.DateTimeFormatOptions) {
  return new Intl.DateTimeFormat(LOCALE[lang], opts).format(d);
}

export function formatNumber(lang: Lang, n: number) {
  return new Intl.NumberFormat(LOCALE[lang]).format(n);
}
