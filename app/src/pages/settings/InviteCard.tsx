import { useT } from '../../i18n';
import { haptic } from '../../lib/haptics';
import { referralLink, useMyReferral } from '../../lib/referral';
import { Icon } from '../../ui/Icon';
import { toast } from '../../ui/toast';
import s from './settings.module.css';

/* «Invite a friend»: the link, share / copy, and what has come of it. */
export function InviteCard() {
  const t = useT();
  const q = useMyReferral();
  if (!q.data) return null;
  const { code, invited, rewarded, bonus } = q.data;
  const link = referralLink(code);
  const share = async () => {
    haptic('tap');
    const text = t('invite.shareText');
    try {
      if (navigator.share) { await navigator.share({ title: 'VeyrArc', text, url: link }); return; }
    } catch (e) { if ((e as Error).name === 'AbortError') return; }
    try { await navigator.clipboard.writeText(`${text} ${link}`); toast.success(t('invite.copied')); } catch { toast.error(t('common.saveFailed')); }
  };
  return (
    <div className={s.invite}>
      <div className={s.inviteHead}>
        <span className={s.inviteIcon}><Icon name="person" size={18} sw={1.8} /></span>
        <span style={{ flex: 1, minWidth: 0 }}>
          <span className={s.inviteTitle}>{t('invite.title')}</span>
          <span className={s.inviteSub}>{t('invite.sub')}</span>
        </span>
      </div>
      <button type="button" className={s.inviteLink} onClick={() => { void navigator.clipboard?.writeText(link).then(() => toast.success(t('invite.copied'))).catch(() => {}); }} aria-label={t('invite.copyLink')}>
        <span>{link.replace(/^https?:\/\//, '')}</span><Icon name="doc" size={16} sw={1.8} />
      </button>
      <button type="button" className={s.inviteBtn} onClick={() => { void share(); }}>{t('invite.share')}</button>
      <div className={s.inviteStats}>{t('invite.stats', { n: invited, m: rewarded })}{bonus > 0 && <> · <b>{t('invite.bonus', { n: bonus })}</b></>}</div>
    </div>
  );
}
