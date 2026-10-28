import { create } from 'zustand';

/*
 * The light part of the assistant that stays in the main bundle (ТЗ 6.13.1): is the panel open, and the way to open it.
 * Everything heavy (parser, executors, speech, flows) is reached through `hooks`, registered by the engine the first time
 * the panel is opened, so the main bundle grows by a few hundred bytes only.
 */
export type OpenSrc = 'mark' | 'sidebar' | 'hotkey' | 'link' | 'push' | 'hold';
export const useAssistant = create<{ open: boolean }>(() => ({ open: false }));
export const hooks: { open?: (src: OpenSrc) => void; close?: () => void } = {};

export function openAssistant(src: OpenSrc = 'mark') {
  if (useAssistant.getState().open) return;
  useAssistant.setState({ open: true });
  hooks.open?.(src);
}
export function closeAssistant() {
  hooks.close?.();
  useAssistant.setState({ open: false });
}
