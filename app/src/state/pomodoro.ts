import { create } from 'zustand';
import { setProfile } from '../data/settings';
import { useAuth } from '../lib/auth';
import { hasBackend } from '../lib/supabase';
import { logFocus, type FocusLink } from './actions';

/*
 * One focus timer for the whole app (Master Changeset RS-8, A12, task 17).
 * It runs off an end timestamp (right after the phone was locked), survives a reload
 * (kept on the device), and can serve a goal, a duration habit or a planner event.
 * Lengths are saved in the profile (synced between devices).
 */
export type PomoTab = 0 | 1 | 2; // focus, short break, long break
export type Lengths = [number, number, number];
const TYPE = ['focus', 'short', 'long'] as const;
export const DEFAULT_LENGTHS: Lengths = [25, 5, 15];
export type PomoLink = FocusLink & { label?: string };

type State = {
  open: boolean;           // the full timer sheet
  tab: PomoTab;
  left: number;            // seconds while paused
  endsAt: number | null;   // while running
  lengths: Lengths;
  link: PomoLink;
  finished: number;        // bumps when a session ends (for a short «done» state)
};
const KEY = 'veyrarc.pomo';
const load = (): Partial<State> => { try { return JSON.parse(localStorage.getItem(KEY) || '{}'); } catch { return {}; } };
const saved = load();

export const usePomodoro = create<State>(() => ({
  open: false, tab: (saved.tab ?? 0) as PomoTab, left: saved.left ?? DEFAULT_LENGTHS[0] * 60, endsAt: saved.endsAt ?? null,
  lengths: saved.lengths ?? DEFAULT_LENGTHS, link: saved.link ?? {}, finished: 0,
}));
usePomodoro.subscribe((s) => {
  try { localStorage.setItem(KEY, JSON.stringify({ tab: s.tab, left: s.left, endsAt: s.endsAt, lengths: s.lengths, link: s.link })); } catch { /* no storage */ }
});
// profile lengths win once the profile has loaded
useAuth.subscribe((a) => {
  const l = a.profile?.pomodoro?.lengths;
  if (l && l.join() !== usePomodoro.getState().lengths.join()) {
    const s = usePomodoro.getState();
    usePomodoro.setState({ lengths: l, left: s.endsAt ? s.left : l[s.tab] * 60 });
  }
});

export const remaining = (s: Pick<State, 'endsAt' | 'left'>) => (s.endsAt ? Math.max(0, Math.round((s.endsAt - Date.now()) / 1000)) : s.left);
export const fmtClock = (sec: number) => `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;

export const pomo = {
  openSheet: (link?: PomoLink) => usePomodoro.setState((s) => ({ open: true, link: link ?? s.link })),
  closeSheet: () => usePomodoro.setState({ open: false }),
  setTab: (tab: PomoTab) => usePomodoro.setState((s) => ({ tab, endsAt: null, left: s.lengths[tab] * 60 })),
  setLink: (link: PomoLink) => usePomodoro.setState({ link }),
  start: (link?: PomoLink) => usePomodoro.setState((s) => ({ endsAt: Date.now() + remaining(s) * 1000, link: link ?? s.link })),
  pause: () => usePomodoro.setState((s) => ({ left: remaining(s), endsAt: null })),
  toggle: () => (usePomodoro.getState().endsAt ? pomo.pause() : pomo.start()),
  reset: () => usePomodoro.setState((s) => ({ endsAt: null, left: s.lengths[s.tab] * 60 })),
  setLength: (i: PomoTab, m: number) => {
    const s = usePomodoro.getState();
    const lengths = [...s.lengths] as Lengths;
    lengths[i] = m;
    usePomodoro.setState({ lengths, left: i === s.tab && !s.endsAt ? m * 60 : s.left });
    if (hasBackend) setProfile({ pomodoro: { lengths } });
  },
  /** called by the ticking views when the countdown reaches zero */
  complete: (sessionNo: number) => {
    const s = usePomodoro.getState();
    if (!s.endsAt || remaining(s) > 0) return;
    const minutes = s.lengths[s.tab];
    logFocus(minutes, TYPE[s.tab], s.tab === 0 ? s.link : {});
    navigator.vibrate?.([30, 60, 30]);
    const next: PomoTab = s.tab === 0 ? (sessionNo >= 4 ? 2 : 1) : 0;
    usePomodoro.setState({ tab: next, endsAt: null, left: s.lengths[next] * 60, finished: s.finished + 1, link: s.tab === 0 ? s.link : s.link });
  },
};
