import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient } from '@tanstack/react-query';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { createSyncStoragePersister } from '@tanstack/query-sync-storage-persister';
import { RouterProvider } from 'react-router-dom';
import { ErrorBoundary } from './app/ErrorBoundary';
import { OfflineBanner } from './app/OfflineBanner';
import { StagingBadge } from './app/StagingBadge';
import { Toaster } from './ui/toast';
import { bindSystem, SYSTEM_KEY } from './state/system';
import { hasStoredQueue, resumeQueue, setDrainedHandler } from './data/sync';
import { router } from './app/router';
import { useLangStore } from './i18n';
import { initAuth, useAuth } from './lib/auth';
import { startDensity } from './lib/density';
import { startRealtime } from './lib/realtime';
import { fitStandaloneHeight, startPwa } from './lib/pwa';
import './styles/fonts';
import './styles/global.css';

document.documentElement.lang = useLangStore.getState().lang;
initAuth();
startDensity();
startPwa();
fitStandaloneHeight();
// iOS Safari ignores user-scalable=no: block pinch-zoom gestures explicitly
document.addEventListener('gesturestart', (e) => e.preventDefault());
document.addEventListener('touchmove', (e) => { if ((e as TouchEvent & { scale?: number }).scale !== undefined && (e as TouchEvent & { scale: number }).scale !== 1) e.preventDefault(); }, { passive: false });

// gcTime ≥ persist maxAge, so data loaded once stays readable offline and after a reload
const queryClient = new QueryClient({ defaultOptions: { queries: { staleTime: 30_000, retry: 1, gcTime: 7 * 86400_000 } } });
const stored = createSyncStoragePersister({ storage: safeStorage(), key: 'veyrarc.cache', throttleTime: 1000 });
// online start: fresh data from the server; offline start, or changes still waiting from the last run:
// the last data seen (with those changes), until the queue is sent
bindSystem(queryClient);
startRealtime(queryClient);
const persister = { ...stored, restoreClient: () => (navigator.onLine && !hasStoredQueue() ? undefined : stored.restoreClient()) };
setDrainedHandler(() => { for (const k of [SYSTEM_KEY, ['calendar'], ['events'], ['accountStats']]) void queryClient.invalidateQueries({ queryKey: k }); });
function safeStorage() { try { localStorage.setItem('veyrarc.t', '1'); localStorage.removeItem('veyrarc.t'); return localStorage; } catch { return undefined; } }

// the cache belongs to one account: a different account (or sign-out) starts from an empty cache
const CACHE_UID = 'veyrarc.cacheUid';
useAuth.subscribe((st) => {
  if (!st.ready) return;
  const uid = st.session?.user.id ?? '';
  resumeQueue(uid);
  let prev: string | null = null;
  try { prev = localStorage.getItem(CACHE_UID); } catch { /* no storage */ }
  if (prev === uid) return;
  if (prev !== null) queryClient.clear();
  try { localStorage.setItem(CACHE_UID, uid); } catch { /* no storage */ }
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <PersistQueryClientProvider client={queryClient} persistOptions={{ persister, maxAge: 7 * 86400_000, buster: 'v1' }}>
        <RouterProvider router={router} />
        <StagingBadge />
        <OfflineBanner />
        <Toaster />
      </PersistQueryClientProvider>
    </ErrorBoundary>
  </StrictMode>,
);
