// Routes of this feature area. The router (src/app/router.tsx) mounts them inside the app shell.
// Pages are lazy-loaded, with a placeholder while their code downloads.
import type { RouteObject } from 'react-router';
import { PageSkeleton, RouteError } from '@react-frontends/shared/components';

export const routes: RouteObject[] = [
  {
    path: 'checks',
    lazy: async () => ({ Component: (await import('./checks-page')).ChecksPage }),
    hydrateFallbackElement: <PageSkeleton tiles={3} />,
    errorElement: <RouteError />,
  },
  {
    path: 'checks/new',
    lazy: async () => ({ Component: (await import('./new-check-page')).NewCheckPage }),
    hydrateFallbackElement: <PageSkeleton tiles={0} />,
    errorElement: <RouteError />,
  },
  {
    path: 'checks/:id',
    lazy: async () => ({ Component: (await import('./check-page')).CheckPage }),
    hydrateFallbackElement: <PageSkeleton tiles={4} />,
    errorElement: <RouteError />,
  },
];
