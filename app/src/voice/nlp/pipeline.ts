import { legacyAnalyze } from './legacy';
import type { Decision, ParseEnv } from './types';

/** text → decisions (one per command in the phrase). The single entry point for text, chips, palette, links and flows. */
export function analyze(raw: string, env: ParseEnv): Decision[] {
  return legacyAnalyze(raw, env);
}
