import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useT } from '../i18n';
import { Icon } from '../ui/Icon';
import { NAV, navIdFor, useAddAction } from './nav';
import s from './Rail.module.css';
import { useNavReady } from './useNavReady';

/* `plusInert`: on Settings the design renders "+" as a plain block with no action. */
export function Rail({ plusInert = false }: { plusInert?: boolean }) {
  const t = useT();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const active = navIdFor(pathname);
  const ready = useNavReady(active);
  const addHandler = useAddAction((st) => st.handler);

  const onPlus = () => {
    if (addHandler) addHandler();
    else navigate('/habits', { state: { compose: true } });
  };

  return (
    <nav className={s.rail}>
      {plusInert ? (
        <div className={s.plus} style={{ cursor: 'default' }}>
          <Icon name="plus" size={28} />
        </div>
      ) : (
        <button type="button" className={s.plus} onClick={onPlus} aria-label={t('common.add')}>
          <Icon name="plus" size={28} />
        </button>
      )}
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
            <span className={s.itemIcon}>
              <Icon name={n.icon} size={28} />
            </span>
          </Link>
        ),
      )}
    </nav>
  );
}
