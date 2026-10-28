import { create } from 'zustand';
import { store } from './store';

/* The assistant's personal settings, on this device only (ТЗ 6.14). Every change goes through set(). */
export type Prefs = {
  v: 1;
  sound: boolean; // earcons
  muted: boolean; // no speech (signals stay)
  voiceURI: string | null;
  rate: number; // 0.8 … 1.4
  style: 'brief' | 'normal' | 'detailed';
  tone: 'soft' | 'neutral' | 'strict';
  name: string | null; // what the person calls the assistant
  speakLists: boolean;
  praise: boolean;
  dictator: boolean; // say the result of every action
  autoLang: boolean; // answer in the language of the phrase
  aliases: { alias: string; target: string }[];
  macros: { trigger: string; phrases: string[] }[];
  rituals: { name: string; steps: string[] }[];
  templates: { name: string; items: { title: string; time?: string; ends?: string }[] }[];
  chains: { after: string; say: string }[];
  rules: { when: string; say: string }[];
  shareText: boolean; // «Help improve the assistant»: phrase text goes into telemetry
  care: boolean; // gentle messages
  allowLinks: boolean; // run harmless commands from ?say= links
  alwaysLinks: boolean;
  localAsr: boolean; // on-device recognition (only where supported)
  focusNorm: number | null; // daily focus norm, minutes
  dailyLimit: number | null; // «no more than N tasks a day»
  careShownAt: string | null;
};
export const DEFAULT_PREFS: Prefs = {
  v: 1, sound: true, muted: false, voiceURI: null, rate: 1, style: 'normal', tone: 'neutral', name: null, speakLists: false, praise: true, dictator: false, autoLang: false,
  aliases: [], macros: [], rituals: [], templates: [], chains: [], rules: [], shareText: false, care: true, allowLinks: false, alwaysLinks: false, localAsr: false,
  focusNorm: null, dailyLimit: null, careShownAt: null,
};
const KEY = 'prefs.v1';
const load = (): Prefs => ({ ...DEFAULT_PREFS, ...store.get<Partial<Prefs>>(KEY, {}), v: 1 });

type S = Prefs & { set: (p: Partial<Prefs>) => void; reset: () => void };
export const usePrefs = create<S>((set, get) => ({
  ...load(),
  set: (p) => { set(p); const { set: _s, reset: _r, ...rest } = get(); store.set(KEY, rest); },
  reset: () => { store.remove(KEY); set({ ...DEFAULT_PREFS }); },
}));
export const prefs = (): Prefs => { const { set: _s, reset: _r, ...rest } = usePrefs.getState(); return rest; };
