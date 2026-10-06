import { useEffect } from 'react';
import { useT } from '../i18n';
import { Icon } from '../ui/Icon';
import { closeAssistant, startVoice, stopVoice, useAssistant, useVoice, voiceSupported } from './voice';
import s from './assistant.module.css';

/*
 * The assistant screen («Сфера»): a live blue orb in the middle — it breathes while listening, pulses
 * faster while thinking, turns white when done, red on an error — and only words under it. Tap the
 * orb to speak again or to stop. No manual actions here: each section has its own «+».
 */
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
  const look = !ok || state === 'error' ? 'error' : listening ? 'listening' : state === 'processing' ? 'processing' : reply ? 'done' : 'idle';
  const label = !voiceSupported() ? t('voice.noVoice') : t(`voice.state.${look === 'error' ? 'error' : state}`);
  return (
    <div className={s.root} data-look={look} role="dialog" aria-modal="true" aria-label={t('voice.open')}>
      <button type="button" className={s.close} onClick={closeAssistant} aria-label={t('common.close')}><Icon name="close" size={16} sw={2} /></button>
      <div className={s.stage}>
        <button type="button" className={s.orb} onClick={listening ? stopVoice : startVoice}
          aria-label={listening ? t('voice.stop') : t('voice.again')}>
          <i /><i /><i />
          <span className={s.core}>{look === 'done' && <Icon name="check" size={30} sw={2.4} />}</span>
        </button>
      </div>
      <div className={s.words} aria-live="polite">
        <span className={s.label}>{label}</span>
        <p key={heard || 'hint'} className={s.heard} data-empty={!heard}>{heard || (state === 'idle' || listening ? t('voice.hint') : '')}</p>
        <p key={reply} className={s.reply}>{!listening && reply}</p>
      </div>
    </div>
  );
}
