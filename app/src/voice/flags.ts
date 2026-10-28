import { store } from './store';

/*
 * Feature flags (ТЗ 6.19). Off by default; switched on with «?flags=lab,levelMeter» (kept on this device),
 * «?flags=off» clears them, or by hand: localStorage veyrarc.flags = {"lab":true}.
 *  lab         the Voice Lab page (/dev/voice-lab)
 *  levelMeter  a second microphone stream for the orb's level (off: the orb follows the words)
 *  localAsr    on-device speech recognition engine (only after the owner's phone test)
 *  localTts    on-device voice (same)
 */
export type Flags = { lab: boolean; levelMeter: boolean; localAsr: boolean; localTts: boolean };
const OFF: Flags = { lab: false, levelMeter: false, localAsr: false, localTts: false };
const KEY = 'veyrarc.flags';

function fromUrl(): Partial<Flags> | 'off' | null {
  try {
    const p = new URL(window.location.href).searchParams.get('flags');
    if (!p) return null;
    if (p === 'off') return 'off';
    const names = p.split(',').map((x) => x.trim());
    return Object.fromEntries(names.filter((n) => n in OFF).map((n) => [n, true]));
  } catch { return null; }
}

export function readFlags(): Flags {
  const u = fromUrl();
  if (u === 'off') { store.remove(KEY); return { ...OFF }; }
  const saved = store.get<Partial<Flags>>(KEY, {});
  const merged = { ...OFF, ...saved, ...(u ?? {}) };
  if (u && Object.keys(u).length) store.set(KEY, merged);
  return merged;
}
export const flags: Flags = readFlags();
