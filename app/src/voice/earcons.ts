import { usePrefs } from './prefs';

/*
 * §6.12 earcons: short synthesized tones marking state changes (listening started, a command
 * finished, a command failed) — no audio files, no network, just a couple of WebAudio oscillators.
 * `prefs.sound` (WP0.4) already had the on/off field; nothing ever played a sound through it.
 * Deliberately independent of `muted`, which only silences spoken replies (TTS) — someone may want
 * the short beep without the spoken sentence, or the other way around.
 */
let ctx: AudioContext | null = null;
function audioCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const Ctor = window.AudioContext || (window as any).webkitAudioContext;
  if (!Ctor) return null;
  if (!ctx) ctx = new Ctor();
  if (ctx.state === 'suspended') ctx.resume().catch(() => { /* needs a user gesture — the next tap will retry */ });
  return ctx;
}

function tone(freq: number, startAt: number, dur: number, peak = 0.08) {
  const c = audioCtx();
  if (!c) return;
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = 'sine';
  osc.frequency.value = freq;
  const t0 = c.currentTime + startAt;
  // a short linear fade in/out instead of a hard on/off — a flat click would sound like a glitch, not a tone
  gain.gain.setValueAtTime(0, t0);
  gain.gain.linearRampToValueAtTime(peak, t0 + 0.012);
  gain.gain.linearRampToValueAtTime(0, t0 + dur);
  osc.connect(gain).connect(c.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

const enabled = () => usePrefs.getState().prefs.sound;

/** the mic just started listening */
export function earconListen() { if (enabled()) tone(880, 0, 0.07); }
/** a command finished successfully — a short rising two-note chime */
export function earconDone() { if (enabled()) { tone(660, 0, 0.06); tone(880, 0.07, 0.09); } }
/** a command failed or was misheard — one low tone */
export function earconError() { if (enabled()) tone(220, 0, 0.16, 0.1); }
