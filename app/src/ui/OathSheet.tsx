import { useEffect, useState } from 'react';
import { useT } from '../i18n';
import { haptic } from '../lib/haptics';
import c from '../pages/today/cockpit.module.css';
import { saveOath } from '../state/actions';
import { Sheet } from './Sheet';
import s from './oath.module.css';

/*
 * The arc's promise as a small ritual (audit 1.12.2): written large, a few honest starting points,
 * and on save the promise is «sealed» with the date — a commitment, not a form field.
 */
export function OathSheet({ open, onClose, arcId, current }: { open: boolean; onClose: () => void; arcId: string | null; current: string }) {
  const t = useT();
  const [text, setText] = useState(current);
  const [sealed, setSealed] = useState(false);
  useEffect(() => { if (open) { setText(current); setSealed(false); } }, [open, current]);
  if (!open) return null;
  const save = () => {
    if (arcId) saveOath(arcId, text);
    haptic('milestone');
    setSealed(true);
    setTimeout(onClose, 1900);
  };
  const date = new Date().toLocaleDateString(t.lang === 'ru' ? 'ru-RU' : 'en-US', { day: 'numeric', month: 'long', year: 'numeric' });
  return (
    <Sheet open={open} onClose={onClose} title={sealed ? undefined : t('arc.oathTitle')} label={t('arc.oathTitle')}>
      {sealed ? (
        <div className={s.sealed} role="status">
          <span className={s.seal} aria-hidden="true" />
          <p className={s.quote}>«{text.trim()}»</p>
          <p className={s.signed}>{t('oath.sealed', { d: date })}</p>
        </div>
      ) : (
        <>
          <div className={c.sheetHint}>{t('oath.why')}</div>
          <textarea className={s.input} value={text} maxLength={200} autoFocus placeholder={t('cockpit.oathPlaceholder')} onChange={(e) => setText(e.target.value)} />
          <div className={s.ideas}>
            {t.list('oath.ideas').map((x) => <button key={x} type="button" className={s.idea} onClick={() => setText(x)}>{x}</button>)}
          </div>
          <button type="button" className={c.primary} style={{ width: '100%', marginTop: 16 }} disabled={!text.trim()} onClick={save}>{t('oath.seal')}</button>
        </>
      )}
    </Sheet>
  );
}
