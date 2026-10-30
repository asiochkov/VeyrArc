import { get, KEYS, set } from './store';

/*
 * Voice 2.0 — feature flags (ТЗ §6.19.1, §6.19.3). Dev/experimental switches only — never gate
 * core functionality. Override with ?flags=lab,localAsr or localStorage veyrarc.flags = {"lab":true}.
 */
export type Flags = {
  /** /dev/voice-lab route + recognition-accuracy harness */
  lab: boolean;
  /** mic input-level meter shown in Voice Lab */
  levelMeter: boolean;
  /** on-device STT instead of Web Speech (spike, off by default) */
  localAsr: boolean;
  /** on-device TTS (Piper) instead of speechSynthesis (spike, off by default) */
  localTts: boolean;
};

const DEFAULTS: Flags = { lab: false, levelMeter: false, localAsr: false, localTts: false };

function fromQuery(): Partial<Flags> {
  if (typeof location === 'undefined') return {};
  const raw = new URLSearchParams(location.search).get('flags');
  if (!raw) return {};
  const on: Partial<Flags> = {};
  for (const name of raw.split(',').map((s) => s.trim())) if (name in DEFAULTS) (on as Record<string, boolean>)[name] = true;
  return on;
}

let cache: Flags | null = null;

export function flags(): Flags {
  if (cache) return cache;
  const stored = get<Partial<Flags>>(KEYS.flags, {});
  const queried = fromQuery();
  cache = { ...DEFAULTS, ...stored, ...queried };
  if (Object.keys(queried).length) set(KEYS.flags, cache); // ?flags=... persists across reloads
  return cache;
}

export function setFlag(name: keyof Flags, on: boolean): void {
  const next = { ...flags(), [name]: on };
  cache = next;
  set(KEYS.flags, next);
}
