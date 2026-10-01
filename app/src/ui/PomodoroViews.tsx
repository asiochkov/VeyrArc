import { useEffect, useState } from 'react';
import { useT } from '../i18n';
import { isoDay } from '../lib/day';
import { scheduled } from '../data/model';
import { useSystem, type SystemRaw } from '../state/system';
import { fmtClock, pomo, remaining, usePomodoro, type PomoLink, type PomoTab } from '../state/pomodoro';
import { Icon } from './Icon';
import { Segmented } from './primitives';
import { Sheet } from './Sheet';
import s from './pomodoro.module.css';

const CHOICES: number[][] = [[15, 20, 25, 30, 45, 50, 60, 90], [3, 5, 10], [10, 15, 20, 30]];

/** Re-renders every second while the timer runs and finishes the session at zero. */
function useTick() {
  const st = usePomodoro();
  const [, setN] = useState(0);
  const session = useSessionNo();
  useEffect(() => {
    if (!st.endsAt) return;
    const id = setInterval(() => setN((x) => x + 1), 1000);
    const vis = () => setN((x) => x + 1);
    document.addEventListener('visibilitychange', vis);
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', vis); };
  }, [st.endsAt]);
  const left = remaining(st);
  useEffect(() => { if (st.endsAt && left === 0) pomo.complete(session); }, [left, st.endsAt, session]);
  return { ...st, left };
}

/** Number of the current focus session in the 4-session cycle, from today's saved sessions. */
function useSessionNo() {
  const q = useSystem((r) => r.focus.filter((f) => f.completed && (f.session_type ?? 'focus') === 'focus' && isoDay(new Date(f.started_at)) === r.day).length);
  return ((q.data ?? 0) % 4) + 1;
}

type LinkOption = { key: string; link: PomoLink; label: string; kind: 'goal' | 'habit' | 'event' | 'none' };
function linkOptions(r: SystemRaw, none: string): LinkOption[] {
  const day = r.day;
  return [
    { key: 'none', link: {}, label: none, kind: 'none' },
    ...r.goals.filter((g) => g.status === 'active').map((g) => ({ key: 'g' + g.id, link: { goalId: g.id, label: g.title }, label: g.title, kind: 'goal' as const })),
    ...r.habits.filter((h) => !h.archived_at && h.type === 'duration' && scheduled(h, day)).map((h) => ({ key: 'h' + h.id, link: { habitId: h.id, label: h.name }, label: h.name, kind: 'habit' as const })),
    ...r.plan.filter((p) => p.day === day && !p.done).map((p) => ({ key: 'e' + p.id, link: { eventId: p.id, label: p.title }, label: (p.starts_at ? p.starts_at.slice(0, 5) + ' ' : '') + p.title, kind: 'event' as const })),
  ];
}

/** The full timer (sheet): tabs, clock, controls, what the focus is for, durations. */
export function PomodoroSheet() {
  const t = useT();
  const st = useTick();
  const session = useSessionNo();
  const opts = useSystem((r) => linkOptions(r, t('pomo.noLink'))).data ?? [{ key: 'none', link: {}, label: t('pomo.noLink'), kind: 'none' as const }];
  const [tuning, setTuning] = useState(false);
  const [picking, setPicking] = useState(false);
  const labels = t.list('today.tabs');
  const cur = st.link.goalId ? 'g' + st.link.goalId : st.link.habitId ? 'h' + st.link.habitId : st.link.eventId ? 'e' + st.link.eventId : 'none';
  const curLabel = opts.find((o) => o.key === cur)?.label ?? st.link.label ?? t('pomo.noLink');
  return (
    <Sheet open={st.open} onClose={pomo.closeSheet} title={t('pomo.title')}>
      <Segmented variant="pomodoro" value={String(st.tab)} onChange={(v) => pomo.setTab(Number(v) as PomoTab)} options={labels.map((l, i) => ({ id: String(i), label: l }))} />
      {st.tab === 0 && (
        <button type="button" className={s.linkChip} aria-expanded={picking} onClick={() => setPicking(!picking)}>
          <span className={s.linkPre}>{t('pomo.for')}</span><span className={s.linkName}>{curLabel}</span><Icon name="chevronDown" size={14} sw={2} />
        </button>
      )}
      {picking && (
        <div className={s.linkList} role="listbox">
          {opts.map((o) => (
            <button key={o.key} type="button" role="option" aria-selected={o.key === cur} className={s.linkOpt} onClick={() => { pomo.setLink(o.link); setPicking(false); }}>
              <span className={s.linkKind}>{t(`pomo.kind.${o.kind}`)}</span>{o.label}
            </button>
          ))}
        </div>
      )}
      <div className={s.clock} role="timer">{fmtClock(st.left)}</div>
      <div className={s.session}>{st.tab === 0 ? t('today.session', { a: session, b: 4 }) : t('pomo.break')}</div>
      <div className={s.controls}>
        <button type="button" className={s.ctrl} onClick={pomo.reset} aria-label={t('today.pomoReset')}><Icon name="reset" size={18} /></button>
        <button type="button" className={s.play} onClick={() => { pomo.toggle(); if (!st.endsAt) pomo.closeSheet(); }} aria-label={t(st.endsAt ? 'today.pomoPause' : 'today.pomoStart')}>
          <Icon name={st.endsAt ? 'pause' : 'play'} size={22} color="#06121f" />
        </button>
        <button type="button" className={s.ctrl} aria-expanded={tuning} onClick={() => setTuning(!tuning)} aria-label={t('today.pomoSettings')}><Icon name="tune" size={18} /></button>
      </div>
      {tuning && (
        <div className={s.tune}>
          {labels.map((l, i) => (
            <div key={l} className={s.tuneRow}>
              <span>{l}</span>
              <div className={s.tuneOpts}>
                {CHOICES[i].map((m) => (
                  <button key={m} type="button" data-hit="off" className={s.opt} aria-pressed={st.lengths[i] === m} onClick={() => pomo.setLength(i as PomoTab, m)}>{m}</button>
                ))}
              </div>
            </div>
          ))}
          <div className={s.tuneNote}>{t('pomo.minutes')}</div>
        </div>
      )}
    </Sheet>
  );
}

/** Mini player: visible on every screen while a session runs or is paused mid-way. */
export function DockedPomodoro() {
  const t = useT();
  const st = useTick();
  const full = st.lengths[st.tab] * 60;
  const active = !!st.endsAt || (st.left > 0 && st.left < full);
  if (!active || st.open) return null;
  const pct = 1 - st.left / full;
  return (
    <div className={s.dock} role="region" aria-label={t('pomo.title')}>
      <button type="button" className={s.dockMain} onClick={() => pomo.openSheet()} aria-label={t('pomo.expand')}>
        <span className={s.dockRing} style={{ background: `conic-gradient(var(--accent) ${pct * 360}deg, var(--w-08) 0)` }} aria-hidden="true" />
        <span className={s.dockText}>
          <span className={s.dockClock}>{fmtClock(st.left)}</span>
          <span className={s.dockLabel}>{st.tab === 0 ? (st.link.label ?? t('pomo.focus')) : t('pomo.break')}</span>
        </span>
      </button>
      <button type="button" className={s.dockBtn} onClick={pomo.toggle} aria-label={t(st.endsAt ? 'today.pomoPause' : 'today.pomoStart')}>
        <Icon name={st.endsAt ? 'pause' : 'play'} size={16} />
      </button>
    </div>
  );
}
