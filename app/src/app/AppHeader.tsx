import { config } from '../config';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { createPortal } from 'react-dom';
import { useHeader } from '../data/header';
import { useT } from '../i18n';
import { isAnon, signOut, useAuth, isProPlan } from '../lib/auth';
import { hasBackend } from '../lib/supabase';
import { Icon } from '../ui/Icon';
import { Avatar, InfoDialog } from '../ui/primitives';
import { useIsDesktop } from '../lib/useIsDesktop';
import { useAdd } from './nav';
import s from './AppHeader.module.css';

/*
 * One header for every app screen (Master Changeset PROBLEM #01, #19): the arc on the left
 * («Arc II · День 14 из 90», tap → the promise), the avatar menu on the right
 * (Account, Settings, Pro, Sign out). No brand label, no gear.
 */
export function AppHeader({ title, sub, right }: { title?: ReactNode; sub?: ReactNode; right?: ReactNode }) {
  const t = useT();
  const hd = useHeader();
  const [oathOpen, setOathOpen] = useState(false);
  const desktop = useIsDesktop();
  const openPalette = useAdd((x) => x.openPalette);
  return (
    <header className={s.header}>
      <div className={s.left}>
        {title && <h1 className={s.title}>{title}</h1>}
        {sub ?? (
          <button type="button" className={s.arc} onClick={() => setOathOpen(true)} aria-label={t('arc.oathTitle')}>
            {t('arc.chip', { n: roman(hd.arcNumber), d: hd.arcDay, l: hd.arcLength })}
          </button>
        )}
      </div>
      <div className={s.right}>
        {right}
        {!desktop && <button type="button" className={s.menuBtn} onClick={openPalette} aria-label={t('nav.search')}><Icon name="search" size={17} /></button>}
        <AvatarMenu initials={hd.initials} />
      </div>
      <InfoDialog open={oathOpen} title={t('arc.oathTitle')} okLabel={t('common.ok')} onClose={() => setOathOpen(false)}
        body={hd.oath ? <span style={{ fontStyle: 'italic' }}>«{hd.oath}»</span> : t('arc.noOath')} />
    </header>
  );
}

export const roman = (n: number) => ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'][n] ?? String(n);

export function AvatarMenu({ initials }: { initials: string }) {
  const t = useT();
  const navigate = useNavigate();
  const plan = useAuth((x) => x.plan);
  const guest = useAuth((x) => hasBackend && isAnon(x.session));
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  // the menu lives in <body> (above every tile and the dock), placed under the avatar
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null);
  useEffect(() => {
    if (!open) return;
    const place = () => { const r = ref.current?.getBoundingClientRect(); if (r) setPos({ top: r.bottom + 8, right: Math.max(8, window.innerWidth - r.right) }); };
    place();
    window.addEventListener('resize', place); window.addEventListener('scroll', place, true);
    return () => { window.removeEventListener('resize', place); window.removeEventListener('scroll', place, true); };
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const off = (e: MouseEvent | TouchEvent) => { const n = e.target as Node; if (!ref.current?.contains(n) && !menuRef.current?.contains(n)) setOpen(false); };
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', off); document.addEventListener('touchstart', off); window.addEventListener('keydown', key);
    return () => { document.removeEventListener('mousedown', off); document.removeEventListener('touchstart', off); window.removeEventListener('keydown', key); };
  }, [open]);
  const go = (to: string) => { setOpen(false); navigate(to); };
  return (
    <div className={s.menuWrap} ref={ref}>
      <button type="button" className={s.avatarBtn} aria-haspopup="menu" aria-expanded={open} aria-label={t('common.menu')} onClick={() => setOpen(!open)}>
        <Avatar initials={initials} size={40} fontSize={13} />
      </button>
      {open && pos && createPortal(
        <div ref={menuRef} className={s.menu} role="menu" style={{ position: 'fixed', top: pos.top, right: pos.right }}>
          {guest && <button type="button" role="menuitem" className={s.item} onClick={() => go('/signup')}><Icon name="shield" size={16} />{t('menu.saveAccount')}</button>}
          <button type="button" role="menuitem" className={s.item} onClick={() => go('/settings/account')}><Icon name="user" size={16} />{t('auth.account')}</button>
          <button type="button" role="menuitem" className={s.item} onClick={() => go('/settings')}><Icon name="gear" size={16} />{t('settings.title')}</button>
          {!config.beta && <button type="button" role="menuitem" className={s.item} onClick={() => go('/pro')}><Icon name="crown" size={16} />{hasBackend && isProPlan(plan) ? t('menu.proActive') : 'Pro'}</button>}
          <div className={s.sep} />
          <button type="button" role="menuitem" className={s.item} onClick={() => { setOpen(false); if (hasBackend) void signOut().then(() => navigate('/welcome')); else navigate('/welcome'); }}>
            <Icon name="back" size={16} />{t('account.logout')}
          </button>
        </div>,
        document.body,
      )}
    </div>
  );
}
