// Routes of this feature area. The router (src/app/router.tsx) mounts them inside the app shell.
// Pages are lazy-loaded, with a placeholder while their code downloads.
import type { RouteObject } from 'react-router';
import { PageSkeleton, RouteError } from '@react-frontends/shared/components';

export const routes: RouteObject[] = [
  {
    path: 'workshop',
    lazy: async () => ({ Component: (await import('./board-page')).WorkshopPage }),
    hydrateFallbackElement: <PageSkeleton tiles={5} />,
    errorElement: <RouteError />,
  },
  {
    path: 'workshop/requests/new',
    lazy: async () => ({ Component: (await import('./new-request-page')).NewRequestPage }),
    hydrateFallbackElement: <PageSkeleton tiles={0} />,
    errorElement: <RouteError />,
  },
  {
    path: 'workshop/requests/:id',
    lazy: async () => ({ Component: (await import('./request-page')).RequestPage }),
    hydrateFallbackElement: <PageSkeleton tiles={0} />,
    errorElement: <RouteError />,
  },
  {
    path: 'workshop/work-orders/:id',
    lazy: async () => ({ Component: (await import('./work-order-page')).WorkOrderPage }),
    hydrateFallbackElement: <PageSkeleton tiles={4} />,
    errorElement: <RouteError />,
  },
];
