import { useEffect } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useLangStore } from '../i18n';
import { useIsDesktop } from '../lib/useIsDesktop';
import { PomodoroSheet, DockedPomodoro } from '../ui/PomodoroViews';
import { AddSheet } from './AddSheet';
import s from './AppShell.module.css';
import { BottomBar } from './BottomBar';
import { CommandPalette } from './CommandPalette';
import { TourOverlay } from '../ui/Tour';
import { DEFAULT_TILE, NAV, navIdFor, useAdd } from './nav';
import { Sidebar, SidebarDrawer, useSidebarCollapsed } from './Sidebar';

/*
 * app:      sidebar on desktop, bottom bar + «+» on mobile (Today, Disciplines, Planner, Goals, Analytics)
 * settings: sidebar on desktop; no bottom bar on mobile
 * bare:     no navigation (Auth, Pro, Arc Recap)
 */
export type Chrome = 'app' | 'settings' | 'bare';

export function AppShell({ chrome }: { chrome: Chrome }) {
  const isDesktop = useIsDesktop();
  const fading = useLangStore((st) => st.fading);
  const rootCls = `${s.root} ${fading ? s.fading : ''}`;
  const [collapsed, setCollapsed] = useSidebarCollapsed();
  useShortcuts(chrome !== 'bare', () => setCollapsed((c) => !c));

  if (chrome === 'bare') {
    return (
      <div className={rootCls} data-layout={isDesktop ? 'desktop' : 'mobile'}>
        <Outlet />
      </div>
    );
  }
  const overlays = (
    <>
      <AddSheet />
      <CommandPalette />
      <PomodoroSheet />
      <DockedPomodoro />
      <TourOverlay />
    </>
  );

  if (isDesktop) {
    return (
      <div className={rootCls} data-layout="desktop">
        <div className={s.desktop}>
          <Sidebar collapsed={collapsed} onToggle={() => setCollapsed(!collapsed)} />
          <main className={s.desktopMain}>
            <RouteFade />
          </main>
        </div>
        {overlays}
      </div>
    );
  }

  return (
    <div className={rootCls} data-layout="mobile" data-dock={chrome === "app" ? "" : undefined}>
      <div className={s.mobile}>
        <main className={s.mobileMain}>
          <RouteFade />
        </main>
        {chrome === 'app' && <BottomBar />}
      </div>
      <SidebarDrawer />
      {overlays}
    </div>
  );
}

/* Keyboard-first (section 3′): ⌘K palette, C compose, [ sidebar, G then T/H/P/L/A to go. */
function useShortcuts(on: boolean, toggleSidebar: () => void) {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  useEffect(() => {
    if (!on) return;
    let g = 0;
    const typing = (el: EventTarget | null) => el instanceof HTMLElement && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));
    const onKey = (e: KeyboardEvent) => {
      const st = useAdd.getState();
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); if (st.paletteOpen) st.closePalette(); else st.openPalette(); return; }
      if (e.metaKey || e.ctrlKey || e.altKey || typing(e.target) || st.open || st.paletteOpen) return;
      const k = e.key.toLowerCase();
      if (Date.now() - g < 900) {
        const n = NAV.find((x) => x.key === k);
        g = 0;
        if (n) { e.preventDefault(); navigate(n.to); }
        return;
      }
      if (k === 'g') { g = Date.now(); return; }
      if (k === 'c') { e.preventDefault(); const id = navIdFor(pathname); st.openAdd(id ? DEFAULT_TILE[id] : null); return; }
      if (e.key === '[') { e.preventDefault(); toggleSidebar(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [on, navigate, pathname, toggleSidebar]);
}

/* A soft cross-fade with a small rise when the section changes (not on query/param changes inside it). */
function RouteFade() {
  const { pathname } = useLocation();
  return <div key={pathname.split('/')[1] || 'today'} className={s.routeFade}><Outlet /></div>;
}
