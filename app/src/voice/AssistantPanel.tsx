import { useEffect } from 'react';
import { useAdd, type AddTile } from '../app/nav';
import { useT } from '../i18n';
import { Icon, type IconName } from '../ui/Icon';
import { AssistantMark } from './AssistantMark';
import { closeAssistant, startVoice, stopVoice, useAssistant, useVoice, voiceSupported } from './voice';
import s from './assistant.module.css';

/*
 * The assistant screen (motion reference: a blue glow at the top, the mark, «Thinking…», the answer
 * rising as a card). Voice first; the row of chips below is the old «+»: add a task, habit, goal
 * step or focus by hand.
 */
const MANUAL: { id: AddTile; icon: IconName }[] = [
  { id: 'event', icon: 'cal' }, { id: 'habit', icon: 'checklist' }, { id: 'goalTask', icon: 'target' }, { id: 'focus', icon: 'bolt' },
];

export function AssistantPanel() {
  const t = useT();
  const open = useAssistant((a) => a.open);
  const { state, heard, reply, ok } = useVoice();
  useEffect(() => {
    if (!open) return;
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') closeAssistant(); };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [open]);
  if (!open) return null;
  const listening = state === 'listening';
  const thinking = state === 'processing';
  const label = !voiceSupported() ? t('voice.noVoice') : t(`voice.state.${state}`);
  const manual = (tile: AddTile) => { closeAssistant(); setTimeout(() => useAdd.getState().openAdd(tile), 260); };
  return (
    <div className={s.root} data-state={state} role="dialog" aria-modal="true" aria-label={t('voice.open')}>
      <div className={s.glow} aria-hidden="true" />
      <button type="button" className={s.close} onClick={closeAssistant} aria-label={t('common.close')}><Icon name="close" size={16} sw={2} /></button>
      <div className={s.head}>
        <button type="button" className={s.mark} data-live={listening || thinking} onClick={listening ? stopVoice : startVoice}
          aria-label={listening ? t('voice.stop') : t('voice.again')}>
          <AssistantMark size={44} />
        </button>
        <div className={s.label}>{label}{(listening || thinking) && <span className={s.dots}><i /><i /><i /></span>}</div>
      </div>
      <div className={s.body}>
        <p className={s.heard} data-empty={!heard}>{heard || (state === 'idle' || listening ? t('voice.hint') : '')}</p>
        {reply && !listening && (
          <div className={s.card} data-ok={ok}>
            <span className={s.cardIcon}><Icon name={ok ? 'check' : 'alert'} size={18} sw={2.2} /></span>
            <span>{reply}</span>
          </div>
        )}
      </div>
      <div className={s.manual}>
        <span className={s.manualLabel}>{t('voice.byHand')}</span>
        <div className={s.chips}>
          {MANUAL.map((m, i) => (
            <button key={m.id} type="button" className={s.chip} style={{ '--k': i } as React.CSSProperties} onClick={() => manual(m.id)}>
              <Icon name={m.icon} size={18} sw={1.8} /><span>{t(`add.tiles.${m.id}`)}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
