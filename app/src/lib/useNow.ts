import { useEffect, useState } from 'react';

/** Current time, refreshed every `ms` — only the component that calls it re-renders. */
export function useNow(ms: number) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms);
    // after the phone was locked / the tab hidden, catch up at once
    const vis = () => { if (!document.hidden) setNow(Date.now()); };
    document.addEventListener('visibilitychange', vis);
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', vis); };
  }, [ms]);
  return now;
}
