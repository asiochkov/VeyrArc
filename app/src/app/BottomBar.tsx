import { Link, useLocation } from 'react-router-dom';
import { useT } from '../i18n';
import { Icon } from '../ui/Icon';
import s from './BottomBar.module.css';
import { DEFAULT_TILE, NAV, navIdFor, useAdd } from './nav';

/* Mobile navigation as a floating dock (design reference: Nothing home UI): a dark pill with five
   icons — the active one lit — and a separate white round «+» next to it. */
export function BottomBar() {
  const t = useT();
  const { pathname } = useLocation();
  const active = navIdFor(pathname);
  const openAdd = useAdd((x) => x.openAdd);
  return (
    <div className={s.dock}>
      <nav className={s.bar} aria-label={t('nav.label')}>
        {NAV.map((n) => (
          <Link key={n.id} to={n.to} className={s.item} data-active={n.id === active} aria-current={n.id === active ? 'page' : undefined} aria-label={t(n.label)}>
            <Icon name={n.icon} size={22} sw={1.7} />
          </Link>
        ))}
      </nav>
      <button type="button" className={s.fab} onClick={() => openAdd(active ? DEFAULT_TILE[active] : null)} aria-label={t('add.title')}>
        <Icon name="plus" size={24} sw={1.8} />
      </button>
    </div>
  );
}
