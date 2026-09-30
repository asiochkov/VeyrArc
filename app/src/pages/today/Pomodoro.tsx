import { useEffect, useRef, useState } from 'react';
import type { T } from '../../i18n';
import { Icon } from '../../ui/Icon';
import { Segmented } from '../../ui/primitives';
import s from './today.module.css';

/* Pomodoro «Фокус / Короткий / Длинный». The countdown runs off an end timestamp, so it stays right
   after the phone was locked, and only this card re-renders every second. Lengths are the user's
   choice (⚙), kept on the device. */
const KEY = 'veyrarc.pomodoro';
type Lengths = [number, number, number];
const DEFAULT: Lengths = [25, 5, 15];
const CHOICES: number[][] = [[15, 20, 25, 30, 45, 50, 60], [3, 5, 10], [10, 15, 20, 30]];
const load = (): Lengths => {
  try { const v = JSON.parse(localStorage.getItem(KEY) || 'null'); if (Array.isArray(v) && v.length === 3 && v.every((x) => x > 0)) return v as Lengths; } catch { /* no storage */ }
  return DEFAULT;
};

export function Pomodoro({ t, big, session, perCycle, summary, onFocusDone }: {
  t: T; big: boolean; session: number; perCycle: number; summary: React.ReactNode; onFocusDone: (minutes: number) => number;
}) {
  const [len, setLen] = useState<Lengths>(load);
  const [tab, setTab] = useState(0);
  const [left, setLeft] = useState(len[0] * 60); // seconds, while paused
  const [endsAt, setEndsAt] = useState<number | null>(null); // while running
  const [, tick] = useState(0);
  const [tuning, setTuning] = useState(false);
  const doneRef = useRef(false);

  const remaining = endsAt ? Math.max(0, Math.round((endsAt - Date.now()) / 1000)) : left;
  useEffect(() => {
    if (!endsAt) return;
    doneRef.current = false;
    const id = setInterval(() => tick((x) => x + 1), 1000);
    const vis = () => tick((x) => x + 1);
    document.addEventListener('visibilitychange', vis);
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', vis); };
  }, [endsAt]);

  const goTab = (i: number, l = len) => { setTab(i); setEndsAt(null); setLeft(l[i] * 60); };
  useEffect(() => {
    if (!endsAt || remaining > 0 || doneRef.current) return;
    doneRef.current = true;
    navigator.vibrate?.([30, 60, 30]);
    if (tab === 0) { const cur = onFocusDone(len[0]); goTab(cur === 4 ? 2 : 1); } else goTab(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remaining, endsAt]);

  const toggle = () => {
    if (endsAt) { setLeft(remaining); setEndsAt(null); } else setEndsAt(Date.now() + remaining * 1000);
  };
  const reset = () => { setEndsAt(null); setLeft(len[tab] * 60); };
  const pick = (i: number, m: number) => {
    const next = [...len] as Lengths;
    next[i] = m;
    setLen(next);
    try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* no storage */ }
    if (i === tab && !endsAt) setLeft(m * 60);
  };
  const label = `${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, '0')}`;
  const labels = t.list('today.tabs');

  return (
    <>
      <Segmented variant="pomodoro" value={String(tab)} onChange={(v) => goTab(Number(v))} options={labels.map((l, i) => ({ id: String(i), label: l }))} />
      <div style={{ textAlign: 'center', marginTop: big ? 18 : 16 }}>
        <div className={s.timerBig} style={{ fontSize: big ? 68 : 60, letterSpacing: '.01em' }} role="timer" aria-live="off">{label}</div>
        <div className={s.sessionLine} style={{ marginTop: big ? 10 : 8 }}>{t('today.session', { a: session, b: perCycle })}</div>
      </div>
      <div className={s.controls} style={{ marginTop: big ? 20 : 16 }}>
        <button type="button" className={s.ctrlSmall} onClick={reset} aria-label={t('today.pomoReset')}><Icon name="reset" size={18} /></button>
        <button type="button" className={s.ctrlPlay} style={{ width: big ? 60 : 58, height: big ? 60 : 58 }} onClick={toggle} aria-label={t(endsAt ? 'today.pomoPause' : 'today.pomoStart')}>
          <Icon name={endsAt ? 'pause' : 'play'} size={22} color="#06121f" />
        </button>
        <button type="button" className={s.ctrlSmall} aria-expanded={tuning} onClick={() => setTuning(!tuning)} aria-label={t('today.pomoSettings')}
          style={tuning ? { color: 'var(--link)', borderColor: 'var(--ice-30)' } : undefined}><Icon name="tune" size={18} /></button>
      </div>
      {tuning && (
        <div className={s.pomoTune}>
          {labels.map((l, i) => (
            <div key={l} className={s.pomoTuneRow}>
              <span>{l}</span>
              <div className={s.pomoTuneOpts}>
                {CHOICES[i].map((m) => (
                  <button key={m} type="button" data-hit="off" className={s.pomoOpt} aria-pressed={len[i] === m} onClick={() => pick(i, m)}>{m}</button>
                ))}
              </div>
            </div>
          ))}
          <div className={s.pomoTuneNote}>{t('today.pomoMinutes')}</div>
        </div>
      )}
      <div className={s.pomoSummary} style={{ marginTop: big ? 20 : 16, paddingTop: big ? 16 : 14 }}>{summary}</div>
    </>
  );
}
