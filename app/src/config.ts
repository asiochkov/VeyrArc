/* Product configuration. Values the design does not specify live here. */
const SITE_URL = (import.meta.env.VITE_SITE_URL as string | undefined) || 'https://veyrarc.onrender.com';
export const config = {
  /* Decision B25: production domain (OAuth redirects, Resend sender, PWA scope). */
  site: {
    /* single source: VITE_SITE_URL (default https://veyrarc.onrender.com) */
    url: SITE_URL,
    domain: new URL(SITE_URL).host,
    support: (import.meta.env.VITE_SUPPORT_EMAIL as string | undefined) || 'support@veyrarc.online',
  },
  /* Contact details displayed on the legal pages. */
  seller: {
    name: 'ИП Иочков Арсений Сергеевич',
    inn: '631612000117',
    ogrnip: '',          // 15 digits, from the EGRIP extract (egrul.nalog.ru)
    email: '',           // a mailbox that really receives mail; falls back to site.support
    phone: '',
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
  freezesPerWeek: 2,
  desktopMinWidth: 1024,
} as const;
