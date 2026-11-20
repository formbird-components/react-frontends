// Routes of this feature area. The router (src/app/router.tsx) mounts them inside the app shell.
// The overview is lazy-loaded (it brings MapLibre and Recharts), with a placeholder while its code
// downloads.
import type { RouteObject } from 'react-router';
import { PageSkeleton, RouteError } from '@react-frontends/shared/components';

export const routes: RouteObject[] = [
  {
    path: 'overview',
    lazy: async () => ({ Component: (await import('./overview-page')).OverviewPage }),
    hydrateFallbackElement: <PageSkeleton tiles={8} />,
    errorElement: <RouteError />,
  },
];
