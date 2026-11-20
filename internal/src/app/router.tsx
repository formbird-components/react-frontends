import { createBrowserRouter, Navigate, type RouteObject } from 'react-router';
import { NotFound } from '@react-frontends/shared/components';
import { RequireSession } from '@react-frontends/shared/shell';
import { LoginPage } from '@/features/auth/login';
import { routes as items } from '@/features/items/routes';
import { routes as myView } from '@/features/my-view/routes';
import { routes as recent } from '@/features/recent/routes';
import { HOME } from './nav';
import { InternalShell } from './shell';

const appRoutes: RouteObject[] = [
  { index: true, element: <Navigate to={HOME} replace /> },
  ...myView,
  ...items,
  ...recent,
  { path: '*', element: <NotFound /> },
];

export const router = createBrowserRouter([
  { path: '/login', element: <LoginPage /> },
  { element: <RequireSession />, children: [{ element: <InternalShell />, children: appRoutes }] },
]);
