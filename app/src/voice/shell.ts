import { create } from 'zustand';
import type { Choice } from './run';

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
};
export const useVoice = create<Store>(() => ({ state: 'idle', heard: '', reply: '', ok: true, list: [], suggest: [], choices: [], canUndo: false, blocked: false }));

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

export function openAssistant() {
  if (useAssistant.getState().open) return;
  useAssistant.setState({ open: true });
  // phrases that fit this screen and this moment arrive once the engine chunk resolves
  useVoice.setState({ heard: '', reply: '', list: [], suggest: [], choices: [], canUndo: false, ok: true, state: 'idle' });
  navigator.vibrate?.(10);
  loadEngine().then((m) => m.onOpen());
}

export function closeAssistant() {
  useAssistant.setState({ open: false });
  useVoice.setState({ choices: [] });
  engineMod?.onClose(); // nothing to cancel if the engine was never loaded (closed without ever listening)
}
