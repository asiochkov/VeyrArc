import { useRef } from 'react';
import { create } from 'zustand';
import type { Choice, Reply } from './run';

/*
 * Voice 2.0 — the always-loaded shell (ТЗ §5.2, §6.13.1, finding H12). BottomBar, Sidebar and
 * AppShell need the open/closed state and the mark everywhere, but the actual recognition/NLU/TTS
 * pipeline (engine.ts → nlu.ts → run.ts, 1000+ lines) is only worth downloading once the assistant
 * is actually opened. This file stays tiny and dependency-free so it never grows the main chunk.
 */
export type VoiceState = 'idle' | 'listening' | 'processing' | 'speaking' | 'error';
type Store = {
  state: VoiceState; heard: string; reply: string; ok: boolean;
  list: string[]; suggest: string[]; choices: Choice[]; canUndo: boolean;
  /** speech can't be used here (no permission, no service): the panel switches to typing */
  blocked: boolean;
  /** C-05/§5.3 ask-slot: a missing piece of info — the next utterance answers it, not a new command */
  pendingSlot: Reply['ask'] | null;
};
export const useVoice = create<Store>(() => ({ state: 'idle', heard: '', reply: '', ok: true, list: [], suggest: [], choices: [], canUndo: false, blocked: false, pendingSlot: null }));

type Panel = { open: boolean };
export const useAssistant = create<Panel>(() => ({ open: false }));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const voiceSupported = () => typeof window !== 'undefined' && !!((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition);

type Engine = typeof import('./engine');
let engineMod: Engine | null = null;
let loading: Promise<Engine> | null = null;
function loadEngine(): Promise<Engine> {
  if (!loading) loading = import('./engine').then((m) => { engineMod = m; return m; });
  return loading;
}

/** autoListen: false for §6.16's ?say=... shortcut — a command is about to run immediately, so
 * the usual "start listening 420ms after open" behavior would otherwise clobber its result. */
export function openAssistant(opts?: { autoListen?: boolean }) {
  if (useAssistant.getState().open) return;
  useAssistant.setState({ open: true });
  // phrases that fit this screen and this moment arrive once the engine chunk resolves
  useVoice.setState({ heard: '', reply: '', list: [], suggest: [], choices: [], canUndo: false, ok: true, state: 'idle', pendingSlot: null });
  navigator.vibrate?.(10);
  loadEngine().then((m) => m.onOpen(opts?.autoListen ?? true));
}

export function closeAssistant() {
  useAssistant.setState({ open: false });
  useVoice.setState({ choices: [], pendingSlot: null });
  engineMod?.onClose(); // nothing to cancel if the engine was never loaded (closed without ever listening)
}

/**
 * §6.13.2 / decision #21: holding the mark (the icon that opens the panel — in Sidebar/BottomBar,
 * not the orb inside the already-open panel) for ≥350ms starts listening immediately, before the
 * panel's own open animation even finishes; releasing stops it. A plain short tap still just opens
 * the panel, exactly as before — the hold timer below never fires for one, so `suppressed()` stays
 * false and the caller's own onClick (open/toggle) runs unchanged.
 */
export function useHoldToTalk() {
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const holding = useRef(false); // true from the 350ms mark until release, regardless of whether startVoice() has actually run yet
  const started = useRef(false); // true only once startVoice() has actually run
  const suppress = useRef(false);
  const onPointerDown = () => {
    if (!voiceSupported()) return; // no mic API at all — a tap just opens the panel to type instead
    holding.current = false;
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      suppress.current = true;
      holding.current = true;
      openAssistant({ autoListen: false });
      // the engine chunk is lazy (H12) — on a slow connection it can still be loading when the
      // finger lifts. Without this guard, a quick hold-and-release could end up calling stopVoice()
      // on a recognizer that hadn't started yet, then startVoice() fires moments later and keeps
      // listening with nothing left to ever stop it. Only actually start if still held once loaded.
      loadEngine().then((m) => { if (holding.current) { m.startVoice(); started.current = true; } });
    }, 350);
  };
  const endHold = () => {
    clearTimeout(timer.current);
    holding.current = false;
    if (started.current) { loadEngine().then((m) => m.stopVoice()); started.current = false; }
    // the browser still synthesizes a click right after pointerup even for a long press — let that
    // one through unacted-on (the caller checks `suppressed()`), then re-arm for the next tap
    if (suppress.current) setTimeout(() => { suppress.current = false; }, 0);
  };
  return {
    onPointerDown,
    onPointerUp: endHold,
    onPointerLeave: endHold,
    onPointerCancel: endHold,
    onContextMenu: (e: { preventDefault: () => void }) => e.preventDefault(),
    suppressed: () => suppress.current,
  };
}
