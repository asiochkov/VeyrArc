import { create } from 'zustand';
import { get, KEYS, set as storeSet } from './store';

/*
 * Voice 2.0 — assistant preferences (ТЗ §6.13.3, §6.14). Persisted to localStorage under
 * veyrarc.voice.prefs.v1; every field has a safe default so a corrupted/missing record never breaks the UI.
 */
export type Alias = { alias: string; target: string };
export type Macro = { trigger: string; phrases: string[] };
export type Chain = { after: string; say: string };
export type Ritual = { name: string; steps: string[] };
export type Template = { name: string; items: { title: string; time?: string; ends?: string }[] };
export type Tone = 'soft' | 'neutral' | 'strict';

export type VoicePrefs = {
  muted: boolean;
  sound: boolean; // earcons (6.12)
  rate: number; // 0.8–1.4 (6.11.5)
  tone: Tone;
  aliases: Alias[];
  macros: Macro[]; // max 30
  chains: Chain[];
  rituals: Ritual[];
  templates: Template[]; // max 30
  care: boolean; // gentle-tone layer on sensitive topics, default on (6.10.2 #91)
  shareText: boolean; // "помочь улучшить ассистента" — opt-in text telemetry (6.15)
};

export const DEFAULT_PREFS: VoicePrefs = {
  muted: false,
  sound: true,
  rate: 1.04, // matches the rate engine.ts hardcoded before it was wired to this pref
  tone: 'neutral',
  aliases: [],
  macros: [],
  chains: [],
  rituals: [],
  templates: [],
  care: true,
  shareText: false,
};

function persist(p: VoicePrefs) { storeSet(KEYS.prefs, p); }

export const usePrefs = create<{ prefs: VoicePrefs; update: (patch: Partial<VoicePrefs>) => void }>((setState) => ({
  prefs: { ...DEFAULT_PREFS, ...get<Partial<VoicePrefs>>(KEYS.prefs, {}) },
  update: (patch) => setState((st) => {
    const prefs = { ...st.prefs, ...patch };
    persist(prefs);
    return { prefs };
  }),
}));
