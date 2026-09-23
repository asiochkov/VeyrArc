import { useState } from 'react';
import { createPortal } from 'react-dom';
import { useT } from '../i18n';
import { Icon } from '../ui/Icon';
import { Cta } from '../ui/primitives';
import s from './AccountDialogs.module.css';

/*
 * Sign-out and two-step delete modals from VeyrArc Auth.dc.html (Account).
 * Decision A2: every "Удалить аккаунт" entry point uses this two-step flow.
 */
export type AccountModal = 'logout' | 'del1' | 'del2' | null;

export function AccountDialogs({
  modal, setModal, onLogout, onDelete,
}: {
  modal: AccountModal;
  setModal: (m: AccountModal) => void;
  onLogout: () => void;
  onDelete: () => Promise<void> | void;
}) {
  const t = useT();
  const [word, setWord] = useState('');
  const [loading, setLoading] = useState(false);
  if (!modal) return null;
  const delWord = t('account.delWord');
  const ok = word.trim().toUpperCase() === delWord;
  const close = () => { setModal(null); setWord(''); };

  return createPortal(
    <div className={s.overlay}>
      <div className={s.modal} role="dialog" aria-modal="true">
        {modal === 'logout' && (
          <>
            <div className={s.h3}>{t('account.logoutTitle')}</div>
            <div className={s.sub} style={{ marginTop: 8 }}>{t('account.logoutBody')}</div>
            <div className={s.row} style={{ marginTop: 20 }}>
              <Cta variant="ghost" style={{ flex: 1 }} onClick={close}>{t('account.cancel')}</Cta>
              <Cta style={{ flex: 1 }} onClick={() => { close(); onLogout(); }}>{t('account.logout')}</Cta>
            </div>
          </>
        )}
        {modal === 'del1' && (
          <>
            <span className={s.dangerTile}><Icon name="alert" size={18} sw={2} /></span>
            <div className={s.h3} style={{ marginTop: 14 }}>{t('account.delTitle')}</div>
            <div className={s.sub} style={{ marginTop: 8 }}>{t('account.delBody')}</div>
            <div className={s.row} style={{ marginTop: 20 }}>
              <Cta variant="ghost" style={{ flex: 1 }} onClick={close}>{t('account.cancel')}</Cta>
              <Cta variant="dangerSolid" style={{ flex: 1 }} onClick={() => setModal('del2')}>{t('account.continue')}</Cta>
            </div>
          </>
        )}
        {modal === 'del2' && (
          <>
            <div className={s.h3}>{t('account.del2Title')}</div>
            <div className={s.sub} style={{ marginTop: 8 }}>
              {t('account.del2BodyA')}<span className={s.codeWord}>{delWord}</span>{t('account.del2BodyB')}
            </div>
            <input className={s.field} value={word} placeholder={delWord} onChange={(e) => setWord(e.target.value)} />
            <div className={s.row} style={{ marginTop: 16 }}>
              <Cta variant="ghost" style={{ flex: 1 }} onClick={close}>{t('account.cancel')}</Cta>
              <Cta variant="dangerSolid" style={{ flex: 1 }} disabled={!ok} loading={loading}
                onClick={async () => { setLoading(true); try { await onDelete(); } finally { setLoading(false); close(); } }}>
                {t('account.delForever')}
              </Cta>
            </div>
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}
