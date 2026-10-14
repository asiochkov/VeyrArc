import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useT } from '../i18n';
import { Icon } from '../ui/Icon';
import { bindNavigate } from './run';
import { choose, closeAssistant, handle, startVoice, stopVoice, useAssistant, useVoice, voiceSupported } from './voice';
import s from './assistant.module.css';

/*
 * The assistant screen («Сфера»): a live blue orb in the middle — it breathes while listening, pulses
 * faster while thinking, turns white when done, red on an error — and only words under it.
 * Under the answer: what it lists (the plan, what is left), the options when it asks back, phrases to
 * tap when it did not understand, «Отменить» after a change. A small «Написать» line types instead of
 * speaking (and is the default where the browser has no speech recognition).
 */
export function AssistantPanel() {
  const t = useT();
  const navigate = useNavigate();
  const open = useAssistant((a) => a.open);
  const { state, heard, reply, ok, list, suggest, choices, canUndo } = useVoice();
  const voice = voiceSupported();
  const [typing, setTyping] = useState(false);
  const [text, setText] = useState('');
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => { bindNavigate((to) => navigate(to)); return () => bindNavigate(null); }, [navigate]);
  useEffect(() => {
    if (!open) { setTyping(false); setText(''); return; }
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') closeAssistant(); };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [open]);
  useEffect(() => { if (open && (typing || !voice)) setTimeout(() => input.current?.focus(), 380); }, [open, typing, voice]);
  if (!open) return null;
  const listening = state === 'listening';
  const asking = choices.length > 0; // the question stays on screen while the answer is heard
  const look = !ok || state === 'error' ? 'error' : listening ? 'listening' : state === 'processing' ? 'processing' : reply ? 'done' : 'idle';
  const label = choices.length && !listening ? t('voice.asking') : !voice && state === 'idle' ? t('voice.typeHint') : t(`voice.state.${look === 'error' ? 'error' : state}`);
  const send = (e?: React.FormEvent) => { e?.preventDefault(); const v = text.trim(); if (!v) return; setText(''); handle(v); };
  const say = (phrase: string) => { setText(''); handle(phrase); };
  const orbTap = () => { if (!voice) { setTyping(true); input.current?.focus(); return; } if (listening) stopVoice(); else startVoice(); };
  return (
    <div className={s.root} data-look={look} data-rich={!listening && (list.length > 0 || suggest.length > 3 || choices.length > 0)} role="dialog" aria-modal="true" aria-label={t('voice.open')}>
      <button type="button" className={s.close} onClick={closeAssistant} aria-label={t('common.close')}><Icon name="close" size={16} sw={2} /></button>
      <div className={s.stage}>
        <button type="button" className={s.orb} onClick={orbTap} aria-label={listening ? t('voice.stop') : t('voice.again')}>
          <i /><i /><i />
          <span className={s.core}>{look === 'done' && <Icon name="check" size={30} sw={2.4} />}</span>
        </button>
      </div>
      <div className={s.words} aria-live="polite">
        <span className={s.label}>{label}</span>
        <p key={heard || 'hint'} className={s.heard} data-empty={!heard}>{heard || (asking ? '' : state === 'idle' || listening ? t(voice ? 'voice.hint' : 'voice.hintType') : '')}</p>
        <p key={reply} className={s.reply}>{(!listening || asking) && reply}</p>
        {!listening && list.length > 0 && (
          <ul className={s.list}>{list.slice(0, 8).map((x, i) => <li key={x + i} style={{ '--k': i } as React.CSSProperties}>{x}</li>)}</ul>
        )}
        {asking && (
          <div className={s.chips}>
            {choices.map((c, i) => (
              <button key={c.label + i} type="button" className={s.chip} data-main={c.yes === true || (i === 0 && !choices.some((x) => x.yes))} style={{ '--k': i } as React.CSSProperties} onClick={() => choose(c)}>{c.label}</button>
            ))}
          </div>
        )}
        {!listening && !choices.length && suggest.length > 0 && (
          <div className={s.chips}>
            {suggest.slice(0, 14).map((x, i) => <button key={x} type="button" className={s.chip} style={{ '--k': i } as React.CSSProperties} onClick={() => say(x)}>«{x}»</button>)}
          </div>
        )}
        {!listening && canUndo && !choices.length && (
          <button type="button" className={s.undo} onClick={() => { handle(t('voice.undoPhrase')); }}><Icon name="reset" size={14} sw={2} />{t('voice.undo')}</button>
        )}
      </div>
      <form className={s.type} data-open={typing || !voice} onSubmit={send}>
        {typing || !voice ? (
          <>
            <input ref={input} value={text} onChange={(e) => setText(e.target.value)} placeholder={t('voice.typePh')} aria-label={t('voice.typePh')}
              enterKeyHint="send" autoComplete="off" autoCorrect="on" maxLength={200} />
            <button type="submit" className={s.send} disabled={!text.trim()} aria-label={t('voice.send')}><Icon name="arrowRight" size={16} sw={2.2} /></button>
          </>
        ) : (
          <button type="button" className={s.typeBtn} onClick={() => setTyping(true)}>{t('voice.type')}</button>
        )}
      </form>
    </div>
  );
}
