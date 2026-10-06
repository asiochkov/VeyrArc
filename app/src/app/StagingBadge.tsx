/* The staging clone (veyrarc-staging) shows a small «ТЕСТ» badge so it is never mistaken for the live app. */
export const isStaging = import.meta.env.VITE_APP_ENV === 'staging';

export function StagingBadge() {
  if (!isStaging) return null;
  return (
    <div aria-hidden="true" style={{
      position: 'fixed', top: 'calc(var(--safe-top, 0px) + 6px)', left: '50%', transform: 'translateX(-50%)', zIndex: 2000,
      padding: '3px 10px', borderRadius: 999, background: '#F2B33D', color: '#030923',
      font: '600 11px var(--font-ui)', letterSpacing: '.06em', pointerEvents: 'none',
    }}>ТЕСТ · {__BUILD__}</div>
  );
}
