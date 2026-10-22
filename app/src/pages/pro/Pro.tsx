import { useEffect, useState, type CSSProperties } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { isAnon, isProPlan, startTrial, trialUsed, useAuth } from '../../lib/auth';
import { BillingError, checkout, settlePending } from '../../lib/billing';
import { haptic } from '../../lib/haptics';
import { track } from '../../lib/analytics';
import { hasBackend } from '../../lib/supabase';
import { config } from '../../config';
import { useT } from '../../i18n';
import { useIsDesktop } from '../../lib/useIsDesktop';
import { Icon, type IconName } from '../../ui/Icon';
import s from './pro.module.css';

/*
 * VeyrArc Pro — paywall. The 7-day trial (once, no card) or a paid plan through YooKassa: the card
 * form is on YooKassa's page, the subscription renews by itself until switched off in Settings
 * (explicit consent to auto-renewal below the button — required for recurring payments).
 */
const PERK_ICONS: IconName[] = ['perkUnlimited', 'perkHistory', 'perkCorrelation', 'perkFreeze', 'perkRecap'];

export function Pro() {
  const t = useT();
  const isDesktop = useIsDesktop();
  const [plan, setPlan] = useState<'month' | 'year'>('year');
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const { session, plan: sub } = useAuth();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [payMode, setPayMode] = useState(false);
  const [agree, setAgree] = useState(false);
  const [back, setBack] = useState<'checking' | 'ok' | 'fail' | 'slow' | null>(params.get('paid') ? 'checking' : null);
  useEffect(() => { track('paywall_view'); }, []);
  const perks = t.list('pro.perks');
  const P = config.pricing[t.lang];
  const money = (v: number) => new Intl.NumberFormat(t.lang === 'en' ? 'en-US' : 'ru-RU', { style: 'currency', currency: P.currency, maximumFractionDigits: P.currency === 'RUB' ? 0 : 2 }).format(v);
  const pct = Math.round((1 - P.yearly / (P.monthly * 12)) * 100);
  const price = plan === 'month' ? t('pro.perMonth', { p: money(P.monthly) }) : t('pro.perYear', { p: money(P.yearly) });
  const perDay = money(Math.round(((plan === 'month' ? P.monthly * 12 : P.yearly) / 365) * (P.currency === 'RUB' ? 1 : 100)) / (P.currency === 'RUB' ? 1 : 100));
  const active = hasBackend && isProPlan(sub);
  const paid = active && !!sub?.period;
  const used = hasBackend && trialUsed(sub);
  const guest = isAnon(session);
  const paying = !config.beta && (payMode || used || (active && !paid));
  const fmt = (d: string) => new Date(d).toLocaleDateString(t.lang === 'en' ? 'en-US' : 'ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });

  // back from YooKassa: settle the payment now, then say how it went
  useEffect(() => {
    if (!params.get('paid') || !session) return;
    let live = true;
    void settlePending().then((r) => {
      if (!live) return;
      setBack(r === 'succeeded' ? 'ok' : r === 'canceled' ? 'fail' : r === 'pending' ? 'slow' : null);
      if (r === 'succeeded') haptic('milestone');
      setParams({}, { replace: true });
    });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [!!session]);

  const pay = () => {
    if (!agree) { setMsg(t('pro.needConsent')); return; }
    setBusy(true); setMsg('');
    checkout(plan === 'month' ? 'monthly' : 'yearly').catch((e) => {
      setBusy(false);
      setMsg(e instanceof BillingError && e.message === 'account' ? t('pro.needAccount') : t('pro.payFailed'));
    });
  };
  const onCta = () => {
    if (!hasBackend) return;
    if (!session) { navigate('/welcome'); return; }
    if (paid) { navigate('/'); return; }
    if (paying) { if (guest) { navigate('/signup'); return; } pay(); return; }
    if (active) { navigate('/'); return; }
    setBusy(true);
    void startTrial().then(() => navigate('/')).catch(() => setMsg(t('pro.payFailed'))).finally(() => setBusy(false));
  };
  const ctaLabel = paid ? t('pro.ctaActive')
    : paying ? (guest ? t('pro.ctaAccount') : t('pro.ctaPay', { p: price }))
      : active ? t('pro.ctaActive') : t('pro.ctaTrial', { d: config.pricing.trialDays });
  const note = msg
    || (paid && sub?.renews_at ? (sub.auto_renew ? t('pro.renewsOn', { date: fmt(sub.renews_at), p: price }) : t('pro.endsOn', { date: fmt(sub.renews_at) }))
      : active && sub?.renews_at && !paying ? t('pro.trialEnds', { date: fmt(sub.renews_at) })
        : paying ? (guest ? t('pro.needAccount') : t('pro.payNote', { r: config.pricing.refundDays }))
          : config.beta ? t('pro.trialNote', { d: config.pricing.trialDays, p: price, r: config.pricing.refundDays })
            : t('pro.trialNoteCard', { d: config.pricing.trialDays }));

  if (back) {
    const ok = back === 'ok';
    return (
      <div className={isDesktop ? s.desktop : s.mobile} data-scroll>
        <div className={isDesktop ? s.cardDesktop : s.cardMobile} role="status" aria-live="polite">
          <div className={s.crown} data-state={back}>{back === 'checking' ? <span className={s.spin} /> : <Icon name={ok ? 'crown' : back === 'fail' ? 'close' : 'reset'} size={28} sw={1.8} />}</div>
          <div className={s.title}>{t(`pro.back.${back}`)}</div>
          <div className={s.subtitle}>{ok && sub?.renews_at ? t('pro.back.okSub', { date: fmt(sub.renews_at) }) : t(`pro.back.${back}Sub`)}</div>
          {back !== 'checking' && <button type="button" className={s.cta} onClick={() => (ok ? navigate('/') : setBack(null))}>{ok ? t('pro.back.go') : t('pro.back.retry')}</button>}
        </div>
      </div>
    );
  }

  const card = (
    <div className={isDesktop ? s.cardDesktop : s.cardMobile}>
      <Link to="/" className={s.close} aria-label={t('common.close')}><Icon name="close" size={18} sw={2} /></Link>
      <div className={s.crown}><Icon name="crown" size={28} sw={1.8} /></div>
      <div className={s.title}>{t('pro.title')}</div>
      <div className={s.subtitle}>{t('pro.subtitle')}</div>
      <div className={s.perks}>
        {perks.map((p, i) => (
          <div key={i} className={s.perk} style={{ '--i': i } as CSSProperties}>
            <span className={s.perkIcon}><Icon name={PERK_ICONS[i]} size={18} sw={1.8} /></span>
            <span className={s.perkText}>{p}</span>
          </div>
        ))}
      </div>
      <div className={s.plans}>
        <button type="button" className={s.plan} aria-pressed={plan === 'month'} onClick={() => setPlan('month')}>
          <span className={s.planTitle}>{t('pro.monthly')}</span>
          <span className={s.planSub}>{t('pro.perMonth', { p: money(P.monthly) })}</span>
        </button>
        <button type="button" className={s.plan} aria-pressed={plan === 'year'} onClick={() => setPlan('year')}>
          <span className={s.badge}>{t('pro.discount', { p: pct })}</span>
          <span className={s.planTitle}>{t('pro.yearly')}</span>
          <span className={s.planSub}>{t('pro.perYear', { p: money(P.yearly) })}</span>
        </button>
      </div>
      <div className={s.note} style={{ marginTop: 12 }}>{t('pro.perDay', { p: perDay })}</div>
      {paying && !guest && !paid && (
        <label className={s.consent}>
          <input type="checkbox" checked={agree} onChange={(e) => { setAgree(e.target.checked); setMsg(''); }} />
          <span>{t('pro.consent', { p: price })} <Link to="/terms" onClick={(e) => e.stopPropagation()}>{t('pro.offer')}</Link></span>
        </label>
      )}
      <button type="button" className={s.cta} onClick={onCta} disabled={busy} aria-busy={busy}>{ctaLabel}</button>
      {!paying && !active && !config.beta && <button type="button" className={s.ghost} onClick={() => setPayMode(true)}>{t('pro.payNow', { p: price })}</button>}
      {paid && <Link to="/settings" className={s.ghost}>{t('pro.manage')}</Link>}
      <div className={s.note} role={msg ? 'alert' : undefined}>{note}</div>
    </div>
  );

  return (
    <div className={isDesktop ? s.desktop : s.mobile} data-scroll>
      <div className={s.glow} />
      {card}
    </div>
  );
}
