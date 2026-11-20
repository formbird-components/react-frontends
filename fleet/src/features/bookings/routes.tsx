// Routes of this feature area. The router (src/app/router.tsx) mounts them inside the app shell.
// The three pages share one lazily loaded chunk, with a placeholder while it downloads.
import type { RouteObject } from 'react-router';
import { PageSkeleton, RouteError } from '@react-frontends/shared/components';

const pages = () => import('./pages');

export const routes: RouteObject[] = [
  {
    path: 'bookings',
    lazy: async () => ({ Component: (await pages()).BookingsPage }),
    hydrateFallbackElement: <PageSkeleton tiles={0} />,
    errorElement: <RouteError />,
  },
  {
    path: 'bookings/new',
    lazy: async () => ({ Component: (await pages()).NewBookingPage }),
    hydrateFallbackElement: <PageSkeleton tiles={0} />,
    errorElement: <RouteError />,
  },
  {
    path: 'bookings/:id',
    lazy: async () => ({ Component: (await pages()).BookingPage }),
    hydrateFallbackElement: <PageSkeleton tiles={2} />,
    errorElement: <RouteError />,
  },
];
