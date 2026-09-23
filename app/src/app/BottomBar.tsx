import { Link, useLocation } from 'react-router-dom';
import { useT } from '../i18n';
import { Icon } from '../ui/Icon';
import s from './BottomBar.module.css';
import { NAV, navIdFor } from './nav';
import { useNavReady } from './useNavReady';

export function BottomBar() {
  const t = useT();
  const { pathname } = useLocation();
  const active = navIdFor(pathname);
  const ready = useNavReady(active);

  return (
    <nav className={s.bar}>
      {NAV.map((n) =>
        n.id === active ? (
          <div key={n.id} className={`${s.active} ${ready ? s.ready : ''}`} aria-current="page">
            <span className={s.activeIcon}>
              <Icon name={n.icon} size={28} />
            </span>
            <span className={s.activeLabel}>{t(n.label)}</span>
          </div>
        ) : (
          <Link key={n.id} to={n.to} className={s.item} aria-label={t(n.label)}>
            <Icon name={n.icon} size={28} />
          </Link>
        ),
      )}
    </nav>
  );
}
