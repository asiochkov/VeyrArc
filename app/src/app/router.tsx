import { createBrowserRouter, createMemoryRouter, type RouteObject } from 'react-router-dom';
import { Login, Reset, Signup, Verify, Welcome } from '../pages/auth/screens';
import { Account, DayOne, FirstHome, Onboarding } from '../pages/auth/screens2';
import { Calendar } from '../pages/calendar/Calendar';
import { Goals } from '../pages/goals/Goals';
import { Profile } from '../pages/profile/Profile';
import { Legal } from '../pages/legal/Legal';
import { Pro } from '../pages/pro/Pro';
import { Settings } from '../pages/settings/Settings';
import { Today } from '../pages/today/Today';
import { Tracker } from '../pages/tracker/Tracker';
import { PreviewLayout, PreviewScreens } from '../preview/PreviewScreens';
import { AppShell } from './AppShell';
import { CrashScreen } from './ErrorBoundary';
import { GuestOnly, RequireAuth } from './AuthGate';

const routes: RouteObject[] = [
  {
    element: <RequireAuth><AppShell chrome="app" /></RequireAuth>,
    errorElement: <CrashScreen />,
    children: [
      { path: '/', element: <Today /> },
      { path: '/habits', element: <Tracker /> },
      { path: '/calendar', element: <Calendar /> },
      { path: '/goals', element: <Goals /> },
      { path: '/profile', element: <Profile /> },
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
      { path: '/start', element: <FirstHome /> },
      { path: '/signup', element: <GuestOnly><Signup /></GuestOnly> },
      { path: '/verify', element: <Verify /> },
      { path: '/login', element: <GuestOnly><Login /></GuestOnly> },
      { path: '/reset', element: <Reset /> },
      { path: '/pro', element: <Pro /> },
      { path: '/terms', element: <Legal doc="terms" /> },
      { path: '/privacy', element: <Legal doc="privacy" /> },
      { path: '/settings/account', element: <RequireAuth><Account /></RequireAuth> },
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
