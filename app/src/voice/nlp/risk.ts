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
  habitArchive: 'R2', // §6.6: habit.pause R2 (reversible — restoreHabit undoes it)
  habitRestore: 'R2', // §6.6: habit.restore R2
  habitDelete: 'R3', // §6.6: habit.remove R3 (deleteHabit has no undo)
  goalComplete: 'R3', // §6.6: goal.complete R3
  goalDeadline: 'R2', // §6.6: goal.deadline R2
  goalDiary: 'R2', // §6.6: goal.diary.add R2
  arcOath: 'R2', // §6.6: arc.oath.set R2
  settingsTheme: 'R1', // §6.6: settings.theme R1
  settingsReminder: 'R2', // §6.6: settings.reminder R2
  habitStreakQuery: 'R0', // §6.6: habit.streak R0 — pure info
  quitDaysQuery: 'R0', // §6.6: quit.days R0 — pure info
  search: 'R0', // §6.6: search.all R0 — pure info
  habitWeakest: 'R0', // §6.6: habit.weakest R0
  habitTop: 'R0', // §6.6: habit.top R0
  ritualSave: 'R2', // §6.6: ritual.create R2 (creates a standing structure)
  ritualList: 'R0',
  ritualRun: 'R1', // marks several habits done — same R1 tier as a single `done`
  templateSave: 'R2', // §6.6: template.save R2
  templateList: 'R0',
  templateApply: 'R2', // §6.6: template.apply R2 — creates real events on the day
  aliasAdd: 'R1', // §6.6: prefs.alias.add R1
  macroAdd: 'R2', // §6.6: prefs.macro.add R2
  exportData: 'R3', // §6.6: export.data R3
  referralShare: 'R1', // §6.6: referral.share R1
  profileName: 'R2', // §6.6: profile.name R2
  settingsQuiet: 'R2', // §6.6: settings.quiet R2
  settingsNotifyOff: 'R1', // §6.6: settings.notifyOff R1
  infoPlan: 'R0', // §6.6: info.plan R0
  habitCompare: 'R0', // §6.6: habit.compare R0
  habitTrend: 'R0', // §6.6: habit.trend R0
  achievementsQuery: 'R0', // §6.6: achievements R0
  counterRemaining: 'R0', // §6.6: counter.remaining R0
  taskNote: 'R2', // §6.6: task.note R2
  focusByCategory: 'R0', // §6.6: focus.byCategory R0
  taskTop3: 'R0', // pure read — listing, not changing, the plan
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
