import { useEffect, useState } from 'react';
import { DOMAIN_IDS, HABIT_DOMAINS } from '../../data/domains';
import type { HabitRowDb } from '../../data/model';
import { useT } from '../../i18n';
import { HABIT_ICONS, HABIT_PALETTE } from '../../mock/tracker';
import { updateHabit } from '../../state/actions';
import { Icon, type IconName } from '../../ui/Icon';
import { Segmented, StepButton } from '../../ui/primitives';
import { Sheet } from '../../ui/Sheet';
import { toast } from '../../ui/toast';
import d from './disciplines.module.css';

/*
 * Habit setup — step 2 of the composer (Master Changeset RC-14, task 15, A14 custom cadence):
 * name, type (yes/no · counter · time), domain, the weekdays it is planned for,
 * Core/Extra, icon and colour.
 */
const PRESETS = [{ id: 127, key: 'daily' }, { id: 31, key: 'weekdays' }, { id: 96, key: 'weekends' }] as const;

export function HabitSetup({ habit, onClose, coreLimit, coreN, onLimit }: { habit: HabitRowDb | null; onClose: () => void; coreLimit: number; coreN: number; onLimit: () => void }) {
  const t = useT();
  const [h, setH] = useState<HabitRowDb | null>(habit);
  useEffect(() => { setH(habit); }, [habit]);
  if (!h) return null;
  const set = (p: Partial<HabitRowDb>) => setH((x) => (x ? { ...x, ...p } : x));
  const dows = t.list('weekdays.short');
  const save = () => {
    if (!habit) return;
    const name = h.name.trim().slice(0, 80);
    if (!name) return;
    if (h.core && !habit.core && coreN >= coreLimit) { onLimit(); return; }
    updateHabit(habit.id, {
      name, type: h.type, target: h.type === 'counter' ? Math.max(1, h.target ?? 1) : null, unit: h.type === 'counter' ? (h.unit ?? '').trim() || null : null,
      minutes: h.type === 'duration' ? Math.max(1, h.minutes ?? 20) : null, days: h.days || 127, category: h.category, core: h.core, icon: h.icon, hue: h.hue,
    });
    toast.success(t('disc.saved'));
    onClose();
  };
  return (
    <Sheet open={!!habit} onClose={onClose} title={t('disc.setupTitle')}>
      <div className={d.setup}>
        <input className={d.field} value={h.name} maxLength={80} onChange={(e) => set({ name: e.target.value })} aria-label={t('disc.name')} />

        <div className={d.label}>{t('tracker.optType')}</div>
        <Segmented variant="tracker" value={h.type} onChange={(type) => set({ type, target: type === 'counter' ? h.target ?? 8 : h.target, minutes: type === 'duration' ? h.minutes ?? 20 : h.minutes })}
          options={(['binary', 'counter', 'duration'] as const).map((id) => ({ id, label: t(`tracker.types.${id}`) }))} />
        {h.type === 'counter' && (
          <div className={d.inline}>
            <StepButton onClick={() => set({ target: Math.max(1, (h.target ?? 1) - 1) })} aria-label="−1">−</StepButton>
            <span className={d.num}>{h.target ?? 1}</span>
            <StepButton onClick={() => set({ target: (h.target ?? 1) + 1 })} aria-label="+1">+</StepButton>
            <input className={d.field} style={{ flex: 1 }} value={h.unit ?? ''} maxLength={20} placeholder={t('tracker.optUnit')} onChange={(e) => set({ unit: e.target.value })} />
          </div>
        )}
        {h.type === 'duration' && (
          <div className={d.inline}>
            <StepButton onClick={() => set({ minutes: Math.max(5, (h.minutes ?? 20) - 5) })} aria-label="−5">−</StepButton>
            <span className={d.num}>{t('units.min', { m: h.minutes ?? 20 })}</span>
            <StepButton onClick={() => set({ minutes: (h.minutes ?? 20) + 5 })} aria-label="+5">+</StepButton>
          </div>
        )}

        <div className={d.label}>{t('disc.domain')}</div>
        <div className={d.pills}>
          {DOMAIN_IDS.map((id) => (
            <button key={id} type="button" className={d.pill} aria-pressed={h.category === id} onClick={() => set({ category: id })}
              style={h.category === id ? { borderColor: HABIT_DOMAINS[id].hue, color: HABIT_DOMAINS[id].hue } : undefined}>
              <i style={{ background: HABIT_DOMAINS[id].hue }} />{t(HABIT_DOMAINS[id].label)}
            </button>
          ))}
        </div>

        <div className={d.label}>{t('tracker.optCadence')}</div>
        <div className={d.pills}>
          {PRESETS.map((p) => <button key={p.id} type="button" className={d.pill} aria-pressed={h.days === p.id} onClick={() => set({ days: p.id })}>{t(`tracker.cadences.${p.key}`)}</button>)}
        </div>
        <div className={d.days} role="group" aria-label={t('disc.customDays')}>
          {dows.map((w, i) => {
            const on = (h.days & (1 << i)) !== 0;
            return <button key={w} type="button" className={d.day} aria-pressed={on} onClick={() => { const next = h.days ^ (1 << i); if (next) set({ days: next }); }}>{w}</button>;
          })}
        </div>

        <div className={d.label}>Core / Extra</div>
        <div className={d.pills}>
          <button type="button" className={d.pill} aria-pressed={h.core} onClick={() => set({ core: true })}>Core</button>
          <button type="button" className={d.pill} aria-pressed={!h.core} onClick={() => set({ core: false })}>Extra</button>
        </div>
        <div className={d.hint}>{h.core ? t('disc.coreExplain') : t('disc.extraExplain')}</div>

        <div className={d.label}>{t('tracker.optIcon')}</div>
        <div className={d.pills}>
          {HABIT_ICONS.map((ic: IconName) => (
            <button key={ic} type="button" className={d.iconPick} aria-pressed={h.icon === ic} aria-label={ic} onClick={() => set({ icon: ic })}><Icon name={ic} size={16} /></button>
          ))}
        </div>
        <div className={d.label}>{t('tracker.optColor')}</div>
        <div className={d.pills}>
          {HABIT_PALETTE.map((c) => <button key={c} type="button" className={d.swatch} aria-pressed={h.hue === c} aria-label={c} style={{ background: c }} onClick={() => set({ hue: c })} />)}
        </div>

        <button type="button" className={d.addBtn} style={{ width: '100%', marginTop: 16 }} disabled={!h.name.trim()} onClick={save}>{t('account.save')}</button>
      </div>
    </Sheet>
  );
}
