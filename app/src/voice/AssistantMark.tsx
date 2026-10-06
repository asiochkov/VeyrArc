/* VeyrArc assistant mark: a four-point spark over an arc — the app's own sign instead of a mic. */
export function AssistantMark({ size = 26, live = false }: { size?: number; live?: boolean }) {
  const id = 'vam' + size;
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" style={{ display: 'block', overflow: 'visible' }} data-live={live || undefined}>
      <defs>
        <linearGradient id={id} x1="6" y1="4" x2="26" y2="28" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#B9CCFF" />
          <stop offset=".5" stopColor="#5B8CFF" />
          <stop offset="1" stopColor="#7A5FE0" />
        </linearGradient>
      </defs>
      <path d="M5 24.5a11.5 11.5 0 0 1 22 0" fill="none" stroke={`url(#${id})`} strokeWidth="2" strokeLinecap="round" opacity=".55" />
      <path d="M16 4.5c.7 4.9 2.6 6.8 7.5 7.5-4.9.7-6.8 2.6-7.5 7.5-.7-4.9-2.6-6.8-7.5-7.5 4.9-.7 6.8-2.6 7.5-7.5z" fill={`url(#${id})`} />
    </svg>
  );
}
