/* Product configuration. Values the design does not specify live here. */
export const config = {
  /* Decision B25: production domain (OAuth redirects, Resend sender, PWA scope). */
  site: {
    domain: 'veyrarc.online',
  },
  auth: {
    /* Sign in with Apple needs a paid Apple Developer account (decision B26). */
    apple: false,
    /* shown only once Google OAuth keys are set in Supabase (VITE_AUTH_GOOGLE=1); always shown in the design preview */
    google: import.meta.env.VITE_AUTH_GOOGLE === '1' || !import.meta.env.VITE_SUPABASE_URL,
  },
  arc: {
    lengthDays: 90,
  },
  limits: {
    free: { habits: 5, goals: 3, freezesPerWeek: 1 },
    pro: { habits: Infinity, goals: Infinity, freezesPerWeek: 2 },
  },
  /* No prices in the design; the Pro screen shows none. Fill in when billing exists. */
  /* UX audit 4.5: RU in rubles, EN in dollars; payments are not connected yet (trial only). */
  pricing: {
    ru: { monthly: 490, yearly: 3490, currency: 'RUB' },
    en: { monthly: 6.99, yearly: 49, currency: 'USD' },
    trialDays: 7,
    refundDays: 14,
  },
  /* Viewport width at which the rail replaces the bottom bar (proposal C1). */
  desktopMinWidth: 1024,
} as const;
