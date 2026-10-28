/*
 * Every tunable number of the assistant in one place (ТЗ 6.3, 6.7, 6.8). Values are tuned on the golden set
 * (WP3.5) and committed; changing a threshold means re-running `npm run test:voice` and noting why in
 * docs/voice/decisions.md.
 */
export const DECIDE = {
  // R0 — read only
  r0Execute: 0.55, r0Clarify: 0.35,
  // R1 — light, reversible
  r1Execute: 0.78, r1Confirm: 0.55,
  // R2 — creates or changes data: execute (with a preview in the answer) only above this and with every slot filled
  r2Execute: 0.85, r2Confirm: 0.6,
  // R3 — destructive or hard to bring back: always confirmed, and refused when too unsure
  r3Confirm: 0.7,
  // a group of more than this many items is always confirmed, with the count
  bulkConfirmAbove: 3,
  // two candidates this close in confidence are asked about instead of guessed
  ambiguousMargin: 0.06,
} as const;

export const SCORE = {
  // rule scores (6.7.2)
  explicit: 0.9, // an explicit command + its object
  template: 0.6, // a pattern without an explicit verb
  weak: 0.35, // a weak trigger on its own («нужно», «надо», «что»)
  // mixing the rule score with the classifier, and the entity similarity floor
  ruleWeight: 0.6, classifierWeight: 0.4,
  oosClassifier: 0.6, // classifier says out-of-scope at least this much and no rule is explicit → refuse
  entityFloor: 0.45, // below this similarity the habit/task/goal is «not found»
  asrBase: 0.8, asrWeight: 0.2, // confidence = s · (0.8 + 0.2 · asr)
} as const;

export const LIMITS = {
  maxEventsPerRun: 30, confirmEventsAbove: 8, // a series of events (decision #24)
  freeCore: 5, freeGoals: 3,
  replyChars: 220, // the longest thing said aloud
} as const;

export const DIALOG = {
  contextTtlMs: 5 * 60_000, pendingTtlMs: 45_000, correctionWindowMs: 20_000, slotListenMs: 8_000, followUpMs: 6_000, flowStepMs: 12_000,
} as const;

export const ENDPOINT = {
  noSpeechMs: 7000, minSpeechMs: 250, silenceAfterFinalMs: 700, silenceAfterInterimMs: 1400, tailIncompleteMs: 1300, earlyStableMs: 350,
  maxUtteranceMs: 15000, dictationSilenceMs: 2500, dictationMaxMs: 60000, earlyConfidence: 0.8,
} as const;
