import { create } from 'zustand';
import { setProfile } from '../data/settings';
import { useAuth } from './auth';
import { hasBackend } from './supabase';

/*
 * Density (Master Changeset A11 / task 14): Comfortable or Compact, a `data-density`
 * attribute on <html>. Kept on the device for the first paint and in the profile for other devices.
 */
export type Density = 'comfortable' | 'compact';
const KEY = 'veyrarc.density';
const read = (): Density => { try { return localStorage.getItem(KEY) === 'compact' ? 'compact' : 'comfortable'; } catch { return 'comfortable'; } };
const apply = (d: Density) => {
  document.documentElement.dataset.density = d;
  try { localStorage.setItem(KEY, d); } catch { /* storage off */ }
};

export const useDensity = create<{ density: Density; set: (d: Density) => void }>((set) => ({
  density: read(),
  set: (d) => {
    apply(d); set({ density: d });
    if (hasBackend && useAuth.getState().profile) setProfile({ density: d });
  },
}));

export function startDensity() {
  apply(useDensity.getState().density);
  // the profile wins once it is loaded (the choice made on another device)
  useAuth.subscribe((st, prev) => {
    const d = st.profile?.density;
    if (d && d !== prev.profile?.density && d !== useDensity.getState().density) { apply(d); useDensity.setState({ density: d }); }
  });
}
