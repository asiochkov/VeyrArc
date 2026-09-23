/* Product configuration. Values the design does not specify live here. */
export const config = {
  /* Decision B25: production domain (OAuth redirects, Resend sender, PWA scope). */
  site: {
    domain: 'veyrarc.com',
  },
  auth: {
    /* Sign in with Apple needs a paid Apple Developer account (decision B26). */
    apple: false,
    google: true,
  },
  arc: {
    lengthDays: 90,
  },
  limits: {
    free: { habits: 5, goals: 3, freezesPerWeek: 1 },
    pro: { habits: Infinity, goals: Infinity, freezesPerWeek: 2 },
  },
  /* No prices in the design; the Pro screen shows none. Fill in when billing exists. */
  pricing: {
    monthly: null as number | null,
    yearly: null as number | null,
    yearlyDiscountPct: 30,
  },
  /* Viewport width at which the rail replaces the bottom bar (proposal C1). */
  desktopMinWidth: 1024,
} as const;
