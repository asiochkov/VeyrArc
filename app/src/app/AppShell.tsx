import { Outlet } from 'react-router-dom';
import { useLangStore } from '../i18n';
import { useIsDesktop } from '../lib/useIsDesktop';
import s from './AppShell.module.css';
import { BottomBar } from './BottomBar';
import { Rail } from './Rail';

/*
 * app:      rail on desktop, bottom bar on mobile (Today, Tracker, Calendar, Goals, Profile)
 * settings: rail on desktop with nothing active and an inert "+"; no bottom bar on mobile
 * bare:     no navigation (Auth, Pro, goal recap)
 */
export type Chrome = 'app' | 'settings' | 'bare';

export function AppShell({ chrome }: { chrome: Chrome }) {
  const isDesktop = useIsDesktop();
  const fading = useLangStore((st) => st.fading);
  const rootCls = `${s.root} ${fading ? s.fading : ''}`;

  if (chrome === 'bare') {
    return (
      <div className={rootCls} data-layout={isDesktop ? 'desktop' : 'mobile'}>
        <Outlet />
      </div>
    );
  }

  if (isDesktop) {
    return (
      <div className={rootCls} data-layout="desktop">
        <div className={s.desktop}>
          <Rail plusInert={chrome === 'settings'} />
          <main className={s.desktopMain}>
            <Outlet />
          </main>
        </div>
      </div>
    );
  }

  return (
    <div className={rootCls} data-layout="mobile">
      <div className={s.mobile}>
        <main className={s.mobileMain}>
          <Outlet />
        </main>
        {chrome === 'app' && <BottomBar />}
      </div>
    </div>
  );
}
