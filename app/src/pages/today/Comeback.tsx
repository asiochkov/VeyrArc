import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { roman } from '../../app/AppHeader';
import { startNewArc } from '../../data/settings';
import { daysBetween } from '../../data/model';
import { useT } from '../../i18n';
import { useAuth } from '../../lib/auth';
import { track } from '../../lib/analytics';
import { isoDay } from '../../lib/day';
import { hasBackend } from '../../lib/supabase';
import { activeArc, SYSTEM_KEY, useSystem } from '../../state/system';
import { Sheet } from '../../ui/Sheet';
import { Cta } from '../../ui/primitives';
import { toast } from '../../ui/toast';
import s from './comeback.module.css';

/*
 * Coming back after a pause (audit 1.12.5): no shame, a choice. 5+ days away — «continue the arc
 * from today» first; 14+ days — «start a fresh arc» first. Shown once per return.
 */
const KEY = 'veyrarc.lastSeen';
const read = () => { try { return localStorage.getItem(KEY); } catch { return null; } };
const write = (d: string) => { try { localStorage.setItem(KEY, d); } catch { /* no storage */ } };

export function Comeback() {
  const t = useT();
  const qc = useQueryClient();
  const first = useAuth((x) => x.profile?.first_name) ?? '';
  const q = useSystem((r) => r);
  const [state, setState] = useState<{ gap: number; since: string } | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const sys = q.data;
    if (!sys) return;
    const today = isoDay();
    // the last time seen here, or (new device) the last day anything was marked
    const marked = [...sys.logs.filter((l) => l.done).map((l) => l.day), ...sys.days.filter((d) => d.mood != null).map((d) => d.day)].filter((d) => d < today).sort().pop();
    const seen = read() ?? marked ?? null;
    write(today);
    const arc = activeArc(sys);
    if (!seen || !arc || arc.started_on > seen || !sys.habits.some((h) => !h.archived_at)) return;
    const gap = daysBetween(seen, today);
    if (gap >= 5) { setState({ gap, since: seen }); track('comeback_shown', { gap }); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [!!q.data]);
  if (!state || !q.data) return null;
  const arc = activeArc(q.data)!;
  const day = Math.min(arc.length_days, daysBetween(arc.started_on, isoDay()) + 1);
  const deep = state.gap >= 14;
  const d = new Date(state.since + 'T12:00:00');
  const since = d.toLocaleDateString(t.lang === 'ru' ? 'ru-RU' : 'en-US', { day: 'numeric', month: 'long' });
  const close = () => setState(null);
  const fresh = async () => {
    if (!hasBackend) { close(); return; }
    setBusy(true);
    track('comeback_choice', { choice: 'fresh' });
    try { await startNewArc(); await qc.invalidateQueries({ queryKey: SYSTEM_KEY }); toast.success(t('comeback.freshDone')); close(); }
    catch { toast.error(t('common.saveFailed')); }
    finally { setBusy(false); }
  };
  const keep = <Cta key="keep" variant={deep ? 'ghost' : 'primary'} onClick={() => { track('comeback_choice', { choice: 'keep' }); close(); }}>{t('comeback.keep', { n: roman(arc.number), d: day })}</Cta>;
  const anew = <Cta key="new" variant={deep ? 'primary' : 'ghost'} loading={busy} onClick={() => { void fresh(); }}>{t('comeback.fresh')}</Cta>;
  return (
    <Sheet open onClose={close} label={t('comeback.title', { name: first })}>
      <div className={s.wrap}>
        <span className={s.mark} aria-hidden="true"><i /><i /></span>
        <h2 className={s.title}>{first ? t('comeback.title', { name: first }) : t('comeback.titleNoName')}</h2>
        <p className={s.body}>{t(deep ? 'comeback.bodyDeep' : 'comeback.body', { date: since, n: state.gap })}</p>
        <p className={s.note}>{t('comeback.note')}</p>
        <div className={s.actions}>{deep ? [anew, keep] : [keep, anew]}</div>
      </div>
    </Sheet>
  );
}
