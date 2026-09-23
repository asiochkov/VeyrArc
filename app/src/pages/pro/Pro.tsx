import { useState } from 'react';
import { Link } from 'react-router-dom';
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
  const pct = config.pricing.yearlyDiscountPct;
  const perks = t.list('pro.perks');

  const card = (
    <div className={isDesktop ? s.cardDesktop : s.cardMobile}>
      <Link to="/" className={s.close} aria-label={t('common.close')}><Icon name="close" size={18} sw={2} /></Link>
      <div className={s.crown}><Icon name="crown" size={28} sw={1.8} /></div>
      <div className={s.title}>{t('pro.title')}</div>
      <div className={s.subtitle}>{t('pro.subtitle')}</div>
      <div className={s.perks}>
        {perks.map((p, i) => (
          <div key={i} className={s.perk}>
            <span className={s.perkIcon}><Icon name={PERK_ICONS[i]} size={18} sw={1.8} /></span>
            <span className={s.perkText}>{p}</span>
          </div>
        ))}
      </div>
      <div className={s.plans}>
        <button type="button" className={s.plan} aria-pressed={plan === 'month'} onClick={() => setPlan('month')}>
          <span className={s.planTitle}>{t('pro.monthly')}</span>
          <span className={s.planSub}>{t('pro.monthlySub')}</span>
        </button>
        <button type="button" className={s.plan} aria-pressed={plan === 'year'} onClick={() => setPlan('year')}>
          <span className={s.badge}>{t('pro.discount', { p: pct })}</span>
          <span className={s.planTitle}>{t('pro.yearly')}</span>
          <span className={s.planSub}>{t('pro.yearlySub', { p: pct })}</span>
        </button>
      </div>
      <button type="button" className={s.cta}>{t('pro.cta')}</button>
      <div className={s.note}>{t('pro.cancelNote')}</div>
    </div>
  );

  return (
    <div className={isDesktop ? s.desktop : s.mobile} data-scroll>
      <div className={s.glow} />
      {card}
    </div>
  );
}
