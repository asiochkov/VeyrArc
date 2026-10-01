import { create } from 'zustand';
import type { TKey } from '../i18n';
import type { IconName } from '../ui/Icon';

/* Five roots with one role each (Master Changeset section 3). */
export type NavId = 'today' | 'disciplines' | 'planner' | 'goals' | 'analytics';

export const NAV: { id: NavId; to: string; icon: IconName; label: TKey; key: string }[] = [
  { id: 'today', to: '/', icon: 'home', label: 'nav.today', key: 't' },
  { id: 'disciplines', to: '/disciplines', icon: 'checklist', label: 'nav.disciplines', key: 'h' },
  { id: 'planner', to: '/planner', icon: 'cal', label: 'nav.planner', key: 'p' },
  { id: 'goals', to: '/goals', icon: 'target', label: 'nav.goals', key: 'l' },
  { id: 'analytics', to: '/analytics', icon: 'pulse', label: 'nav.analytics', key: 'a' },
];

export function navIdFor(pathname: string): NavId | null {
  if (pathname === '/') return 'today';
  const hit = NAV.find((n) => n.to !== '/' && pathname.startsWith(n.to));
  return hit ? hit.id : null;
}

/*
 * The global «+» (Master Changeset PROBLEM #09): one Add sheet with four tiles; the current
 * screen only pre-selects the tile. The command palette (⌘K) and the sidebar search share this store.
 */
export type AddTile = 'habit' | 'event' | 'goalTask' | 'focus';
export const DEFAULT_TILE: Record<NavId, AddTile> = { today: 'event', disciplines: 'habit', planner: 'event', goals: 'goalTask', analytics: 'event' };
type AddState = {
  open: boolean; tile: AddTile | null; paletteOpen: boolean; drawerOpen: boolean;
  openAdd: (tile?: AddTile | null) => void; closeAdd: () => void;
  openPalette: () => void; closePalette: () => void; setDrawer: (v: boolean) => void;
};
export const useAdd = create<AddState>((set) => ({
  open: false, tile: null, paletteOpen: false, drawerOpen: false,
  openAdd: (tile = null) => set({ open: true, tile, paletteOpen: false, drawerOpen: false }),
  closeAdd: () => set({ open: false }),
  openPalette: () => set({ paletteOpen: true, drawerOpen: false }),
  closePalette: () => set({ paletteOpen: false }),
  setDrawer: (drawerOpen) => set({ drawerOpen }),
}));

/* kept for screens that still register a local «+» (e.g. the Disciplines composer); the sheet wins */
type LegacyAdd = { handler: (() => void) | null; setHandler: (h: (() => void) | null) => void };
export const useAddAction = create<LegacyAdd>((set) => ({ handler: null, setHandler: (handler) => set({ handler }) }));
