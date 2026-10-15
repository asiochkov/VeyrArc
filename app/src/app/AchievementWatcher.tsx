import { useEffect, useState } from 'react';
import { computeAchievements, type Achievement } from '../data/achievements';
import { useT } from '../i18n';
import { useAuth } from '../lib/auth';
import { isoDay } from '../lib/day';
import { haptic } from '../lib/haptics';
import { useSystem } from '../state/system';
import { Icon } from '../ui/Icon';
import s from './achievement.module.css';

/*
 * The unlock moment (audit 1.9.4): when an achievement becomes true, a card rises with its tier
 * colour and a stronger buzz. The first run only remembers what is already unlocked (no flood).
 */
const KEY = (uid: string) => `veyrarc.ach.${uid}`;
export function AchievementWatcher() {
  const t = useT();
  const uid = useAuth((x) => x.session?.user.id) ?? 'guest';
  const q = useSystem((r) => r);
  const [show, setShow] = useState<Achievement | null>(null);
  useEffect(() => {
    if (!q.data) return;
    const list = computeAchievements(q.data, isoDay());
    const now = list.filter((a) => a.unlocked).map((a) => a.id);
    let seen: string[] | null = null;
    try { seen = JSON.parse(localStorage.getItem(KEY(uid)) ?? 'null'); } catch { /* broken */ }
    try { localStorage.setItem(KEY(uid), JSON.stringify(now)); } catch { /* no storage */ }
    if (!seen) return;
    const fresh = list.find((a) => a.unlocked && !seen!.includes(a.id));
    if (fresh) { haptic('milestone'); setShow(fresh); }
  }, [q.data, uid]);
  useEffect(() => { if (!show) return; const id = setTimeout(() => setShow(null), 5200); return () => clearTimeout(id); }, [show]);
  if (!show) return null;
  return (
    <button type="button" className={s.card} data-tier={show.tier} onClick={() => setShow(null)} role="status">
      <span className={s.medal}><Icon name={show.icon} size={22} sw={1.8} /></span>
      <span className={s.text}><small>{t('ach.unlocked')} · {t(`ach.tier.${show.tier}`)}</small><b>{t.pick(show.label)}</b></span>
    </button>
  );
}
