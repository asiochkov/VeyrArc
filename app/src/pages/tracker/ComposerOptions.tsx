import type { ReactNode } from 'react';
import type { T } from '../../i18n';
import { CATEGORIES, HABIT_ICONS, HABIT_PALETTE, type Cadence, type Category, type HabitType } from '../../mock/tracker';
import { Icon, type IconName } from '../../ui/Icon';
import { Segmented, StepButton } from '../../ui/primitives';
import s from './tracker.module.css';

/*
 * A5 / A6 (docs/stage-0.md): the design's composer only takes a name. These
 * extra fields are assembled from existing pieces of the design — the
 * composer card, mono caps labels (БЛИЖАЙШАЯ ЦЕЛЬ), the Tracker segment,
 * Today's −/+ stepper, the goal-picker pills and the card icon tiles.
 */

export type HabitDraft = { type: HabitType; target: number; unit: string; minutes: number; cadence: Cadence; category: Category; icon: IconName; hue: string };
export type QuitDraft = { unit: string; norm: number; since: string };

export const defaultHabitDraft = (hue: string): HabitDraft => ({ type: 'binary', target: 8, unit: '', minutes: 20, cadence: 'daily', category: 'body', icon: 'doc', hue });
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

function Pills<V extends string>({ options, value, onChange, hue }: { options: { id: V; label: string }[]; value: V; onChange: (v: V) => void; hue: string }) {
  return (
    <div className={s.optPills}>
      {options.map((o) => (
        <button key={o.id} type="button" className={s.optPill} aria-pressed={o.id === value} onClick={() => onChange(o.id)}
          style={o.id === value ? { background: hue, color: '#06121f' } : undefined}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function HabitOptions({ t, d, set }: { t: T; d: HabitDraft; set: (patch: Partial<HabitDraft>) => void }) {
  return (
    <div className={s.optCard}>
      <Label>{t('tracker.optType')}</Label>
      <Segmented variant="tracker" value={d.type} onChange={(type) => set({ type })}
        options={(['binary', 'counter', 'duration'] as HabitType[]).map((id) => ({ id, label: t(`tracker.types.${id}`) }))} />

      {d.type === 'counter' && (
        <>
          <Label>{t('tracker.optTarget')}</Label>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Stepper value={d.target} onChange={(target) => set({ target })} />
            <input className={s.optInput} value={d.unit} placeholder={t('tracker.optUnit')} onChange={(e) => set({ unit: e.target.value })} />
          </div>
        </>
      )}
      {d.type === 'duration' && (
        <>
          <Label>{t('tracker.optMinutes')}</Label>
          <Stepper value={d.minutes} onChange={(minutes) => set({ minutes })} min={5} step={5} />
        </>
      )}

      <Label>{t('tracker.optCadence')}</Label>
      <Pills hue={d.hue} value={d.cadence} onChange={(cadence) => set({ cadence })}
        options={(['daily', 'weekdays', 'weekends'] as Cadence[]).map((id) => ({ id, label: t(`tracker.cadences.${id}`) }))} />

      <Label>{t('tracker.optCategory')}</Label>
      <Pills hue={d.hue} value={d.category} onChange={(category) => set({ category })}
        options={CATEGORIES.map((id) => ({ id, label: t(`categories.${id}`) }))} />

      <Label>{t('tracker.optIcon')}</Label>
      <div className={s.optPills}>
        {HABIT_ICONS.map((ic) => (
          <button key={ic} type="button" className={s.iconWrap} aria-pressed={d.icon === ic} onClick={() => set({ icon: ic })}
            style={d.icon === ic ? { background: d.hue + '26', color: d.hue, border: `1px solid ${d.hue}` } : { background: 'rgba(255,255,255,.05)', color: 'rgba(232,237,243,.55)', border: '1px solid transparent', cursor: 'pointer' }}>
            <Icon name={ic} size={17} />
          </button>
        ))}
      </div>

      <Label>{t('tracker.optColor')}</Label>
      <div className={s.optPills}>
        {HABIT_PALETTE.map((c) => (
          <button key={c} type="button" className={s.optColor} aria-pressed={d.hue === c} aria-label={c} onClick={() => set({ hue: c })}
            style={{ background: c, boxShadow: d.hue === c ? `0 0 0 2px #05070A, 0 0 0 4px ${c}` : undefined }} />
        ))}
      </div>
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
