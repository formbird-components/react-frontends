// Routes of this feature area. The router (src/app/router.tsx) mounts them inside the app shell.
// Pages are lazy-loaded (the list brings Recharts), with a placeholder while their code downloads.
import type { RouteObject } from 'react-router';
import { PageSkeleton, RouteError } from '@react-frontends/shared/components';

export const routes: RouteObject[] = [
  {
    path: 'fuel',
    lazy: async () => ({ Component: (await import('./fuel-page')).FuelPage }),
    hydrateFallbackElement: <PageSkeleton tiles={5} />,
    errorElement: <RouteError />,
  },
  {
    path: 'fuel/new',
    lazy: async () => ({ Component: (await import('./new-fuel-page')).NewFuelPage }),
    hydrateFallbackElement: <PageSkeleton tiles={0} />,
    errorElement: <RouteError />,
  },
];
