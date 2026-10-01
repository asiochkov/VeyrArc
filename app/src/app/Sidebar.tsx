import { onlineManager } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useHeader } from '../data/header';
import { EVENT_ICON, eventText, eventWhen, useEvents } from '../data/events';
import { useT } from '../i18n';
import { userEmail, useAuth } from '../lib/auth';
import { hasBackend } from '../lib/supabase';
import { useSystem } from '../state/system';
import { Icon } from '../ui/Icon';
import { Avatar } from '../ui/primitives';
import { roman } from './AppHeader';
import { NAV, navIdFor, useAdd } from './nav';
import s from './Sidebar.module.css';

/*
 * App sidebar (Master Changeset section 3′, PROBLEM #10): brand + arc, search (⌘K), the five roots,
 * the current arc (Core habits, active goals) and the archive of past arcs, the account at the bottom.
 * Desktop: 240 px, collapses to 60 px with «[». Mobile: the same panel as a drawer.
 */
const KEY = 'veyrarc.sidebar';
export function useSidebarCollapsed() {
  const [collapsed, setCollapsed] = useState(() => { try { return localStorage.getItem(KEY) === '1'; } catch { return false; } });
  useEffect(() => { try { localStorage.setItem(KEY, collapsed ? '1' : '0'); } catch { /* no storage */ } }, [collapsed]);
  return [collapsed, setCollapsed] as const;
}

export function Sidebar({ collapsed, onToggle, drawer = false }: { collapsed: boolean; onToggle: () => void; drawer?: boolean }) {
  const t = useT();
  const { pathname } = useLocation();
  const active = navIdFor(pathname);
  const hd = useHeader();
  const session = useAuth((x) => x.session);
  const openPalette = useAdd((x) => x.openPalette);
  const setDrawer = useAdd((x) => x.setDrawer);
  const [online, setOnline] = useState(onlineManager.isOnline());
  useEffect(() => onlineManager.subscribe(setOnline), []);
  const q = useSystem((r) => ({
    core: r.habits.filter((h) => h.core && !h.archived_at),
    goals: r.goals.filter((g) => g.status === 'active'),
    past: r.arcs.filter((a) => a.ended_on).reverse(),
  }));
  const [arcOpen, setArcOpen] = useState(true);
  const [archOpen, setArchOpen] = useState(false);
  const mini = collapsed && !drawer;
  const close = () => { if (drawer) setDrawer(false); };
  const data = q.data ?? { core: [], goals: [], past: [] };

  return (
    <nav className={s.sidebar} data-mini={mini} aria-label={t('nav.label')}>
      <div className={s.top}>
        <Link to="/" className={s.brand} onClick={close} aria-label="VeyrArc">
          <span className={s.logo} aria-hidden="true"><Icon name="logo" size={18} /></span>
          {!mini && <span className={s.brandText}>VeyrArc</span>}
        </Link>
        {!mini && <span className={s.arcChip}>Arc {roman(hd.arcNumber)} · {hd.arcDay}/{hd.arcLength}</span>}
        {!drawer && (
          <button type="button" className={s.collapse} onClick={onToggle} aria-label={t(collapsed ? 'nav.expand' : 'nav.collapse')} title="[">
            <Icon name="panel" size={16} />
          </button>
        )}
      </div>

      <button type="button" className={s.search} onClick={openPalette} aria-label={t('nav.search')}>
        <Icon name="search" size={15} />
        {!mini && <><span className={s.searchText}>{t('nav.search')}</span><kbd className={s.kbd}>⌘K</kbd></>}
      </button>

      <div className={s.items}>
        {NAV.map((n) => (
          <Link key={n.id} to={n.to} className={s.item} data-active={active === n.id} aria-current={active === n.id ? 'page' : undefined} onClick={close} title={mini ? t(n.label) : undefined}>
            <Icon name={n.icon} size={18} />
            {!mini && <span className={s.itemText}>{t(n.label)}</span>}
            {!mini && <kbd className={s.kbdSoft}>G {n.key.toUpperCase()}</kbd>}
          </Link>
        ))}
      </div>

      {!mini && (
        <>
          <div className={s.sep} />
          <button type="button" className={s.group} onClick={() => setArcOpen(!arcOpen)} aria-expanded={arcOpen}>
            <span>{t('nav.arcSection')} · {roman(hd.arcNumber)}</span><Icon name="chevronDown" size={12} sw={2} />
          </button>
          {arcOpen && (
            <div className={s.nested}>
              {data.core.map((h) => (
                <Link key={h.id} to={`/disciplines?open=${h.id}`} className={s.sub} onClick={close}><span className={s.dot} style={{ background: h.hue }} />{h.name}</Link>
              ))}
              {data.goals.map((g) => (
                <Link key={g.id} to={`/goals/${g.id}`} className={s.sub} data-active={pathname === `/goals/${g.id}`} onClick={close}><Icon name="target" size={13} />{g.title}</Link>
              ))}
              <Link to="/goals?new=1" className={s.subMuted} onClick={close}>{t('nav.addGoal')}</Link>
            </div>
          )}
          <Inbox t={t} />
          {data.past.length > 0 && (
            <>
              <button type="button" className={s.group} onClick={() => setArchOpen(!archOpen)} aria-expanded={archOpen}>
                <span>{t('nav.archive')}</span><Icon name="chevronDown" size={12} sw={2} />
              </button>
              {archOpen && (
                <div className={s.nested}>
                  {data.past.map((a) => <Link key={a.id} to={`/arc/recap/${a.id}`} className={s.sub} onClick={close}>Arc {roman(a.number)}</Link>)}
                </div>
              )}
            </>
          )}
        </>
      )}

      <Link to="/settings/account" className={s.user} onClick={close} title={mini ? userEmail(session) : undefined}>
        <span className={s.userAvatar}><Avatar initials={hd.initials} size={28} fontSize={10} /><i className={s.status} data-on={online || !hasBackend} /></span>
        {!mini && (
          <span className={s.userText}>
            <span className={s.userMail}>{hasBackend ? userEmail(session) || t('auth.account') : 'demo@veyrarc.online'}</span>
            <span className={s.userState}>{online ? t('nav.online') : t('nav.offline')}</span>
          </span>
        )}
      </Link>
    </nav>
  );
}

/** Mobile: the sidebar as a drawer (≡ in the header, or a swipe from the left edge). */
export function SidebarDrawer() {
  const open = useAdd((x) => x.drawerOpen);
  const setDrawer = useAdd((x) => x.setDrawer);
  useEffect(() => {
    let x0: number | null = null;
    const start = (e: TouchEvent) => { x0 = e.touches[0].clientX <= 16 ? e.touches[0].clientX : null; };
    const end = (e: TouchEvent) => { if (x0 != null && e.changedTouches[0].clientX - x0 > 60) setDrawer(true); x0 = null; };
    window.addEventListener('touchstart', start, { passive: true });
    window.addEventListener('touchend', end, { passive: true });
    return () => { window.removeEventListener('touchstart', start); window.removeEventListener('touchend', end); };
  }, [setDrawer]);
  const { pathname } = useLocation();
  useEffect(() => { setDrawer(false); }, [pathname, setDrawer]);
  if (!open) return null;
  return (
    <div className={s.drawerBackdrop} onClick={() => setDrawer(false)}>
      <div className={s.drawer} onClick={(e) => e.stopPropagation()}>
        <Sidebar collapsed={false} onToggle={() => {}} drawer />
      </div>
    </div>
  );
}

/* Last three events (Master Changeset task 26). */
function Inbox({ t }: { t: ReturnType<typeof useT> }) {
  const q = useEvents();
  const list = (q.data ?? []).slice(0, 3);
  if (!list.length) return null;
  return (
    <>
      <div className={s.groupStatic}>{t('events.recent')}</div>
      <div className={s.nested}>
        {list.map((e) => (
          <Link key={e.id} to="/analytics" className={s.event}>
            <Icon name={EVENT_ICON[e.domain] ?? 'check'} size={12} />
            <span className={s.eventText}>{eventText(t, e)}</span>
            <span className={s.eventWhen}>{eventWhen(t, e.at)}</span>
          </Link>
        ))}
      </div>
    </>
  );
}
