import { create } from 'zustand';
import { hasBackend } from '../../lib/supabase';
import type { IconName } from '../../ui/Icon';

/*
 * Cross-screen state of the auth / onboarding flow (VeyrArc Auth.dc.html `state`).
 * Stage 3 moves persistence to Supabase (anonymous session → linked account).
 */
export type Screen = 'welcome' | 'onboarding' | 'final' | 'home' | 'signup' | 'otp' | 'login' | 'reset' | 'account';
export const ORDER: Screen[] = ['welcome', 'onboarding', 'final', 'home', 'signup', 'otp', 'login', 'reset', 'account'];

export type L = { ru: string; en: string };
export type DirId = 'body' | 'mind' | 'disc' | 'prod' | 'quit';
export const DIR_ICONS: Record<DirId, IconName> = { body: 'dirBody', mind: 'dirMind', disc: 'dirDisc', prod: 'dirProd', quit: 'dirQuit' };
const h = (ru: string, en: string): L => ({ ru, en });
export const DIRS: [DirId, L[]][] = [
  ['body', [h('Вода 8 стаканов', 'Water 8 glasses'), h('Сон до 23:00', 'Sleep by 23:00'), h('Холодный душ', 'Cold shower'), h('Прогулка 30 мин', '30-min walk')]],
  ['mind', [h('Чтение 20 мин', 'Reading 20 min'), h('Медитация', 'Meditation'), h('Дневник', 'Journal'), h('10 новых слов', '10 new words')]],
  ['disc', [h('Ранний подъём', 'Early rise'), h('Заправить кровать', 'Make the bed'), h('План на день', 'Daily plan'), h('Без телефона утром', 'No phone in the morning')]],
  ['prod', [h('Глубокая работа 90 мин', 'Deep work 90 min'), h('Одна главная задача', 'One key task'), h('Разбор входящих', 'Inbox zero'), h('Итоги дня', 'Day review')]],
  ['quit', [h('Без сахара', 'No sugar'), h('Без соцсетей до сна', 'No social media before bed'), h('Без сигарет', 'No cigarettes'), h('Без фастфуда', 'No fast food')]],
];
export const DEFAULT_HOME = [h('Вода 8 стаканов', 'Water 8 glasses'), h('Чтение 20 мин', 'Reading 20 min'), h('Ранний подъём', 'Early rise')];
export const TIME_OPTS: [string, 'early' | 'morning' | 'day' | 'evening' | 'bed'][] = [['07:00', 'early'], ['08:00', 'morning'], ['09:00', 'morning'], ['13:00', 'day'], ['20:00', 'evening'], ['21:30', 'bed']];

type Fields = { first: string; last: string; email: string; pw: string; lemail: string; lpw: string; remail: string; npw: string; npw2: string; pname: string; nick: string };

type Flow = {
  prev: Screen | null;
  dir: 1 | -1;
  enter: (s: Screen) => void;
  f: Fields;
  setF: (k: keyof Fields, v: string) => void;
  habits: string[]; // ru labels as ids
  toggleHabit: (id: string) => void;
  time: string;
  setTime: (t: string) => void;
  perm: boolean;
  setPerm: (v: boolean) => void;
  plan: 'free' | 'pro';
  setPlan: (p: 'free' | 'pro') => void;
  /* backend: which email confirmation is pending (sign-up or guest linking) */
  pending: { kind: 'signup' | 'link'; email: string; pw: string } | null;
  setPending: (p: Flow['pending']) => void;
  /* backend: onboarding items saved as habits / quits, keyed by the RU label */
  created: Record<string, { kind: 'habit' | 'quit'; id: string }>;
  setCreated: (c: Flow['created']) => void;
};

export const useFlow = create<Flow>((set, get) => ({
  prev: null,
  dir: 1,
  enter: (s) => {
    const prev = get().prev;
    const dir = prev == null || ORDER.indexOf(s) >= ORDER.indexOf(prev) ? 1 : -1;
    set({ prev: s, dir });
  },
  f: { first: '', last: '', email: '', pw: '', lemail: '', lpw: '', remail: '', npw: '', npw2: '', pname: hasBackend ? '' : 'Анна', nick: '' },
  setF: (k, v) => set((st) => ({ f: { ...st.f, [k]: v } })),
  habits: [],
  toggleHabit: (id) => set((st) => ({ habits: st.habits.includes(id) ? st.habits.filter((x) => x !== id) : [...st.habits, id] })),
  time: '08:00',
  setTime: (time) => set({ time }),
  perm: false,
  setPerm: (perm) => set({ perm }),
  plan: 'free',
  setPlan: (plan) => set({ plan }),
  pending: null,
  setPending: (pending) => set({ pending }),
  created: {},
  setCreated: (created) => set({ created }),
}));

export const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function strength(pw: string) {
  if (!pw) return 0;
  let n = pw.length >= 8 ? 1 : 0;
  if (n && /\d/.test(pw) && /[A-Za-zА-Яа-я]/.test(pw)) n = 2;
  if (n === 2 && pw.length >= 10 && (/[^A-Za-z0-9А-Яа-я]/.test(pw) || /[A-ZА-Я]/.test(pw))) n = 3;
  return n;
}
