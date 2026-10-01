import { useT } from '../i18n';
import { Icon } from './Icon';

/* Shown while a screen's data loads (skeleton) or when it could not load (message + retry). */
export function PageState({ error, onRetry, variant = 'list' }: { error?: boolean; onRetry?: () => void; variant?: Variant }) {
  const t = useT();
  if (error) {
    return (
      <div role="alert" style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24, textAlign: 'center' }}>
        <span style={{ color: 'var(--danger)' }} aria-hidden="true"><Icon name="alert" size={30} /></span>
        <div style={{ font: '700 17px var(--font-ui)' }}>{t('common.loadFailed')}</div>
        <div style={{ font: '400 13px/1.5 var(--font-ui)', color: 'var(--text-secondary)', maxWidth: 280 }}>{t('common.loadFailedHint')}</div>
        {onRetry && (
          <button type="button" onClick={onRetry}
            style={{ marginTop: 6, minHeight: 44, padding: '0 22px', borderRadius: 999, border: 'none', background: 'var(--accent)', color: 'var(--ink)', font: '700 13px var(--font-ui)', cursor: 'pointer' }}>
            {t('common.retry')}
          </button>
        )}
      </div>
    );
  }
  return <Skeleton variant={variant} label={t('common.loading')} />;
}

/* Per-screen skeletons: the same geometry as the screen that loads. */
type Variant = 'today' | 'list' | 'grid' | 'planner';
const box = (h: number, extra: React.CSSProperties = {}) => <div className="sk" style={{ height: h, ...extra }} />;
function Skeleton({ variant, label }: { variant: Variant; label: string }) {
  return (
    <div aria-busy="true" aria-label={label} style={{ flex: 1, padding: '16px', display: 'flex', flexDirection: 'column', gap: 12, overflow: 'hidden', maxWidth: 1180, width: '100%', margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', height: 44 }}>
        <div className="sk" style={{ width: 160, height: 14 }} />
        <div className="sk" style={{ width: 32, height: 32, borderRadius: '50%' }} />
      </div>
      {variant === 'today' && (
        <>
          {box(92)}
          {box(182)}
          {box(18, { width: 120, border: 'none' })}
          {box(64)}{box(64)}{box(64)}
        </>
      )}
      {variant === 'list' && (
        <>
          {box(40, { borderRadius: 999 })}
          {box(14, { width: 90, border: 'none', marginTop: 8 })}
          {box(56)}{box(56)}{box(56)}{box(56)}
        </>
      )}
      {variant === 'grid' && (
        <>
          {box(40)}
          {box(150)}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 12 }}>{box(160)}{box(160)}{box(160)}</div>
        </>
      )}
      {variant === 'planner' && (
        <>
          {box(44)}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 6 }}>{Array.from({ length: 7 }, (_, i) => <div key={i} className="sk" style={{ height: 52 }} />)}</div>
          {box(360)}
        </>
      )}
    </div>
  );
}
