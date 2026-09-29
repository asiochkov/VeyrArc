import { onlineManager, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useT } from '../i18n';
import { hasBackend } from '../lib/supabase';

/* Shown when data could not be loaded (no network or server error); not part of the design. */
export function OfflineBanner() {
  const t = useT();
  const qc = useQueryClient();
  const [failed, setFailed] = useState(false);
  const [online, setOnline] = useState(onlineManager.isOnline());
  useEffect(() => onlineManager.subscribe(setOnline), []);
  useEffect(() => {
    if (!hasBackend) return;
    const cache = qc.getQueryCache();
    const check = () => setFailed(cache.getAll().some((q) => q.state.status === 'error'));
    const unsub = cache.subscribe(check);
    const back = () => { void qc.refetchQueries({ type: 'active' }); };
    window.addEventListener('online', back);
    return () => { unsub(); window.removeEventListener('online', back); };
  }, [qc]);
  if (!hasBackend || (!failed && online)) return null;
  return (
    <div role="alert" style={{
      position: 'fixed', top: 'calc(12px + env(safe-area-inset-top, 0px))', left: '50%', transform: 'translateX(-50%)', zIndex: 60,
      display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px 10px 16px', borderRadius: 14, maxWidth: 'calc(100vw - 32px)',
      background: 'rgba(13,17,22,.96)', border: '1px solid rgba(232,165,75,.45)', boxShadow: '0 10px 30px rgba(0,0,0,.5)',
      font: '600 13px var(--font-ui)', color: 'var(--text)',
    }}>
      <span>{t('common.offline')}</span>
      <button type="button" onClick={() => { void qc.refetchQueries({ type: 'active' }); }}
        style={{ height: 32, padding: '0 12px', borderRadius: 10, border: 'none', background: 'var(--accent)', color: 'var(--ink)', font: '700 12px var(--font-ui)', cursor: 'pointer', flex: 'none' }}>
        {t('common.retry')}
      </button>
    </div>
  );
}
