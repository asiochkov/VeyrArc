import { useLayoutEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { useT } from '../../i18n';
import { useIsDesktop } from '../../lib/useIsDesktop';
import { Icon } from '../../ui/Icon';
import s from './auth.module.css';
import { useFlow, type Screen } from './flow';

/* 'animation:wwUp .5s cubic-bezier(.2,.8,.2,1) both;animation-delay:i*40ms' */
export const up = (i: number): CSSProperties => ({ animation: 'wwUp .5s cubic-bezier(.2,.8,.2,1) both', animationDelay: i * 40 + 'ms' });

export function Logo({ light }: { light?: boolean }) {
  return (
    <>
      <span className={s.logoMark}><Icon name="logo" size={20} sw={2} /></span>
      <span className={s.wordmark} style={{ color: light ? '#F3F6FA' : 'var(--text)' }}>VeyrArc</span>
    </>
  );
}

/* Frame for every auth screen: desktop split with the gradient panel, or the mobile hero glow. */
export function AuthLayout({ screen, children }: { screen: Screen; children: (ctx: { dir: 1 | -1; isDesktop: boolean }) => ReactNode }) {
  const t = useT();
  const isDesktop = useIsDesktop();
  const enter = useFlow((x) => x.enter);
  const [dir, setDir] = useState<1 | -1>(1);
  useLayoutEffect(() => {
    enter(screen);
    setDir(useFlow.getState().dir);
  }, [screen, enter]);

  const isAuth = screen !== 'account';
  const isSplit = isDesktop && isAuth;
  const activeStep = screen === 'home' ? 1 : screen === 'signup' || screen === 'otp' ? 2 : 0;
  const showTopLogo = !isSplit && ['welcome', 'signup', 'otp', 'login'].includes(screen);
  const colStyle: CSSProperties = isDesktop
    ? isAuth ? { maxWidth: 420, padding: '56px 0 40px', justifyContent: 'center' } : { maxWidth: 720, padding: '40px 32px' }
    : { padding: `${screen === 'account' ? 20 : 28}px 22px 28px` };

  return (
    <div className={s.frame}>
      {isSplit && (
        <div className={s.left}>
          <div className={s.leftGlow} />
          <div style={{ position: 'relative', zIndex: 1, display: 'flex', alignItems: 'center', gap: 10 }}><Logo light /></div>
          <div style={{ position: 'relative', zIndex: 1, marginTop: 'auto' }}>
            <div className={s.leftTitle}>{t('auth.leftTitle')}</div>
            <div className={s.leftSub}>{t('auth.leftSub')}</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 28 }}>
              {t.list('auth.steps').map((label, i) => (
                <div key={i} className={s.step} data-on={i === activeStep}>
                  <span className={s.stepNum}>{'0' + (i + 1)}</span>
                  <span className={s.stepLabel}>{label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
      <div className={s.main} data-scroll>
        {!isSplit && (
          <div className={s.hero} style={{ height: screen === 'welcome' || screen === 'final' ? 520 : 300 }}><div className={s.heroGlow} /></div>
        )}
        <div className={s.col} style={colStyle}>
          {showTopLogo && (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 10, marginBottom: 36, position: 'relative', ...up(0) }}><Logo /></div>
          )}
          {children({ dir, isDesktop })}
        </div>
      </div>
    </div>
  );
}
