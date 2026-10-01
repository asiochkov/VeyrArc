import type { ReactNode } from 'react';
import type { T } from '../../i18n';
import type { Cadence, Category, HabitType } from '../../mock/tracker';
import type { IconName } from '../../ui/Icon';
import { StepButton } from '../../ui/primitives';
import s from './tracker.module.css';

/*
 * A5 / A6 (docs/stage-0.md): the design's composer only takes a name. These
 * extra fields are assembled from existing pieces of the design — the
 * composer card, mono caps labels (БЛИЖАЙШАЯ ЦЕЛЬ), the Tracker segment,
 * Today's −/+ stepper, the goal-picker pills and the card icon tiles.
 */

export type HabitDraft = { type: HabitType; target: number; unit: string; minutes: number; cadence: Cadence; category: Category; icon: IconName; hue: string };
export type QuitDraft = { unit: string; norm: number; since: string };

export const defaultQuitDraft = (): QuitDraft => ({ unit: '', norm: 1, since: localDay() });
/* YYYY-MM-DD in the device time zone */
export const localDay = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
/* the timer starts now for today, at local midnight for an earlier day */
export const sinceIso = (day: string) => (day >= localDay() ? new Date().toISOString() : new Date(day + 'T00:00:00').toISOString());

function Label({ children }: { children: ReactNode }) {
  return <div className={s.optLabel}>{children}</div>;
}

function Stepper({ value, onChange, min = 1, step = 1 }: { value: number; onChange: (v: number) => void; min?: number; step?: number }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <StepButton onClick={() => onChange(Math.max(min, value - step))}>−</StepButton>
      <span className={s.optNum}>{value}</span>
      <StepButton onClick={() => onChange(value + step)}>+</StepButton>
    </div>
  );
}


export function QuitOptions({ t, d, set }: { t: T; d: QuitDraft; set: (patch: Partial<QuitDraft>) => void }) {
  return (
    <div className={s.optCard}>
      <Label>{t('tracker.optQuitUnit')}</Label>
      <input className={s.optInput} value={d.unit} placeholder={t('tracker.phQuitUnit')} onChange={(e) => set({ unit: e.target.value })} />
      <Label>{t('tracker.optNorm')}</Label>
      <Stepper value={d.norm} onChange={(norm) => set({ norm })} />
      <Label>{t('tracker.optSince')}</Label>
      <input className={s.optInput} type="date" value={d.since} max={localDay()} onChange={(e) => e.target.value && set({ since: e.target.value })} />
    </div>
  );
}
