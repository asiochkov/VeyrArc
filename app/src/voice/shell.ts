import { create } from 'zustand';

/*
 * The light part of the assistant that stays in the main bundle (ТЗ 6.13.1): is the panel open, what the orb is doing, and
 * the way to open it. Everything heavy (parser, classifier, executors, speech, flows) is a separate chunk, loaded on idle
 * after the app is up (so the first tap already finds it) or on the first tap, and reached through `hooks`.
 */
export type OpenSrc = 'mark' | 'sidebar' | 'hotkey' | 'link' | 'push' | 'hold' | 'palette';
export type Phase = 'idle' | 'listening' | 'processing' | 'speaking' | 'error';
export const useAssistant = create<{ open: boolean; phase: Phase }>(() => ({ open: false, phase: 'idle' }));
export const hooks: {
  /** `gesture`: the engine was already loaded, so listening may start inside the tap that opened the panel */
  open?: (src: OpenSrc, gesture: boolean) => void;
  close?: () => void;
  /** start listening, or finish if it is already listening (the hotkey) */
  toggle?: () => void;
} = {};

let engine: Promise<unknown> | null = null;
/** the heavy chunk; safe to call many times */
export const loadAssistant = () => (engine ??= import('./voice'));
export const assistantLoaded = () => !!hooks.open;
/** warm the chunk when the browser is idle */
export function preloadAssistant() {
  const w = window as unknown as { requestIdleCallback?: (f: () => void, o?: { timeout: number }) => void };
  if (w.requestIdleCallback) w.requestIdleCallback(() => void loadAssistant(), { timeout: 4000 });
  else setTimeout(() => void loadAssistant(), 2500);
}

export function openAssistant(src: OpenSrc = 'mark') {
  if (useAssistant.getState().open) return;
  useAssistant.setState({ open: true });
  if (hooks.open) { hooks.open(src, true); return; }
  void loadAssistant().then(() => { if (useAssistant.getState().open) hooks.open?.(src, false); });
}
export function closeAssistant() {
  hooks.close?.();
  useAssistant.setState({ open: false });
}
/** run a phrase typed elsewhere (the command palette) in the assistant: the answer and «Отменить» show there */
export function runPhraseInAssistant(text: string) {
  openAssistant('palette');
  void loadAssistant().then((m) => (m as { runInAssistant: (t: string) => void }).runInAssistant(text));
}
