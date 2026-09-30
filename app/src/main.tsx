import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from 'react-router-dom';
import { OfflineBanner } from './app/OfflineBanner';
import { router } from './app/router';
import { useLangStore } from './i18n';
import { initAuth } from './lib/auth';
import './styles/fonts';
import './styles/global.css';

document.documentElement.lang = useLangStore.getState().lang;
initAuth();
// iOS Safari ignores user-scalable=no: block pinch-zoom gestures explicitly
document.addEventListener('gesturestart', (e) => e.preventDefault());
document.addEventListener('touchmove', (e) => { if ((e as TouchEvent & { scale?: number }).scale !== undefined && (e as TouchEvent & { scale: number }).scale !== 1) e.preventDefault(); }, { passive: false });

const queryClient = new QueryClient({ defaultOptions: { queries: { staleTime: 30_000, retry: 1 } } });

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
      <OfflineBanner />
    </QueryClientProvider>
  </StrictMode>,
);
