import { useSyncExternalStore } from 'react';
import { config } from '../config';

const query = `(min-width: ${config.desktopMinWidth}px)`;

function subscribe(cb: () => void) {
  const mql = window.matchMedia(query);
  mql.addEventListener('change', cb);
  return () => mql.removeEventListener('change', cb);
}

export function useIsDesktop() {
  return useSyncExternalStore(subscribe, () => window.matchMedia(query).matches, () => true);
}
