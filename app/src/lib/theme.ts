import { create } from 'zustand';

/*
 * Theme (audit 1.3.1): system / light / dark. Dark stays the default — it is the product's look;
 * «system» follows the phone. The choice lives on the device.
 */
export type Theme = 'system' | 'light' | 'dark';
const KEY = 'veyrarc.theme';
const read = (): Theme => { try { const v = localStorage.getItem(KEY); return v === 'light' || v === 'system' ? v : 'dark'; } catch { return 'dark'; } };
const light = () => matchMedia('(prefers-color-scheme: light)').matches;

export function applyTheme(t: Theme) {
  const resolved = t === 'system' ? (light() ? 'light' : 'dark') : t;
  document.documentElement.setAttribute('data-theme', resolved);
  // the status bar / browser chrome follows
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', resolved === 'light' ? '#EEF1F6' : '#000000');
}
export const useTheme = create<{ theme: Theme; setTheme: (t: Theme) => void }>((set) => ({
  theme: read(),
  setTheme: (theme) => { try { localStorage.setItem(KEY, theme); } catch { /* no storage */ } applyTheme(theme); set({ theme }); },
}));
export function initTheme() {
  applyTheme(useTheme.getState().theme);
  matchMedia('(prefers-color-scheme: light)').addEventListener?.('change', () => { if (useTheme.getState().theme === 'system') applyTheme('system'); });
}
