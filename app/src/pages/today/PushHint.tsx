import { useState } from 'react';
import { useT } from '../../i18n';
import { askPermission, pushStatus } from '../../lib/reminders';
import { useSystem } from '../../state/system';
import { Icon } from '../../ui/Icon';
import h from './home.module.css';

/*
 * Reminders only help if they can arrive. After the first check-in (the moment the person sees the
 * value) Today says so: on a phone that can allow them — one tap; on an iPhone in Safari — the one
 * step that makes them work (Share → Add to Home Screen). Dismissed for a week.
 */
const KEY = 'veyrarc.pushHintOff';
const off = () => { try { const v = Number(localStorage.getItem(KEY)); return !!v && Date.now() - v < 7 * 86400000; } catch { return false; } };

export function PushHint({ style }: { style?: React.CSSProperties }) {
  const t = useT();
  const checked = useSystem((r) => r.logs.some((l) => l.done)).data ?? false;
  const [status, setStatus] = useState(pushStatus);
  const [gone, setGone] = useState(off);
  if (!checked || gone || (status !== 'ask' && status !== 'home')) return null;
  const close = () => { try { localStorage.setItem(KEY, String(Date.now())); } catch { /* no storage */ } setGone(true); };
  return (
    <div className={`${h.tile} ${h.wide} ${h.pushHint}`} style={style} role="status">
      <span className={h.circle}><Icon name="bell" size={18} sw={1.8} /></span>
      <span className={h.tileText}>
        <span className={h.tileName}>{t(status === 'home' ? 'pushHint.homeTitle' : 'pushHint.askTitle')}</span>
        <span className={h.tileSub}>{t(status === 'home' ? 'pushHint.homeBody' : 'pushHint.askBody')}</span>
      </span>
      {status === 'ask' && <button type="button" className={h.pushBtn} onClick={() => { void askPermission().then(() => setStatus(pushStatus())); }}>{t('auth.allow')}</button>}
      <button type="button" className={h.pushClose} onClick={close} aria-label={t('common.close')}><Icon name="close" size={14} sw={2} /></button>
    </div>
  );
}
