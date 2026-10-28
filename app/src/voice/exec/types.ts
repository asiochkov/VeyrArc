import type { PlanRow, QuitRow } from '../../data/model';

// What the assistant did, in a form that can be stored and reverted later (ТЗ 5.3, journal.ts).
export type UndoOp =
  | { t: 'habit.log'; habitId: string; day: string; prev: { value: number; done: boolean } | null }
  | { t: 'mood'; day: string; prev: number | null } // prev: 1..5 | null
  | { t: 'water'; day: string; prev: number }
  | { t: 'note'; day: string; prev: string | null }
  | { t: 'event.save'; row: PlanRow; wasNew: boolean }
  | { t: 'event.delete'; id: string }
  | { t: 'event.done'; id: string; prev: boolean }
  | { t: 'habit.create'; id: string }
  | { t: 'habit.patch'; id: string; prev: Record<string, unknown> }
  | { t: 'goal.create'; id: string }
  | { t: 'goal.patch'; id: string; prev: Record<string, unknown> }
  | { t: 'step.add'; id: string }
  | { t: 'step.restore'; row: { id: string; goal_id: string; text: string; sort: number } }
  | { t: 'step.rename'; id: string; prev: string }
  | { t: 'goal.task'; goalId: string; taskId: string; day: string; prev: boolean }
  | { t: 'quit.add'; id: string }
  | { t: 'quit.patch'; id: string; prev: Record<string, unknown> }
  | { t: 'quit.archive'; id: string; prev: boolean; row?: QuitRow } // prev: was it archived before; row is needed to bring one back
  | { t: 'relapse.undo'; quitId: string; tempId: string; prevCleanSince: string; prevBest: number } // from actions.takeRelapseOp()
  | { t: 'diary'; goalId: string; day: string; prev: string | null }
  | { t: 'oath'; arcId: string; prev: string | null }
  | { t: 'local'; key: string; prev: string | null } // a line kept in this device's storage (the focus of the week)
  | { t: 'prefs'; key: string; prev: unknown } // local assistant settings
  | { t: 'batch'; ops: UndoOp[] };

export type Chip = { label: string; say?: string; run?: () => Reply | Promise<Reply> };
export type Reply = {
  ok: boolean;
  kind: 'done' | 'answer' | 'ask' | 'confirm' | 'info' | 'error';
  screen: string; // what is shown (the full text)
  speech: string | null; // what is said (≤ 220 characters, spoken style); null = say nothing
  list?: string[]; // lines under the answer
  chips?: Chip[]; // tappable phrases / buttons
  choices?: { label: string; yes?: boolean; run: () => Reply | Promise<Reply> }[];
  undo?: UndoOp[]; // what goes into the journal
  nav?: string; // where to go
  close?: boolean;
  expect?: { slot?: string; windowMs: number; grammar?: string }; // keep listening for a follow-up
  flow?: { id: string; step: string };
  /** the reply came from an executor that keeps its own way of undoing: the «Отменить» button still shows */
  undoable?: boolean;
  /** open the text field (after repeated misunderstandings) */
  typing?: boolean;
};
