// Routes of this feature area. The router (src/app/router.tsx) mounts them inside the app shell.
// Pages are lazy-loaded (the asset page brings MapLibre and Recharts), with a placeholder while
// their code downloads.
import type { RouteObject } from 'react-router';
import { PageSkeleton, RouteError } from '@react-frontends/shared/components';

export const routes: RouteObject[] = [
  {
    path: 'assets',
    lazy: async () => ({ Component: (await import('./register-page')).RegisterPage }),
    hydrateFallbackElement: <PageSkeleton tiles={0} />,
    errorElement: <RouteError />,
  },
  {
    path: 'assets/:id',
    lazy: async () => ({ Component: (await import('./asset-page')).AssetPage }),
    hydrateFallbackElement: <PageSkeleton tiles={5} />,
    errorElement: <RouteError />,
  },
];
