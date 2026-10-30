import type { Intent } from '../nlu';

/*
 * Voice 2.0 — risk levels (ТЗ §6.7.1). R0/R1 run immediately (info, or a single reversible
 * change). R2+ asks «точно?» first (fixes findings C-05, D-01: destructive actions currently run
 * with no confirmation at all).
 *
 * Mapped against the *current* intent set in nlu.ts (13 kinds) — the full §6.6 domain table (40+
 * intents: habit.remove R3, account.delete R4, …) only applies once those intents exist, in WP3/WP5.
 */
export type Risk = 'R0' | 'R1' | 'R2' | 'R3' | 'R4';

const LEVEL: Record<Intent['kind'], Risk> = {
  mood: 'R1',
  done: 'R1',
  undone: 'R1',
  taskAdd: 'R2',
  taskMove: 'R2',
  taskDelete: 'R3', // deletes a task outright — closest existing match to §6.7.1's "удаление"
  focus: 'R1',
  nav: 'R0',
  ask: 'R0',
  habitAdd: 'R2', // creates a standing structure (§6.7.1 "создание структур")
  goalAdd: 'R2',
  stepAdd: 'R2',
  relapse: 'R3', // §6.6: quit.relapse R3 exactly
  quitAdd: 'R2', // §6.6: quit.add R2
  quitArchive: 'R3', // §6.6: quit.archive R3
  review: 'R0',
  weekReview: 'R0',
  freeze: 'R1',
  lang: 'R1',
  undo: 'R0',
  help: 'R0',
  chat: 'R0',
  guess: 'R0', // never executes anything by itself — just a fallback label
  unknown: 'R0',
};

export function riskOf(kind: Intent['kind']): Risk {
  return LEVEL[kind] ?? 'R2'; // an intent kind nobody rated yet defaults to "ask first", not "run it"
}

export function needsConfirm(risk: Risk): boolean {
  return risk !== 'R0' && risk !== 'R1';
}
