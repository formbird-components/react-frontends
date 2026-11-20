// My View (Formbird's "My View" template): the person's own lists of items and their board.
// Lazy-loaded, with a placeholder while its code downloads.
import type { RouteObject } from 'react-router';
import { PageSkeleton, RouteError } from '@react-frontends/shared/components';

export const routes: RouteObject[] = [
  {
    path: 'my-view',
    lazy: async () => ({ Component: (await import('./my-view-page')).MyViewPage }),
    hydrateFallbackElement: <PageSkeleton tiles={8} />,
    errorElement: <RouteError />,
  },
];
