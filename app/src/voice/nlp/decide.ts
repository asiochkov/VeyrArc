import type { Intent } from '../nlu';
import { needsConfirm, riskOf } from './risk';

/*
 * Voice 2.0 — decide whether a parsed command runs immediately or asks «точно?» first (ТЗ §6.7.4,
 * simplified for the current rule-based matcher — it has no per-intent confidence score yet, so
 * routing is risk-only for now; a confidence-weighted threshold table lands with the classifier in WP1.2/WP3).
 */
export type Decision =
  | { action: 'execute' }
  | { action: 'confirm' };

export function decide(intents: Intent[]): Decision {
  const risky = intents.some((it) => needsConfirm(riskOf(it.kind)));
  return risky ? { action: 'confirm' } : { action: 'execute' };
}
