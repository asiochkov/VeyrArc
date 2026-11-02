/*
 * Voice 2.0 — tunable constants (§6.3, §6.7.2), pulled out of engine.ts/decide.ts so they live in
 * one place per the master prompt. The spec says to fit these to a golden dataset (§7.2) via
 * Voice Lab (§6.19) — neither exists here (no classifier, no labelled corpus to fit against), so
 * these are the spec's own stated defaults, not locally tuned values.
 */

/** §6.3 endpointing (stt/endpointing.ts equivalent, inlined in engine.ts's startVoice()) */
export const NO_SPEECH_MS = 7000; // nothing heard at all — stop with the no-speech error
export const SILENCE_AFTER_FINAL_MS = 700; // a settled final result, nothing sounds unfinished
export const SILENCE_AFTER_INTERIM_MS = 1400; // still only interim results in hand
export const TAIL_INCOMPLETE_MS = 1300; // text ends on an open preposition/conjunction — wait longer
export const EARLY_STABLE_MS = 350; // confidence ≥ EARLY_STABLE_CONFIDENCE and text unchanged this long → stop early
export const EARLY_STABLE_CONFIDENCE = 0.8;
export const MAX_UTTERANCE_MS = 15000; // hard cap regardless of anything else

/** §6.7.2: below this, a settled ASR result is treated as "the recognizer itself is unsure" */
export const LOW_ASR_CONFIDENCE = 0.5;
