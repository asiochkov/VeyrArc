/*
 * Voice 2.0 — generic localStorage read/write for the assistant (ТЗ §6.14).
 * Every voice-local key goes through here so storage failures (private mode, quota) never crash the app.
 */
export function get<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function set<T>(key: string, value: T): void {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage off or full */ }
}

export function remove(key: string): void {
  try { localStorage.removeItem(key); } catch { /* storage off */ }
}

export const KEYS = {
  prefs: 'veyrarc.voice.prefs.v1',
  journal: 'veyrarc.voice.journal.v1',
  wrong: 'veyrarc.voice.wrong.v1',
  health: 'veyrarc.voice.health.v1',
  firstRun: 'veyrarc.voice.firstRun.v1',
  cycle: 'veyrarc.voice.cycle.v1',
  hints: 'veyrarc.voice.hints.v1',
  flags: 'veyrarc.flags',
} as const;
