import { createBrowserRouter, createMemoryRouter, type RouteObject } from 'react-router-dom';
import { Login, Reset, Signup, Verify, Welcome } from '../pages/auth/screens';
import { Account, DayOne, Onboarding } from '../pages/auth/screens2';
import { Calendar } from '../pages/calendar/Calendar';
import { Goals } from '../pages/goals/Goals';
import { Analytics } from '../pages/analytics/Analytics';
import { Recap } from '../pages/arc/Recap';
import { Legal } from '../pages/legal/Legal';
import { Pro } from '../pages/pro/Pro';
import { Settings } from '../pages/settings/Settings';
import { Today } from '../pages/today/Today';
import { Disciplines } from '../pages/disciplines/Disciplines';
import { PreviewLayout, PreviewScreens } from '../preview/PreviewScreens';
import { AppShell } from './AppShell';
import { CrashScreen } from './ErrorBoundary';
import { Navigate, useLocation } from 'react-router-dom';

/* web+veyrarc://<path> deep links and notification links land here (Master Changeset task 30) */
const DEEP = /^(analytics|planner|goals|disciplines|settings|arc\/recap)(\/[\w-]+)?$/;
function OpenLink() {
  const to = new URLSearchParams(useLocation().search).get('to') ?? '';
  const path = decodeURIComponent(to).replace(/^web\+veyrarc:\/*/i, '').replace(/^\/+/, '').split(/[?#]/)[0];
  return <Navigate to={DEEP.test(path) ? '/' + path : '/'} replace />;
}

function Redirect({ to }: { to: string }) {
  const { search, hash } = useLocation();
  return <Navigate to={to + search + hash} replace />;
}
import { GuestOnly, RequireAuth } from './AuthGate';

const routes: RouteObject[] = [
  {
    element: <RequireAuth><AppShell chrome="app" /></RequireAuth>,
    errorElement: <CrashScreen />,
    children: [
      { path: '/', element: <Today /> },
      { path: '/disciplines', element: <Disciplines /> },
      { path: '/planner', element: <Calendar /> },
      { path: '/goals', element: <Goals /> },
      { path: '/goals/:goalId', element: <Goals /> },
      { path: '/analytics', element: <Analytics /> },
      // old addresses (bookmarks, home-screen shortcuts, e-mails) keep working
      { path: '/habits', element: <Redirect to="/disciplines" /> },
      { path: '/calendar', element: <Redirect to="/planner" /> },
      { path: '/profile', element: <Redirect to="/analytics" /> },
    ],
  },
  {
    element: <RequireAuth><AppShell chrome="settings" /></RequireAuth>,
    errorElement: <CrashScreen />,
    children: [
      { path: '/settings', element: <Settings /> },
    ],
  },
  {
    element: <AppShell chrome="bare" />,
    errorElement: <CrashScreen />,
    children: [
      { path: '/welcome', element: <GuestOnly><Welcome /></GuestOnly> },
      { path: '/onboarding', element: <Onboarding /> },
      { path: '/day-one', element: <DayOne /> },
      { path: '/start', element: <Navigate to="/" replace /> },
      { path: '/open', element: <RequireAuth><OpenLink /></RequireAuth> },
      { path: '/signup', element: <GuestOnly><Signup /></GuestOnly> },
      { path: '/verify', element: <Verify /> },
      { path: '/login', element: <GuestOnly><Login /></GuestOnly> },
      { path: '/reset', element: <Reset /> },
      { path: '/arc/recap/:id', element: <RequireAuth><Recap /></RequireAuth> },
      { path: '/pro', element: <Pro /> },
      { path: '/terms', element: <Legal doc="terms" /> },
      { path: '/privacy', element: <Legal doc="privacy" /> },
      { path: '/settings/account', element: <RequireAuth><Account /></RequireAuth> },
      { path: '*', element: <Navigate to="/" replace /> },
    ],
  },
];

/*
 * Preview build (VITE_PREVIEW=1, `npm run build:preview`): the app is hosted as
 * a single page without server rewrites, so routing lives in memory and a
 * screen list (not part of the design, preview only) links to every route.
 */
export const router = import.meta.env.VITE_PREVIEW && import.meta.env.MODE === 'preview'
  ? createMemoryRouter([
    { element: <PreviewLayout />, children: [...routes, { path: '/__screens', element: <PreviewScreens /> }] },
  ], { initialEntries: ['/__screens'] })
  : createBrowserRouter(routes);
