import { create } from 'zustand';
import { applyUndo } from './exec/undo';
import type { UndoOp } from './exec/types';
import { store } from './store';

/*
 * The journal of what the assistant did (ТЗ 6.14, C-02): kept on the device across reloads, up to 50 entries and 200 KB,
 * each with the data needed to take it back. The label is written by the assistant («Отметил «Зарядка»»); the person's
 * spoken words are not kept here.
 */
export type JournalEntry = { id: string; at: number; kind: string; label: string; ops: UndoOp[]; undone?: boolean };
type Saved = { v: 1; entries: JournalEntry[] };
const KEY = 'journal.v1';
const load = (): JournalEntry[] => store.get<Saved>(KEY, { v: 1, entries: [] }).entries;

export const useJournal = create<{ entries: JournalEntry[] }>(() => ({ entries: load() }));
const commit = (entries: JournalEntry[]) => { const kept = store.trim(entries, 50, 200_000); store.set<Saved>(KEY, { v: 1, entries: kept }); useJournal.setState({ entries: kept }); };

export const journal = {
  list: () => useJournal.getState().entries,
  /** what can still be undone, newest first */
  undoable: () => useJournal.getState().entries.filter((e) => !e.undone && e.ops.length).reverse(),
  add(e: { kind: string; label: string; ops: UndoOp[] }): JournalEntry {
    const entry: JournalEntry = { id: Math.random().toString(36).slice(2, 10), at: Date.now(), ...e };
    commit([...useJournal.getState().entries, entry]);
    return entry;
  },
  /** takes back up to n of the latest changes; returns what was undone, newest first */
  undo(n = 1): JournalEntry[] {
    const todo = journal.undoable().slice(0, Math.max(1, n));
    for (const e of todo) applyUndo({ t: 'batch', ops: e.ops });
    const ids = new Set(todo.map((e) => e.id));
    commit(useJournal.getState().entries.map((e) => (ids.has(e.id) ? { ...e, undone: true } : e)));
    return todo;
  },
  undoById(id: string): JournalEntry | null {
    const e = useJournal.getState().entries.find((x) => x.id === id && !x.undone);
    if (!e) return null;
    applyUndo({ t: 'batch', ops: e.ops });
    commit(useJournal.getState().entries.map((x) => (x.id === id ? { ...x, undone: true } : x)));
    return e;
  },
  clear() { commit([]); },
};
