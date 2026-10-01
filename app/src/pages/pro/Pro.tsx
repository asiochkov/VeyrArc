import { useState, type CSSProperties } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { isProPlan, startTrial, trialUsed, useAuth } from '../../lib/auth';
import { hasBackend } from '../../lib/supabase';
import { config } from '../../config';
import { useT } from '../../i18n';
import { useIsDesktop } from '../../lib/useIsDesktop';
import { Icon, type IconName } from '../../ui/Icon';
import s from './pro.module.css';

/* VeyrArc Pro.dc.html — paywall. Billing does not exist yet: "Оформить Pro" is a stub (spec §4). */
const PERK_ICONS: IconName[] = ['perkUnlimited', 'perkHistory', 'perkCorrelation', 'perkFreeze', 'perkRecap'];

export function Pro() {
  const t = useT();
  const isDesktop = useIsDesktop();
  const [plan, setPlan] = useState<'month' | 'year'>('year');
  const navigate = useNavigate();
  const { session, plan: sub } = useAuth();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const perks = t.list('pro.perks');
  // UX audit 4.5: real prices, a per-day anchor, a 7-day trial without a card
  const P = config.pricing[t.lang];
  const money = (v: number) => new Intl.NumberFormat(t.lang === 'en' ? 'en-US' : 'ru-RU', { style: 'currency', currency: P.currency, maximumFractionDigits: P.currency === 'RUB' ? 0 : 2 }).format(v);
  const pct = Math.round((1 - P.yearly / (P.monthly * 12)) * 100);
  const price = plan === 'month' ? t('pro.perMonth', { p: money(P.monthly) }) : t('pro.perYear', { p: money(P.yearly) });
  const perDay = money(Math.round(((plan === 'month' ? P.monthly * 12 : P.yearly) / 365) * (P.currency === 'RUB' ? 1 : 100)) / (P.currency === 'RUB' ? 1 : 100));
  const active = hasBackend && isProPlan(sub);
  const used = hasBackend && trialUsed(sub);
  const onCta = () => {
    if (!hasBackend) return;
    if (!session) { navigate('/welcome'); return; }
    if (active) { navigate('/'); return; }
    if (used) { setMsg(t('pro.paySoon')); return; }
    setBusy(true);
    void startTrial().then(() => navigate('/')).catch(() => setMsg(t('pro.paySoon'))).finally(() => setBusy(false));
  };
  const ctaLabel = active ? t('pro.ctaActive') : used ? t('pro.cta') : t('pro.ctaTrial', { d: config.pricing.trialDays });

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
      <button type="button" className={s.cta} onClick={onCta} disabled={busy} aria-busy={busy}>{ctaLabel}</button>
      <div className={s.note}>{msg || (active && sub?.renews_at
        ? t('pro.trialEnds', { date: new Date(sub.renews_at).toLocaleDateString(t.lang === 'en' ? 'en-US' : 'ru-RU', { day: 'numeric', month: 'long' }) })
        : t('pro.trialNote', { d: config.pricing.trialDays, p: price, r: config.pricing.refundDays }))}</div>
    </div>
  );

  return (
    <div className={isDesktop ? s.desktop : s.mobile} data-scroll>
      <div className={s.glow} />
      {card}
    </div>
  );
}
