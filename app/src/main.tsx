import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient } from '@tanstack/react-query';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { createSyncStoragePersister } from '@tanstack/query-sync-storage-persister';
import { RouterProvider } from 'react-router-dom';
import { ErrorBoundary } from './app/ErrorBoundary';
import { OfflineBanner } from './app/OfflineBanner';
import { AchievementWatcher } from './app/AchievementWatcher';
import { StagingBadge } from './app/StagingBadge';
import { Toaster } from './ui/toast';
import { bindSystem, SYSTEM_KEY } from './state/system';
import { hasStoredQueue, resumeQueue, setDrainedHandler } from './data/sync';
import { router } from './app/router';
import { useLangStore } from './i18n';
import { initAuth, useAuth } from './lib/auth';
import { startDensity } from './lib/density';
import { initTheme } from './lib/theme';
import { capturePushOpen, initMetrika } from './lib/analytics';
import { startRealtime } from './lib/realtime';
import { fitStandaloneHeight, startPwa } from './lib/pwa';
import './styles/fonts';
import './styles/global.css';

document.documentElement.lang = useLangStore.getState().lang;
initAuth();
startDensity();
capturePushOpen();
initMetrika();
initTheme();
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
const persister = { ...stored, restoreClient: async () => {
  if (!useAuth.getState().ready) await new Promise<void>((resolve) => {
    const unsubscribe = useAuth.subscribe((state) => { if (state.ready) { unsubscribe(); resolve(); } });
    if (useAuth.getState().ready) { unsubscribe(); resolve(); }
  });
  const uid = useAuth.getState().session?.user.id ?? '';
  if (!uid || (navigator.onLine && !hasStoredQueue())) return undefined;
  try { if (localStorage.getItem(CACHE_UID) !== uid) return undefined; } catch { return undefined; }
  const saved = await stored.restoreClient();
  if (saved?.buster === 'v1') {
    saved.buster = 'free-v2';
    for (const query of saved.clientState.queries) {
      if (query.queryKey[0] === 'system' && query.queryKey.length === 1) {
        query.queryKey = [...SYSTEM_KEY, uid]; query.queryHash = JSON.stringify(query.queryKey);
      }
    }
  }
  return saved;
} };
setDrainedHandler(() => { for (const k of [SYSTEM_KEY, ['calendar'], ['events'], ['accountStats']]) void queryClient.invalidateQueries({ queryKey: k }); });
function safeStorage() { try { localStorage.setItem('veyrarc.t', '1'); localStorage.removeItem('veyrarc.t'); return localStorage; } catch { return undefined; } }

// the cache belongs to one account: a different account (or sign-out) starts from an empty cache
const CACHE_UID = 'veyrarc.cacheUid';
useAuth.subscribe((st) => {
  if (!st.ready) return;
  const uid = st.session?.user.id ?? '';
  let prev: string | null = null;
  try { prev = localStorage.getItem(CACHE_UID); } catch { /* no storage */ }
  if (prev === uid) { resumeQueue(uid); return; }
  queryClient.clear();
  stored.removeClient();
  try { localStorage.setItem(CACHE_UID, uid); } catch { /* no storage */ }
  resumeQueue(uid);
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <PersistQueryClientProvider client={queryClient} persistOptions={{ persister, maxAge: 7 * 86400_000, buster: 'free-v2' }}>
        <RouterProvider router={router} />
        <StagingBadge />
        <OfflineBanner />
        <Toaster />
        <AchievementWatcher />
      </PersistQueryClientProvider>
    </ErrorBoundary>
  </StrictMode>,
);
