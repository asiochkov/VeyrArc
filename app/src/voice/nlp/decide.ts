import type { Intent } from '../nlu';
import { needsConfirm, riskOf } from './risk';

/*
 * Voice 2.0 — decide whether a parsed command runs immediately or asks «точно?» first (ТЗ §6.7.4).
 *
 * A-03/B-06: there's still no trained confidence classifier (would need a labelled dataset and a
 * backend to serve it — out of reach here). But the browser's own SpeechRecognition already computes
 * a real per-utterance confidence score for free (`result[0].confidence`, 0..1) — engine.ts used to
 * throw it away. Routing on it is a genuine confidence-weighted decision, not just risk-weighted: a
 * command the ASR itself is unsure about now asks «точно?» even if the intent itself would normally
 * run immediately (R0/R1). Typed text (palette, URL shortcuts, the panel's text box) has no ASR
 * confidence at all, so `asrConfidence` stays undefined there and this check is skipped entirely —
 * exact text is exact text.
 */
export type Decision =
  | { action: 'execute' }
  | { action: 'confirm' };

const LOW_ASR_CONFIDENCE = 0.5;

export function decide(intents: Intent[], asrConfidence?: number): Decision {
  const risky = intents.some((it) => needsConfirm(riskOf(it.kind)));
  const unsureHeard = asrConfidence != null && asrConfidence > 0 && asrConfidence < LOW_ASR_CONFIDENCE;
  return risky || unsureHeard ? { action: 'confirm' } : { action: 'execute' };
}
