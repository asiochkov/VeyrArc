import { useEffect, useState } from 'react';

/*
 * The active nav item starts collapsed and expands 500ms after the screen
 * appears (navReady in every *.dc.html). In the SPA the "screen appears"
 * moment is a change of the active section.
 */
export function useNavReady(activeId: string | null) {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    setReady(false);
    const t = setTimeout(() => setReady(true), 500);
    return () => clearTimeout(t);
  }, [activeId]);
  return ready;
}
