import { BASE_PATH } from '@react-frontends/shared/api';
import { createBrowserRouter, Navigate, type RouteObject } from 'react-router';
import { NotFound } from '@react-frontends/shared/components';
import { RequireSession } from '@react-frontends/shared/shell';
import { useSession } from '@/data/session';
import { LoginPage } from '@/features/auth/login';
import { routes as assets } from '@/features/assets/routes';
import { routes as bookings } from '@/features/bookings/routes';
import { routes as checks } from '@/features/checks/routes';
import { routes as fuel } from '@/features/fuel/routes';
import { routes as map } from '@/features/map/routes';
import { routes as overview } from '@/features/overview/routes';
import { routes as workshop } from '@/features/workshop/routes';
import { homeFor } from './nav';
import { FleetShell } from './shell';

function Home() {
  const { account } = useSession();
  return <Navigate to={homeFor(account?.accountType)} replace />;
}

const appRoutes: RouteObject[] = [
  { index: true, element: <Home /> },
  ...overview,
  ...assets,
  ...map,
  ...bookings,
  ...workshop,
  ...checks,
  ...fuel,
  { path: '*', element: <NotFound /> },
];

export const router = createBrowserRouter(
  [
    { path: '/login', element: <LoginPage /> },
    { element: <RequireSession />, children: [{ element: <FleetShell />, children: appRoutes }] },
  ],
  { basename: BASE_PATH || '/' },
);
