import { useEffect, useState } from 'react';
import { useT } from '../i18n';
import c from '../pages/today/cockpit.module.css';
import { saveOath } from '../state/actions';
import { Sheet } from './Sheet';
import { toast } from './toast';

/* The arc's promise editor (Today Now Card, Settings → Arc). */
export function OathSheet({ open, onClose, arcId, current }: { open: boolean; onClose: () => void; arcId: string | null; current: string }) {
  const t = useT();
  const [text, setText] = useState(current);
  useEffect(() => { if (open) setText(current); }, [open, current]);
  if (!open) return null;
  const save = () => {
    if (arcId) saveOath(arcId, text);
    toast.success(t('cockpit.oathSaved'));
    onClose();
  };
  return (
    <Sheet open={open} onClose={onClose} title={t('arc.oathTitle')}>
      <div className={c.sheetHint}>{t('cockpit.oathHint')}</div>
      <textarea className={c.textarea} value={text} maxLength={280} autoFocus placeholder={t('cockpit.oathPlaceholder')} onChange={(e) => setText(e.target.value)} />
      <button type="button" className={c.primary} style={{ width: '100%' }} disabled={!text.trim()} onClick={save}>{t('account.save')}</button>
    </Sheet>
  );
}
