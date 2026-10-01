import { Link, useLocation } from 'react-router-dom';
import { useT } from '../i18n';
import { Icon } from '../ui/Icon';
import s from './BottomBar.module.css';
import { DEFAULT_TILE, NAV, navIdFor, useAdd } from './nav';

/* Mobile navigation (Master Changeset §16): 64 px, five icons, the active one in accent with its
   label under it (no pill), and the «+» as a 56 px button above the bar in the centre. */
export function BottomBar() {
  const t = useT();
  const { pathname } = useLocation();
  const active = navIdFor(pathname);
  const openAdd = useAdd((x) => x.openAdd);
  return (
    <>
      <button type="button" className={s.fab} onClick={() => openAdd(active ? DEFAULT_TILE[active] : null)} aria-label={t('add.title')}>
        <Icon name="plus" size={24} sw={2.2} />
      </button>
      <nav className={s.bar} aria-label={t('nav.label')}>
        {NAV.map((n) => (
          <Link key={n.id} to={n.to} className={s.item} data-active={n.id === active} aria-current={n.id === active ? 'page' : undefined} aria-label={t(n.label)}>
            <Icon name={n.icon} size={24} />
            {n.id === active && <span className={s.label}>{t(n.label)}</span>}
          </Link>
        ))}
      </nav>
    </>
  );
}
