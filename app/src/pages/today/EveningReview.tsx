import { useEffect, useState } from 'react';
import { useT } from '../../i18n';
import { isoDay } from '../../lib/day';
import { db, hasBackend } from '../../lib/supabase';
import { addDays } from '../../data/model';
import { mutate } from '../../data/sync';
import { logMood, saveEvent } from '../../state/actions';
import { getSystem, patchSystem } from '../../state/system';
import { MoodFace } from '../../ui/primitives';
import { Sheet } from '../../ui/Sheet';
import { toast } from '../../ui/toast';
import c from './cockpit.module.css';
import { markReviewDone } from './useToday';

/*
 * Evening Review (Master Changeset RC-12, A6, task 21): the day gets an end.
 * 1 mood → 2 one line about the day → 3 up to three slots for tomorrow (they land in the Planner).
 * Every step can be skipped; Enter moves on.
 */
const DEFAULT_TIMES = ['09:00', '13:00', '17:00'];

export function EveningReview({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useT();
  const words = t.list('today.moodWords');
  const [step, setStep] = useState(0);
  const [mood, setMood] = useState<number | null>(null);
  const [note, setNote] = useState('');
  const [slots, setSlots] = useState(DEFAULT_TIMES.map((time) => ({ time, title: '' })));
  useEffect(() => {
    if (!open) return;
    const sys = getSystem();
    const d = sys?.days.find((x) => x.day === isoDay());
    setStep(0); setMood(d?.mood ? d.mood - 1 : null); setNote(d?.note ?? ''); setSlots(DEFAULT_TIMES.map((time) => ({ time, title: '' })));
  }, [open]);

  const finish = () => {
    const day = isoDay();
    if (mood != null) logMood(mood, day);
    const text = note.trim().slice(0, 500);
    if (text) {
      patchSystem((r) => ({ ...r, days: r.days.some((x) => x.day === day) ? r.days.map((x) => (x.day === day ? { ...x, note: text } : x)) : [...r.days, { day, mood: null, water: 0, frozen: false, note: text }] }));
      if (hasBackend) mutate(async () => { const r = await db().from('day_entries').upsert({ day, note: text }, { onConflict: 'user_id,day' }); if (r.error) throw r.error; });
    }
    const tomorrow = addDays(day, 1);
    const planned = slots.filter((s) => s.title.trim());
    for (const s of planned) {
      const [h, m] = s.time.split(':').map(Number);
      const end = `${String(Math.min(23, h + 1)).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
      saveEvent({ id: crypto.randomUUID(), title: s.title.trim(), day: tomorrow, starts_at: s.time, ends_at: end, note: null, done: false, category_id: null }, true);
    }
    markReviewDone(day);
    toast.success(planned.length ? t('review.savedWithPlan', { n: planned.length }) : t('review.saved'));
    onClose();
  };
  const next = () => (step < 2 ? setStep(step + 1) : finish());

  return (
    <Sheet open={open} onClose={onClose} title={t('review.title')}>
      <div className={c.steps} aria-label={t('review.step', { n: step + 1 })}>{[0, 1, 2].map((i) => <i key={i} data-on={i <= step} />)}</div>
      {step === 0 && (
        <>
          <div className={c.sheetQ}>{t('review.q1')}</div>
          <div className={c.moods} style={{ marginTop: 14 }}>
            {[0, 1, 2, 3, 4].map((i) => (
              <button key={i} type="button" className={c.moodBtn} aria-pressed={mood === i} aria-label={words[i]} onClick={() => setMood(i)}>
                <MoodFace level={i} color={mood === i ? '#FFFFFF' : 'rgba(232,237,243,.45)'} />
              </button>
            ))}
          </div>
        </>
      )}
      {step === 1 && (
        <>
          <div className={c.sheetQ}>{t('review.q2')}</div>
          <textarea className={c.textarea} value={note} maxLength={500} autoFocus placeholder={t('review.notePh')}
            onChange={(e) => setNote(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); next(); } }} />
        </>
      )}
      {step === 2 && (
        <>
          <div className={c.sheetQ}>{t('review.q3')}</div>
          <div className={c.slots}>
            {slots.map((s, i) => (
              <div key={i} className={c.slot}>
                <input type="time" className={c.slotTime} value={s.time} step={900} aria-label={t('calendar.start')}
                  onChange={(e) => setSlots((l) => l.map((x, j) => (j === i ? { ...x, time: e.target.value || x.time } : x)))} />
                <input className={c.slotTitle} value={s.title} maxLength={120} placeholder={t('review.slotPh')} autoFocus={i === 0}
                  onChange={(e) => setSlots((l) => l.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)))} onKeyDown={(e) => { if (e.key === 'Enter') next(); }} />
              </div>
            ))}
          </div>
        </>
      )}
      <div className={c.sheetActions}>
        <button type="button" className={c.ghost} onClick={next}>{step < 2 ? t('common.skip') : t('review.skipPlan')}</button>
        <button type="button" className={c.primary} onClick={next}>{step < 2 ? t('common.next') : t('review.finish')}</button>
      </div>
    </Sheet>
  );
}
