import type { ButtonHTMLAttributes, CSSProperties, ReactNode } from 'react';
import { Icon } from './Icon';
import s from './ui.module.css';

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ');

export function Card({ children, style, className }: { children: ReactNode; style?: CSSProperties; className?: string }) {
  return <div className={cx(s.card, className)} style={style}>{children}</div>;
}

export function SectionLabel({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return <div className={s.label} style={style}>{children}</div>;
}

/* Sizes used in the design: 36/38/40/52/64 with font 11/12/12/16/22 */
export function Avatar({ initials, size = 38, fontSize = 12, onClick }: { initials: string; size?: number; fontSize?: number; onClick?: () => void }) {
  const style = { width: size, height: size, fontSize };
  return onClick ? (
    <button type="button" className={s.avatar} style={{ ...style, cursor: 'pointer' }} onClick={onClick}>{initials}</button>
  ) : (
    <div className={s.avatar} style={style}>{initials}</div>
  );
}

export function CircleButton({ children, style, ...rest }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button type="button" className={s.circleBtn} style={style} {...rest}>{children}</button>;
}
export const circleButtonClass = s.circleBtn;

export type SegVariant = 'pomodoro' | 'tracker' | 'calendar' | 'goals' | 'period' | 'range' | 'rangeSm' | 'units';

export function Segmented<T extends string>({
  options, value, onChange, variant, amber = false, style,
}: {
  options: { id: T; label: ReactNode }[];
  value: T;
  onChange: (v: T) => void;
  variant: SegVariant;
  amber?: boolean;
  style?: CSSProperties;
}) {
  return (
    <div className={cx(s.seg, s[`seg-${variant}`], amber && s.segAmber)} style={style}>
      {options.map((o) => (
        <button key={o.id} type="button" className={s.segItem} aria-pressed={o.id === value} onClick={() => onChange(o.id)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

/*
 * Progress ring: viewBox 120, rotated -90deg (Today analytics r48/sw9-10,
 * Profile r50/sw9). Dash length is 2πr as in the design (301.6 / 314.2).
 */
export function ProgressRing({
  size, r, strokeWidth, pct, color = 'var(--accent)', track = 'rgba(168,203,239,.1)', children,
}: {
  size: number; r: number; strokeWidth: number; pct: number; color?: string; track?: string; children?: ReactNode;
}) {
  const len = 2 * Math.PI * r;
  return (
    <div style={{ position: 'relative', width: size, height: size }}>
      <svg width={size} height={size} viewBox="0 0 120 120" style={{ transform: 'rotate(-90deg)' }}>
        <circle cx="60" cy="60" r={r} fill="none" stroke={track} strokeWidth={strokeWidth} />
        <circle
          cx="60" cy="60" r={r} fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round"
          strokeDasharray={len.toFixed(1)} strokeDashoffset={(len * (1 - Math.min(1, Math.max(0, pct)))).toFixed(1)}
        />
      </svg>
      {children}
    </div>
  );
}

export function Toggle({ on, onChange, size = 'md', label }: { on: boolean; onChange: (v: boolean) => void; size?: 'md' | 'sm'; label?: string }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} className={cx(s.toggle, s[`toggle-${size}`])} onClick={() => onChange(!on)}>
      <span className={s.toggleKnob} />
    </button>
  );
}

export function Checkbox({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label?: string }) {
  return (
    <button type="button" role="checkbox" aria-checked={on} aria-label={label} className={s.checkHit} onClick={() => onChange(!on)}>
      <span className={s.checkBox} data-on={on}>{on && <Icon name="check" size={13} sw={3.2} />}</span>
    </button>
  );
}

export function StepButton({ children, ...rest }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button type="button" className={s.stepBtn} {...rest}>{children}</button>;
}

/* Five-level face from Today/Training moodFace() */
/* five clearly different states (UX audit 4.6): deep frown → slight frown → flat → smile → big smile */
const MOUTHS = ['M8.2 17 q3.8 -3.6 7.6 0', 'M9 16.2 q3 -1.6 6 0', 'M9 15.5 h6', 'M9 14.8 q3 2.4 6 0', 'M8 14 q4 4.6 8 0 z'];
export function MoodFace({ level, color, size = 20 }: { level: number; color: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      <circle cx="9" cy="10" r="1" fill={color} stroke="none" />
      <circle cx="15" cy="10" r="1" fill={color} stroke="none" />
      <path d={MOUTHS[level]} />
    </svg>
  );
}

export function GoldButton({ children, style, ...rest }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button type="button" className={s.gold} style={style} {...rest}>{children}</button>;
}
export const goldClass = s.gold;

export type CtaVariant = 'primary' | 'ghost' | 'danger' | 'dangerSolid';

export function Cta({
  variant = 'primary', loading = false, children, disabled, style, ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: CtaVariant; loading?: boolean }) {
  const spinner = variant === 'dangerSolid' ? s.spinnerLight : s.spinner;
  return (
    <button
      type="button" className={cx(s.cta, s[`cta-${variant}`])} data-loading={loading}
      disabled={disabled && !loading} aria-busy={loading} style={style} {...rest}
    >
      {loading ? <span className={spinner} /> : <span>{children}</span>}
    </button>
  );
}

export function Spinner({ kind = 'md' }: { kind?: 'md' | 'sm' | 'light' }) {
  return <span className={kind === 'sm' ? s.spinnerSm : kind === 'light' ? s.spinnerLight : s.spinner} />;
}

export function ConfirmDialog({
  open, title, body, confirmLabel, cancelLabel, danger = false, onConfirm, onCancel,
}: {
  open: boolean; title: ReactNode; body: ReactNode; confirmLabel: ReactNode; cancelLabel: ReactNode;
  danger?: boolean; onConfirm: () => void; onCancel: () => void;
}) {
  if (!open) return null;
  return (
    <div className={s.overlay} onClick={onCancel}>
      <div className={s.modal} role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <div className={s.modalTitle}>{title}</div>
        <div className={s.modalBody}>{body}</div>
        <div className={s.modalActions}>
          <button type="button" className={s.modalCancel} onClick={onCancel}>{cancelLabel}</button>
          <button type="button" className={s.modalConfirm} data-danger={danger} onClick={onConfirm}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}
