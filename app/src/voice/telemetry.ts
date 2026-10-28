import { track } from '../lib/analytics';
import { prefs } from './prefs';

/*
 * What the assistant reports (ТЗ 6.15). Only names and coarse numbers — never audio, never the text of a
 * phrase unless the person turned on «Help improve the assistant» (then it goes as `t`, at most 120 characters).
 * Table of events: docs/release/ANALYTICS.md.
 */
type V = string | number | boolean | null;
type Props = Record<string, V | undefined>;
const clean = (p: Props): Record<string, V> => Object.fromEntries(Object.entries(p).filter(([, v]) => v !== undefined)) as Record<string, V>;
const tenth = (c: number | null | undefined) => (c == null || !Number.isFinite(c) ? -1 : Math.round(c * 10) / 10);

export type VoiceEvent = 'voice_open' | 'voice_stt' | 'voice_intent' | 'voice_outcome' | 'voice_undo' | 'voice_error' | 'voice_flow' | 'voice_wrong';
export function vTrack(event: VoiceEvent, props: Props = {}, phrase?: string) {
  const p = clean(props);
  if ('conf' in p) p.conf = tenth(p.conf as number);
  if (phrase && prefs().shareText) p.t = phrase.slice(0, 120);
  track(event, p);
}
export const voiceOpen = (src: 'mark' | 'sidebar' | 'hotkey' | 'link' | 'push' | 'hold') => vTrack('voice_open', { src });
export const voiceError = (code: string) => vTrack('voice_error', { code });
