/*
 * Safe localStorage for the assistant (ТЗ 6.14): every read and write in try/catch, a memory copy in front,
 * keys «veyrarc.voice.<name>.v1», values are JSON objects carrying `v` for migrations. A private window or a
 * blocked storage never breaks anything: the assistant works from memory and forgets on reload.
 */
const PREFIX = 'veyrarc.voice.';
const mem = new Map<string, unknown>();
const full = (key: string) => (key.startsWith('veyrarc.') ? key : PREFIX + key);

export const store = {
  get<T>(key: string, fallback: T): T {
    const k = full(key);
    if (mem.has(k)) return mem.get(k) as T;
    try {
      const raw = localStorage.getItem(k);
      if (raw != null) { const v = JSON.parse(raw) as T; mem.set(k, v); return v; }
    } catch { /* unreadable: use the fallback */ }
    return fallback;
  },
  set<T>(key: string, value: T) {
    const k = full(key);
    mem.set(k, value);
    try { localStorage.setItem(k, JSON.stringify(value)); } catch { /* quota or private mode: memory only */ }
  },
  remove(key: string) {
    const k = full(key);
    mem.delete(k);
    try { localStorage.removeItem(k); } catch { /* ignore */ }
  },
  /** read, change, write back; returns the new value */
  update<T>(key: string, fallback: T, fn: (v: T) => T): T {
    const next = fn(store.get(key, fallback));
    store.set(key, next);
    return next;
  },
  /** keep a list within a count and an approximate size (oldest dropped first) */
  trim<T>(list: T[], maxCount: number, maxBytes = 200_000): T[] {
    let out = list.length > maxCount ? list.slice(list.length - maxCount) : list;
    while (out.length > 1 && JSON.stringify(out).length > maxBytes) out = out.slice(1);
    return out;
  },
  /** tests: forget the memory copy */
  _reset() { mem.clear(); },
};
