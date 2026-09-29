import { useEffect, useRef, useState, type CSSProperties, type InputHTMLAttributes, type ReactNode } from 'react';
import { config } from '../../config';
import { useT } from '../../i18n';
import { Icon } from '../../ui/Icon';
import { Cta } from '../../ui/primitives';
import s from './auth.module.css';
import { strength } from './flow';

/* Shared inputs and buttons of VeyrArc Auth.dc.html */

export function useLoad() {
  const [loading, setLoading] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  const load = (key: string, ms: number, then?: () => void) => {
    setLoading(key);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => { setLoading(null); then?.(); }, ms || 1100);
  };
  /* backend: spinner for as long as the request takes */
  const run = async (key: string, fn: () => Promise<void>) => {
    setLoading(key);
    try { await fn(); } finally { setLoading(null); }
  };
  return { loading, load, run };
}

/* shake toggles between two identical keyframes so it replays */
export function useShake() {
  const [n, setN] = useState(0);
  const [field, setField] = useState<string | null>(null);
  return { shake: (f: string) => { setN((x) => x + 1); setField(f); }, cls: (f: string | boolean) => ((f === true || field === f) && n ? (n % 2 ? s.shakeA : s.shakeB) : '') };
}

export function Field({
  label, error, showError, wrapStyle, wrapClass, right, ...input
}: InputHTMLAttributes<HTMLInputElement> & { label: ReactNode; error?: string; showError?: boolean; wrapStyle?: CSSProperties; wrapClass?: string; right?: ReactNode }) {
  return (
    <div className={wrapClass} style={wrapStyle}>
      {typeof label === 'string' ? <label className={s.label}>{label}</label> : label}
      <div style={right ? { position: 'relative' } : undefined}>
        <input className={s.field} data-err={!!showError || undefined} {...input} style={right ? { paddingRight: 52 } : undefined} />
        {right}
      </div>
      {showError && error && <div className={s.errText}>{error}</div>}
    </div>
  );
}

export function EyeButton({ shown, onToggle }: { shown: boolean; onToggle: () => void }) {
  return <button type="button" className={s.eye} onClick={onToggle}><Icon name={shown ? 'eyeOff' : 'eye'} size={18} sw={1.8} /></button>;
}

export function Strength({ pw }: { pw: string }) {
  const t = useT();
  const n = strength(pw);
  const c = ['#E5645A', '#E8A54B', '#5FBF9B'][Math.max(0, n - 1)];
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 10 }}>
      <div style={{ flex: 1, display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 5 }}>
        {[0, 1, 2].map((i) => <span key={i} className={s.seg} style={i < n ? { background: c } : undefined} />)}
      </div>
      <span className={s.strengthLabel} style={{ color: ['transparent', '#E5645A', '#E8A54B', '#5FBF9B'][n] }}>{t.list('auth.strength')[n]}</span>
    </div>
  );
}

export function SocialRow({ loading, onGoogle, onApple, style }: { loading: string | null; onGoogle: () => void; onApple: () => void; style?: CSSProperties }) {
  // Apple sign-in is behind config.auth.apple (decision B26); with it off Google spans the row.
  return (
    <div style={{ display: 'grid', gridTemplateColumns: config.auth.apple ? '1fr 1fr' : '1fr', gap: 10, marginTop: 26, ...style }}>
      <button type="button" className={s.social} onClick={onGoogle}>
        {loading === 'google' ? <span className={s.spinnerSm} /> : <Icon name="google" size={18} />}<span>Google</span>
      </button>
      {config.auth.apple && (
        <button type="button" className={s.social} onClick={onApple}>
          {loading === 'apple' ? <span className={s.spinnerSm} /> : <Icon name="apple" size={18} />}<span>Apple</span>
        </button>
      )}
    </div>
  );
}

export function OrDivider({ style }: { style?: CSSProperties }) {
  const t = useT();
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '22px 0', ...style }}>
      <span className={s.hr} /><span className={s.or}>{t('auth.or')}</span><span className={s.hr} />
    </div>
  );
}

/* primary CTA whose look follows ctaState(valid, key) in the design */
export function SubmitCta({ valid, loading, onClick, children, style }: { valid: boolean; loading: boolean; onClick: () => void; children: ReactNode; style?: CSSProperties }) {
  return <Cta disabled={!valid} loading={loading} onClick={onClick} style={style}>{children}</Cta>;
}

/* 6-cell code input: auto-advance, backspace to previous, paste fills all cells */
export function OtpInput({ value, onChange, error, shakeClass }: { value: string[]; onChange: (v: string[]) => void; error: boolean; shakeClass: string }) {
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  const setAt = (i: number, v: string) => {
    const digits = (v || '').replace(/\D/g, '');
    const otp = value.slice();
    if (digits.length > 1) {
      for (let k = 0; k < 6; k++) otp[k] = digits[k] || otp[k] || '';
      onChange(otp);
      refs.current[Math.min(5, digits.length)]?.focus();
      return;
    }
    otp[i] = digits;
    onChange(otp);
    if (digits && i < 5) refs.current[i + 1]?.focus();
  };
  return (
    <div className={`${s.otpRow} ${shakeClass}`}>
      {value.map((d, i) => (
        <input
          key={i} ref={(el) => { refs.current[i] = el; }} className={s.otpCell} value={d} inputMode="numeric" maxLength={6}
          data-filled={!!d} data-err={error || undefined} aria-label={`${i + 1}`}
          onChange={(e) => setAt(i, e.target.value)}
          onPaste={(e) => { e.preventDefault(); setAt(0, e.clipboardData.getData('text')); }}
          onKeyDown={(e) => { if (e.key === 'Backspace' && !value[i] && i > 0) refs.current[i - 1]?.focus(); }}
        />
      ))}
    </div>
  );
}

export function useResendTimer(active: boolean) {
  const [left, setLeft] = useState(45);
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => setLeft((x) => (x > 0 ? x - 1 : 0)), 1000);
    return () => clearInterval(t);
  }, [active]);
  const label = Math.floor(left / 60) + ':' + String(left % 60).padStart(2, '0');
  return { left, label, reset: () => setLeft(45) };
}
