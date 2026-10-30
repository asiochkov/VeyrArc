import { get, KEYS, set as storeSet } from './store';

/*
 * Voice 2.0 — persisted journal of what the assistant did (ТЗ §6.14, partial fix for finding
 * C-02: "no journal of what I did by voice"). This is a readable history, not an undo mechanism —
 * `run.ts`'s undo closures can't survive a reload (functions aren't JSON), so cross-reload undo
 * stays a known gap for the WP5 exec/UndoOp rewrite, tracked in audit-findings.md.
 */
export type JournalEntry = { ts: number; said: string; reply: string; ok: boolean };

const MAX_ENTRIES = 50;
const MAX_LEN = 200;

const trim = (s: string) => (s.length > MAX_LEN ? s.slice(0, MAX_LEN - 1) + '…' : s);

export function journalAppend(said: string, reply: string, ok: boolean): void {
  const entries = get<JournalEntry[]>(KEYS.journal, []);
  entries.unshift({ ts: Date.now(), said: trim(said), reply: trim(reply), ok });
  storeSet(KEYS.journal, entries.slice(0, MAX_ENTRIES));
}

export function journalList(): JournalEntry[] {
  return get<JournalEntry[]>(KEYS.journal, []);
}

export function journalClear(): void {
  storeSet(KEYS.journal, []);
}
