import { useEffect, useState } from 'react';
import { useAuth } from '../lib/auth';
import { db } from '../lib/supabase';
import { setProfile } from '../data/settings';
import { toast } from '../ui/toast';
import { createPortal } from 'react-dom';
import { useT } from '../i18n';
import { Icon } from '../ui/Icon';
import { Cta } from '../ui/primitives';
import s from './AccountDialogs.module.css';

/*
 * Sign-out and two-step delete modals from VeyrArc Auth.dc.html (Account).
 * Decision A2: every "Удалить аккаунт" entry point uses this two-step flow.
 */
export type AccountModal = 'logout' | 'del1' | 'del2' | 'name' | 'password' | null;

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
  const [err, setErr] = useState('');
  const prof = useAuth((x) => x.profile);
  const [first, setFirst] = useState('');
  const [last, setLast] = useState('');
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  useEffect(() => {
    if (modal === 'name') { setFirst(prof?.first_name ?? ''); setLast(prof?.last_name ?? ''); }
    setPw(''); setPw2(''); setErr('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modal]);
  if (!modal) return null;
  const saveName = () => {
    if (!first.trim()) { setErr(t('account.nameRequired')); return; }
    setProfile({ first_name: first.trim(), last_name: last.trim() || null });
    toast.success(t('account.saved'));
    close();
  };
  const savePassword = async () => {
    if (pw.length < 8) { setErr(t('account.pwShort')); return; }
    if (pw !== pw2) { setErr(t('account.pwMismatch')); return; }
    setLoading(true); setErr('');
    const r = await db().auth.updateUser({ password: pw });
    setLoading(false);
    if (r.error) { setErr(t('account.pwFailed')); return; }
    toast.success(t('account.pwChanged'));
    close();
  };
  const delWord = t('account.delWord');
  const ok = word.trim().toUpperCase() === delWord;
  const close = () => { setModal(null); setWord(''); setErr(''); };

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
        {modal === 'name' && (
          <form onSubmit={(e) => { e.preventDefault(); saveName(); }}>
            <div className={s.h3}>{t('account.nameTitle')}</div>
            <label className={s.label}>{t('auth.firstName')}<input className={s.input} value={first} autoFocus autoComplete="given-name" maxLength={40} onChange={(e) => setFirst(e.target.value)} /></label>
            <label className={s.label}>{t('auth.lastName')}<input className={s.input} value={last} autoComplete="family-name" maxLength={40} onChange={(e) => setLast(e.target.value)} /></label>
            {err && <div className={s.err} role="alert">{err}</div>}
            <div className={s.row} style={{ marginTop: 18 }}>
              <Cta variant="ghost" style={{ flex: 1 }} onClick={close}>{t('account.cancel')}</Cta>
              <Cta type="submit" style={{ flex: 1 }}>{t('account.save')}</Cta>
            </div>
          </form>
        )}
        {modal === 'password' && (
          <form onSubmit={(e) => { e.preventDefault(); void savePassword(); }}>
            <div className={s.h3}>{t('auth.changePassword')}</div>
            <label className={s.label}>{t('account.pwNew')}<input className={s.input} type="password" value={pw} autoFocus autoComplete="new-password" onChange={(e) => setPw(e.target.value)} /></label>
            <label className={s.label}>{t('account.pwRepeat')}<input className={s.input} type="password" value={pw2} autoComplete="new-password" onChange={(e) => setPw2(e.target.value)} /></label>
            {err && <div className={s.err} role="alert">{err}</div>}
            <div className={s.row} style={{ marginTop: 18 }}>
              <Cta variant="ghost" style={{ flex: 1 }} onClick={close}>{t('account.cancel')}</Cta>
              <Cta type="submit" style={{ flex: 1 }} loading={loading} disabled={loading}>{t('account.save')}</Cta>
            </div>
          </form>
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
