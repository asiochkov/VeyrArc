/* Product configuration. Values the design does not specify live here. */
const SITE_URL = (import.meta.env.VITE_SITE_URL as string | undefined) || 'https://veyrarc.online';
export const config = {
  /* Decision B25: production domain (OAuth redirects, Resend sender, PWA scope). */
  site: {
    /* single source: VITE_SITE_URL (default https://veyrarc.online) */
    url: SITE_URL,
    domain: new URL(SITE_URL).host,
    support: `support@${new URL(SITE_URL).host}`,
  },
  auth: {
    /* Sign in with Apple needs a paid Apple Developer account (decision B26). */
    apple: false,
    /* shown only once Google OAuth keys are set in Supabase (VITE_AUTH_GOOGLE=1); always shown in the design preview */
    google: import.meta.env.VITE_AUTH_GOOGLE === '1' || !import.meta.env.VITE_SUPABASE_URL,
  },
  /* Beta: everything open, no subscription anywhere in the app (the database has the same switch: private.flags.beta) */
  beta: true,
  arc: {
    lengthDays: 90,
  },
  limits: {
    /* Master Changeset: Free = 5 Core habits (Extra unlimited), 3 goals */
    free: { core: 5, habits: Infinity, goals: 3, freezesPerWeek: 1 },
    pro: { core: Infinity, habits: Infinity, goals: Infinity, freezesPerWeek: 2 },
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
