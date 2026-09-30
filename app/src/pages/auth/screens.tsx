import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useT } from '../../i18n';
import { google, nextPath, resendEmail, sendReset, setNewPassword, signIn, signUpOrLink, startGuest, verifyEmail, verifyReset } from '../../lib/auth';
import { hasBackend } from '../../lib/supabase';
import { Icon } from '../../ui/Icon';
import { Cta } from '../../ui/primitives';
import s from './auth.module.css';
import { AuthLayout, up } from './AuthLayout';
import { emailRe, useFlow } from './flow';
import { EyeButton, Field, OrDivider, OtpInput, SocialRow, Strength, SubmitCta, useLoad, useResendTimer, useShake } from './parts';

/* ---------------- Welcome ---------------- */

export function Welcome() {
  const t = useT();
  const navigate = useNavigate();
  const { loading, run } = useLoad();
  const start = () => {
    if (!hasBackend) { navigate('/onboarding'); return; }
    // B23: the guest is a real (anonymous) user from the first screen on
    void run('start', async () => {
      try { await startGuest(); navigate('/onboarding'); } catch { navigate('/signup'); }
    });
  };
  return (
    <AuthLayout screen="welcome">
      {({ dir, isDesktop }) => (
        <div className={dir > 0 ? s.screenL : s.screenR} style={{ display: 'flex', flexDirection: 'column', minHeight: isDesktop ? 560 : 640 }}>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', textAlign: 'center', padding: '20px 0' }}>
            <div className={s.badge} style={up(1)}>{t('auth.badge')}</div>
            <div className={s.h1big} style={up(2)}>{t('auth.welcomeTitle')}</div>
            <div className={s.sub} style={{ maxWidth: 320, marginTop: 12, ...up(3) }}>{t('auth.welcomeSub')}</div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, ...up(4) }}>
            <Cta loading={loading === 'start'} onClick={start}>{t('auth.startArc')}</Cta>
            <Cta variant="ghost" onClick={() => navigate('/login')}>{t('auth.haveAccount')}</Cta>
          </div>
        </div>
      )}
    </AuthLayout>
  );
}

/* ---------------- Sign up ---------------- */

export function Signup() {
  const t = useT();
  const navigate = useNavigate();
  const { f, setF, setPending } = useFlow();
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [showPw, setShowPw] = useState(false);
  const [agree, setAgree] = useState(false);
  const [serverErr, setServerErr] = useState('');
  const { loading, load, run } = useLoad();
  const errs = {
    first: !f.first.trim() ? t('auth.errFirst') : '',
    last: !f.last.trim() ? t('auth.errLast') : '',
    email: !f.email ? t('auth.errEmail') : !emailRe.test(f.email) ? t('auth.errEmailBad') : '',
    pw: f.pw.length < 8 ? t('auth.errPw') : '',
  };
  const valid = !errs.first && !errs.last && !errs.email && !errs.pw && agree;
  const touch = (k: string) => setTouched((x) => ({ ...x, [k]: true }));
  const submit = () => {
    if (!valid) { setTouched({ first: true, last: true, email: true, pw: true }); return; }
    if (!f.pname) setF('pname', f.first);
    if (!hasBackend) { load('signup', 1200, () => navigate('/verify')); return; }
    void run('signup', async () => {
      try {
        const kind = await signUpOrLink({ first: f.first, last: f.last, email: f.email, pw: f.pw });
        if (kind === 'done') { navigate(nextPath()); return; }
        setPending({ kind, email: f.email, pw: f.pw });
        navigate('/verify');
      } catch (e) {
        setServerErr(/already|exists|registered/i.test(String((e as Error).message)) ? t('auth.errEmailTaken') : t('auth.errGeneric'));
      }
    });
  };
  const oauth = (k: string) => {
    if (!hasBackend) { load(k, 1300, () => navigate('/')); return; }
    void run(k, async () => { try { await google(); } catch { setServerErr(t('auth.errGeneric')); } });
  };

  return (
    <AuthLayout screen="signup">
      {({ dir }) => (
        <div className={dir > 0 ? s.screenL : s.screenR}>
          <div className={s.h1} style={up(1)}>{t('auth.signupTitle')}</div>
          <div className={s.sub} style={{ marginTop: 8, ...up(2) }}>{t('auth.signupSub')}</div>
          <SocialRow loading={loading} onGoogle={() => oauth('google')} onApple={() => oauth('apple')} style={up(3)} />
          <OrDivider style={up(4)} />
          {serverErr && <div className={s.alert}><Icon name="alert" size={18} sw={2} /><span>{serverErr}</span></div>}
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)', gap: 12, ...up(5) }}>
            <Field label={t('auth.firstName')} value={f.first} placeholder={t('auth.phFirst')} onChange={(e) => setF('first', e.target.value)} onBlur={() => touch('first')} showError={touched.first && !!errs.first} error={errs.first} />
            <Field label={t('auth.lastName')} value={f.last} placeholder={t('auth.phLast')} onChange={(e) => setF('last', e.target.value)} onBlur={() => touch('last')} showError={touched.last && !!errs.last} error={errs.last} />
          </div>
          <Field wrapStyle={{ marginTop: 14, ...up(6) }} type="email" label={t('auth.email')} value={f.email} placeholder={t('auth.phEmail')}
            onChange={(e) => { setF('email', e.target.value); setServerErr(''); }} onBlur={() => touch('email')} showError={touched.email && !!errs.email} error={errs.email} />
          <div style={{ marginTop: 14, ...up(7) }}>
            <Field label={t('auth.password')} type={showPw ? 'text' : 'password'} value={f.pw} placeholder={t('auth.phPassword')}
              onChange={(e) => setF('pw', e.target.value)} onBlur={() => touch('pw')} showError={touched.pw && !!errs.pw}
              right={<EyeButton shown={showPw} onToggle={() => setShowPw(!showPw)} />} />
            <Strength pw={f.pw} />
            {touched.pw && errs.pw && <div className={s.errText}>{errs.pw}</div>}
          </div>
          <button type="button" className={s.agreeRow} style={up(8)} onClick={(e) => { if ((e.target as HTMLElement).tagName === 'A') return; setAgree(!agree); }}>
            <span className={s.agreeBox} data-on={agree}>{agree && <Icon name="check" size={13} sw={3.2} />}</span>
            <span className={s.small} style={{ textAlign: 'left' }}>
              {t('auth.agreeA')}<a href="/terms" target="_blank" rel="noopener" className={s.linkInline}>{t('auth.terms')}</a>{t('auth.agreeAnd')}<a href="/privacy" target="_blank" rel="noopener" className={s.linkInline}>{t('auth.privacy')}</a>
            </span>
          </button>
          <SubmitCta valid={valid} loading={loading === 'signup'} onClick={submit} style={{ marginTop: 18, ...up(9) }}>{t('auth.continue')}</SubmitCta>
          <div className={s.footer}>{t('auth.haveAccountQ')} <button type="button" className={s.linkBtn} onClick={() => navigate('/login')}>{t('auth.signIn')}</button></div>
        </div>
      )}
    </AuthLayout>
  );
}

/* ---------------- OTP ---------------- */

export function Verify() {
  const t = useT();
  const navigate = useNavigate();
  const pending = useFlow((x) => x.pending);
  const email = pending?.email || useFlow.getState().f.email || (hasBackend ? '' : 'anna.petrova@gmail.com');
  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const [err, setErr] = useState(false);
  const [ok, setOk] = useState(false);
  const { loading, load, run } = useLoad();
  const { shake, cls } = useShake();
  const timer = useResendTimer(!ok);
  const full = otp.every(Boolean);
  const resend = () => {
    timer.reset(); setOtp(['', '', '', '', '', '']); setErr(false);
    if (hasBackend && pending) void resendEmail(pending.kind, pending.email).catch(() => {});
  };
  const submit = () => {
    if (!full) return;
    if (hasBackend) {
      void run('otp', async () => {
        try {
          await verifyEmail(pending?.kind ?? 'signup', email, otp.join(''), pending?.pw ?? '');
          setOk(true);
          setTimeout(() => navigate(nextPath()), 1100);
        } catch { setErr(true); shake('otp'); }
      });
      return;
    }
    load('otp', 1000, () => {
      if (otp.join('') === '000000') { setErr(true); shake('otp'); return; }
      setOk(true);
      setTimeout(() => navigate('/'), 1100);
    });
  };

  return (
    <AuthLayout screen="otp">
      {({ dir }) => (
        <div className={dir > 0 ? s.screenL : s.screenR}>
          {ok ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', padding: '40px 0' }}>
              <span className={s.successBadge}><Icon name="checkLg" size={38} sw={2.6} /></span>
              <div className={s.h1} style={{ marginTop: 22 }}>{t('auth.emailConfirmed')}</div>
              <div className={s.sub} style={{ marginTop: 8 }}>{t('auth.progressSaved')}</div>
            </div>
          ) : (
            <>
              <div className={s.iconTile} style={up(1)}><Icon name="mail" size={22} sw={1.8} /></div>
              <div className={s.h1} style={{ marginTop: 18, ...up(2) }}>{t('auth.checkMail')}</div>
              <div className={s.sub} style={{ marginTop: 8, ...up(3) }}>{t('auth.sentCodeTo')}<span className={s.strong}>{email}</span></div>
              <div style={up(4)}><OtpInput value={otp} onChange={(v) => { setOtp(v); setErr(false); }} error={err} shakeClass={cls('otp')} /></div>
              {err && <div className={s.errText} style={{ textAlign: 'center', marginTop: 10 }}>{t('auth.wrongCode')}</div>}
              <SubmitCta valid={full} loading={loading === 'otp'} onClick={submit} style={{ marginTop: 22, ...up(5) }}>{t('auth.confirm')}</SubmitCta>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 18, ...up(6) }}>
                {timer.left === 0 ? (
                  <button type="button" className={s.linkBtn} onClick={resend}>{t('auth.resend')}</button>
                ) : (
                  <span className={s.small}>{t('auth.resendIn')}<span style={{ fontFamily: 'var(--font-mono)' }}>{timer.label}</span></span>
                )}
                <button type="button" className={s.linkBtn} onClick={() => navigate('/signup')}>{t('auth.changeEmail')}</button>
              </div>
            </>
          )}
        </div>
      )}
    </AuthLayout>
  );
}

/* ---------------- Sign in ---------------- */

export function Login() {
  const t = useT();
  const navigate = useNavigate();
  const { f, setF } = useFlow();
  const [showPw, setShowPw] = useState(false);
  const [err, setErr] = useState(false);
  const { loading, load, run } = useLoad();
  const { shake, cls } = useShake();
  const submit = () => {
    if (!hasBackend) {
      load('login', 1100, () => { if (!emailRe.test(f.lemail) || f.lpw.length < 8) { setErr(true); shake('login'); } else navigate('/'); });
      return;
    }
    void run('login', async () => {
      try { await signIn(f.lemail.trim(), f.lpw); navigate(nextPath()); } catch { setErr(true); shake('login'); }
    });
  };
  const oauth = (k: string) => {
    if (!hasBackend) { load(k, 1300, () => navigate('/')); return; }
    void run(k, async () => { try { await google(); } catch { setErr(true); } });
  };

  return (
    <AuthLayout screen="login">
      {({ dir }) => (
        <div className={dir > 0 ? s.screenL : s.screenR}>
          <div className={s.h1} style={up(1)}>{t('auth.welcomeBack')}</div>
          <div className={s.sub} style={{ marginTop: 8, ...up(2) }}>{t('auth.signInSub')}</div>
          <SocialRow loading={loading} onGoogle={() => oauth('google')} onApple={() => oauth('apple')} style={up(3)} />
          <OrDivider style={up(4)} />
          {err && <div className={s.alert}><Icon name="alert" size={18} sw={2} /><span>{t('auth.loginError')}</span></div>}
          <Field wrapClass={cls('login')} wrapStyle={up(5)} type="email" label={t('auth.email')} value={f.lemail} placeholder={t('auth.phEmail')} showError={err}
            onChange={(e) => { setF('lemail', e.target.value); setErr(false); }} />
          <Field
            wrapClass={cls('login')} wrapStyle={{ marginTop: 14, ...up(6) }} type={showPw ? 'text' : 'password'} value={f.lpw} placeholder="••••••••" showError={err}
            label={<div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}><label className={s.label}>{t('auth.password')}</label><button type="button" className={s.linkBtn} style={{ fontSize: 12.5 }} onClick={() => { setF('remail', f.lemail); navigate('/reset'); }}>{t('auth.forgot')}</button></div>}
            onChange={(e) => { setF('lpw', e.target.value); setErr(false); }}
            right={<EyeButton shown={showPw} onToggle={() => setShowPw(!showPw)} />} />
          <SubmitCta valid={!!(f.lemail && f.lpw)} loading={loading === 'login'} onClick={submit} style={{ marginTop: 22, ...up(7) }}>{t('auth.signIn')}</SubmitCta>
          <div className={s.footer}>{t('auth.noAccount')} <button type="button" className={s.linkBtn} onClick={() => navigate('/signup')}>{t('auth.create')}</button></div>
        </div>
      )}
    </AuthLayout>
  );
}

/* ---------------- Reset password ---------------- */

type RStep = 'email' | 'check' | 'code' | 'newpw' | 'done';
const RORDER: RStep[] = ['email', 'check', 'code', 'newpw', 'done'];

export function Reset() {
  const t = useT();
  const navigate = useNavigate();
  const { f, setF } = useFlow();
  const [step, setStep] = useState<RStep>('email');
  const [sdir, setSdir] = useState<1 | -1>(1);
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [showPw, setShowPw] = useState(false);
  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const [err, setErr] = useState(false);
  const { loading, load, run } = useLoad();
  const { shake, cls } = useShake();
  const timer = useResendTimer(step === 'code');
  // backend: the same steps, backed by Supabase password recovery (6-digit code)
  const sendCode = () => {
    if (!hasBackend) { load('reset', 1000, () => go('check')); return; }
    void run('reset', async () => { await sendReset(f.remail.trim()).catch(() => {}); go('check'); });
  };
  const checkCode = () => {
    if (!full) return;
    if (!hasBackend) { load('otp', 1000, () => { if (otp.join('') === '000000') { setErr(true); shake('otp'); } else go('newpw'); }); return; }
    void run('otp', async () => { try { await verifyReset(f.remail.trim(), otp.join('')); go('newpw'); } catch { setErr(true); shake('otp'); } });
  };
  const savePw = () => {
    if (!hasBackend) { load('newpw', 1100, () => go('done')); return; }
    void run('newpw', async () => { try { await setNewPassword(f.npw); go('done'); } catch { setTouched((x) => ({ ...x, npw: true })); } });
  };
  const resendReset = () => {
    timer.reset(); setOtp(['', '', '', '', '', '']); setErr(false);
    if (hasBackend) void sendReset(f.remail.trim()).catch(() => {});
  };
  const go = (next: RStep, d: 1 | -1 = 1) => { setSdir(d); setStep(next); };
  const email = f.remail || 'anna.petrova@gmail.com';
  const errs = {
    remail: !emailRe.test(f.remail) ? t('auth.errEmailBad') : '',
    npw: f.npw.length < 8 ? t('auth.errPw') : '',
    npw2: f.npw2 !== f.npw ? t('auth.errPwMatch') : '',
  };
  const slide = sdir > 0 ? s.slideL : s.slideR;
  const back = () => { const i = RORDER.indexOf(step); if (i <= 0 || step === 'done') navigate('/login'); else go(RORDER[i - 1], -1); };
  const full = otp.every(Boolean);

  return (
    <AuthLayout screen="reset">
      {({ dir }) => (
        <div className={dir > 0 ? s.screenL : s.screenR}>
          <button type="button" className={s.backBtn} style={up(0)} onClick={back}><Icon name="back" size={18} sw={2} /></button>

          {step === 'email' && (
            <div key="email" className={slide}>
              <div className={s.h1} style={{ marginTop: 18 }}>{t('auth.resetTitle')}</div>
              <div className={s.sub} style={{ marginTop: 8 }}>{t('auth.resetSub')}</div>
              <Field wrapStyle={{ marginTop: 26 }} type="email" label={t('auth.email')} value={f.remail} placeholder={t('auth.phEmail')}
                onChange={(e) => setF('remail', e.target.value)} onBlur={() => setTouched((x) => ({ ...x, remail: true }))} showError={touched.remail && !!errs.remail} error={errs.remail} />
              <SubmitCta valid={!errs.remail} loading={loading === 'reset'} onClick={sendCode} style={{ marginTop: 22 }}>{t('auth.sendCode')}</SubmitCta>
            </div>
          )}

          {step === 'check' && (
            <div key="check" className={slide} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', paddingTop: 24 }}>
              <div className={s.iconTileLg}><Icon name="mail" size={36} sw={1.6} /></div>
              <div className={s.h1} style={{ marginTop: 22 }}>{t('auth.checkMail')}</div>
              <div className={s.sub} style={{ marginTop: 8, maxWidth: 300 }}>{t('auth.resetSentTo')}<span className={s.strong}>{email}</span></div>
              <Cta style={{ marginTop: 28 }} onClick={() => { setOtp(['', '', '', '', '', '']); timer.reset(); go('code'); }}>{t('auth.enterCode')}</Cta>
              <button type="button" className={s.linkBtn} style={{ marginTop: 16 }} onClick={() => go('email', -1)}>{t('auth.otherEmail')}</button>
            </div>
          )}

          {step === 'code' && (
            <div key="code" className={slide}>
              <div className={s.h1} style={{ marginTop: 18 }}>{t('auth.enterCodeTitle')}</div>
              <div className={s.sub} style={{ marginTop: 8 }}>{t('auth.sixDigits')}<span className={s.strong}>{email}</span></div>
              <OtpInput value={otp} onChange={(v) => { setOtp(v); setErr(false); }} error={err} shakeClass={cls('otp')} />
              {err && <div className={s.errText} style={{ textAlign: 'center', marginTop: 10 }}>{t('auth.wrongCode')}</div>}
              <SubmitCta valid={full} loading={loading === 'otp'} style={{ marginTop: 22 }}
                onClick={checkCode}>{t('auth.continue')}</SubmitCta>
              <div style={{ marginTop: 18, textAlign: 'center' }}>
                {timer.left === 0 ? (
                  <button type="button" className={s.linkBtn} onClick={resendReset}>{t('auth.resend')}</button>
                ) : (
                  <span className={s.small}>{t('auth.resendIn')}<span style={{ fontFamily: 'var(--font-mono)' }}>{timer.label}</span></span>
                )}
              </div>
            </div>
          )}

          {step === 'newpw' && (
            <div key="newpw" className={slide}>
              <div className={s.h1} style={{ marginTop: 18 }}>{t('auth.newPassword')}</div>
              <div className={s.sub} style={{ marginTop: 8 }}>{t('auth.newPasswordSub')}</div>
              <div style={{ marginTop: 26 }}>
                <Field label={t('auth.newPassword')} type={showPw ? 'text' : 'password'} value={f.npw} placeholder={t('auth.phPassword')}
                  onChange={(e) => setF('npw', e.target.value)} onBlur={() => setTouched((x) => ({ ...x, npw: true }))} showError={touched.npw && !!errs.npw}
                  right={<EyeButton shown={showPw} onToggle={() => setShowPw(!showPw)} />} />
                <Strength pw={f.npw} />
                {touched.npw && errs.npw && <div className={s.errText}>{errs.npw}</div>}
              </div>
              <Field wrapStyle={{ marginTop: 14 }} label={t('auth.repeatPassword')} type={showPw ? 'text' : 'password'} value={f.npw2} placeholder={t('auth.phRepeat')}
                onChange={(e) => setF('npw2', e.target.value)} onBlur={() => setTouched((x) => ({ ...x, npw2: true }))} showError={touched.npw2 && !!errs.npw2} error={errs.npw2} />
              <SubmitCta valid={!errs.npw && !errs.npw2 && !!f.npw2} loading={loading === 'newpw'} onClick={savePw} style={{ marginTop: 22 }}>{t('auth.savePassword')}</SubmitCta>
            </div>
          )}

          {step === 'done' && (
            <div key="done" className={slide} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', paddingTop: 30 }}>
              <span className={s.successBadge}><Icon name="checkLg" size={38} sw={2.6} /></span>
              <div className={s.h1} style={{ marginTop: 22 }}>{t('auth.passwordUpdated')}</div>
              <div className={s.sub} style={{ marginTop: 8 }}>{t('auth.signInWithNew')}</div>
              <Cta style={{ marginTop: 28 }} onClick={() => navigate('/login')}>{t('auth.signIn')}</Cta>
            </div>
          )}
        </div>
      )}
    </AuthLayout>
  );
}
