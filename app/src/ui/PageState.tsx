import { useT } from '../i18n';
import { Icon } from './Icon';

/* Shown while a screen's data loads (skeleton) or when it could not load (message + retry). */
export function PageState({ error, onRetry }: { error?: boolean; onRetry?: () => void }) {
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
  return (
    <div aria-busy="true" aria-label={t('common.loading')} style={{ flex: 1, padding: '22px 18px', display: 'flex', flexDirection: 'column', gap: 12, overflow: 'hidden' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div><div className="sk" style={{ width: 70, height: 10 }} /><div className="sk" style={{ width: 150, height: 24, marginTop: 10 }} /></div>
        <div className="sk" style={{ width: 38, height: 38, borderRadius: '50%' }} />
      </div>
      <div className="sk" style={{ height: 120, marginTop: 8, borderRadius: 20 }} />
      <div className="sk" style={{ height: 64, borderRadius: 16 }} />
      <div className="sk" style={{ height: 64, borderRadius: 16 }} />
      <div className="sk" style={{ height: 64, borderRadius: 16 }} />
    </div>
  );
}
