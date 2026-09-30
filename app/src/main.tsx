import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient } from '@tanstack/react-query';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { createSyncStoragePersister } from '@tanstack/query-sync-storage-persister';
import { RouterProvider } from 'react-router-dom';
import { ErrorBoundary } from './app/ErrorBoundary';
import { OfflineBanner } from './app/OfflineBanner';
import { Toaster } from './ui/toast';
import { router } from './app/router';
import { useLangStore } from './i18n';
import { initAuth, useAuth } from './lib/auth';
import { startPwa } from './lib/pwa';
import './styles/fonts';
import './styles/global.css';

document.documentElement.lang = useLangStore.getState().lang;
initAuth();
startPwa();
// iOS Safari ignores user-scalable=no: block pinch-zoom gestures explicitly
document.addEventListener('gesturestart', (e) => e.preventDefault());
document.addEventListener('touchmove', (e) => { if ((e as TouchEvent & { scale?: number }).scale !== undefined && (e as TouchEvent & { scale: number }).scale !== 1) e.preventDefault(); }, { passive: false });

// gcTime ≥ persist maxAge, so data loaded once stays readable offline and after a reload
const queryClient = new QueryClient({ defaultOptions: { queries: { staleTime: 30_000, retry: 1, gcTime: 7 * 86400_000 } } });
const stored = createSyncStoragePersister({ storage: safeStorage(), key: 'veyrarc.cache', throttleTime: 1000 });
// online start: always fresh data from the server; offline start: the last data seen, read-only until the network is back
const persister = { ...stored, restoreClient: () => (navigator.onLine ? undefined : stored.restoreClient()) };
function safeStorage() { try { localStorage.setItem('veyrarc.t', '1'); localStorage.removeItem('veyrarc.t'); return localStorage; } catch { return undefined; } }

// the cache belongs to one account: a different account (or sign-out) starts from an empty cache
const CACHE_UID = 'veyrarc.cacheUid';
useAuth.subscribe((st) => {
  if (!st.ready) return;
  const uid = st.session?.user.id ?? '';
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
        <OfflineBanner />
        <Toaster />
      </PersistQueryClientProvider>
    </ErrorBoundary>
  </StrictMode>,
);
