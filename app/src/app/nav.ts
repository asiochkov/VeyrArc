import { create } from 'zustand';
import type { TKey } from '../i18n';
import type { IconName } from '../ui/Icon';

export type NavId = 'today' | 'habits' | 'calendar' | 'goals' | 'profile';

export const NAV: { id: NavId; to: string; icon: IconName; label: TKey }[] = [
  { id: 'today', to: '/', icon: 'home', label: 'nav.today' },
  { id: 'habits', to: '/habits', icon: 'checklist', label: 'nav.habits' },
  { id: 'calendar', to: '/calendar', icon: 'cal', label: 'nav.calendar' },
  { id: 'goals', to: '/goals', icon: 'target', label: 'nav.goals' },
  { id: 'profile', to: '/profile', icon: 'person', label: 'nav.profile' },
];

export function navIdFor(pathname: string): NavId | null {
  if (pathname === '/') return 'today';
  const hit = NAV.find((n) => n.to !== '/' && pathname.startsWith(n.to));
  return hit ? hit.id : null;
}

/*
 * The rail "+" is the single global add entry point (audit decision 8).
 * Screens register what "+" means for them; see proposal C3 in docs/stage-0.md.
 */
type AddState = { handler: (() => void) | null; setHandler: (h: (() => void) | null) => void };
export const useAddAction = create<AddState>((set) => ({
  handler: null,
  setHandler: (handler) => set({ handler }),
}));
