import { usePrefs } from './prefs';

/*
 * §6.12 earcons (audio/earcons.ts): short synthesized tones — no audio files, no network. Exact
 * specs from the master prompt: envelope attack 5ms / decay 90ms, volume 0.06; AudioContext created
 * lazily and resumed on a gesture; don't play while the tab is hidden; gated by prefs.sound only
 * (not `muted`, which just silences spoken replies — someone may want the beep without the voice).
 *
 * Tone table (§6.12):
 *   начало записи        sine 660Hz → 880Hz, 80ms each
 *   конец записи без результата   sine 440Hz, 90ms
 *   успех                 sine 784Hz + 1175Hz together, 70ms
 *   вопрос/подтверждение  sine 523Hz, 100ms
 *   ошибка                sawtooth 220Hz through a lowpass(800Hz), 2×110ms
 */
let ctx: AudioContext | null = null;
function audioCtx(): AudioContext | null {
  if (typeof window === 'undefined' || document.hidden) return null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const Ctor = window.AudioContext || (window as any).webkitAudioContext;
  if (!Ctor) return null;
  if (!ctx) ctx = new Ctor();
  if (ctx.state === 'suspended') ctx.resume().catch(() => { /* needs a user gesture — the next tap will retry */ });
  return ctx;
}

const PEAK = 0.06, ATTACK = 0.005;

function playTone(c: AudioContext, freq: number, startAt: number, dur: number, type: OscillatorType = 'sine', lowpassHz?: number) {
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  const t0 = c.currentTime + startAt;
  gain.gain.setValueAtTime(0, t0);
  gain.gain.linearRampToValueAtTime(PEAK, t0 + ATTACK);
  gain.gain.linearRampToValueAtTime(0, t0 + dur);
  if (lowpassHz) {
    const filter = c.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = lowpassHz;
    osc.connect(filter).connect(gain).connect(c.destination);
  } else {
    osc.connect(gain).connect(c.destination);
  }
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

const enabled = () => usePrefs.getState().prefs.sound;

/** the mic is about to start listening — played before recognition actually starts (§6.12's 120ms pause) */
export function earconListenStart() {
  if (!enabled()) return;
  const c = audioCtx();
  if (!c) return;
  playTone(c, 660, 0, 0.08);
  playTone(c, 880, 0.08, 0.08);
}
/** recording ended with nothing heard (the no-speech case) — distinct from a failed/misunderstood command */
export function earconNoResult() { const c = audioCtx(); if (enabled() && c) playTone(c, 440, 0, 0.09); }
/** a command finished successfully */
export function earconSuccess() {
  if (!enabled()) return;
  const c = audioCtx();
  if (!c) return;
  playTone(c, 784, 0, 0.07);
  playTone(c, 1175, 0, 0.07);
}
/** a question or a "точно?" confirmation is being asked */
export function earconConfirm() { const c = audioCtx(); if (enabled() && c) playTone(c, 523, 0, 0.1); }
/** a command failed or was misunderstood */
export function earconError() {
  if (!enabled()) return;
  const c = audioCtx();
  if (!c) return;
  playTone(c, 220, 0, 0.11, 'sawtooth', 800);
  playTone(c, 220, 0.15, 0.11, 'sawtooth', 800);
}
