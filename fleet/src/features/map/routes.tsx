// Routes of this feature area. The router (src/app/router.tsx) mounts them inside the app shell.
// The map page is lazy-loaded (MapLibre is large), with a placeholder while it downloads.
import type { RouteObject } from 'react-router';
import { RouteError } from '@react-frontends/shared/components';
import { Skeleton } from '@react-frontends/shared/ui';

const MapLoading = () => (
  <div className="flex h-[calc(100dvh-3.5rem)]" aria-busy="true" aria-label="Loading the map">
    <div className="hidden w-[23rem] shrink-0 border-r border-border bg-card p-4 lg:block">
      <Skeleton className="h-9 w-full" />
      <Skeleton className="mt-3 h-7 w-3/4 rounded-full" />
    </div>
    <Skeleton className="flex-1 rounded-none" />
  </div>
);

export const routes: RouteObject[] = [
  {
    path: 'map',
    lazy: async () => ({ Component: (await import('./map-page')).MapPage }),
    hydrateFallbackElement: <MapLoading />,
    errorElement: <RouteError />,
  },
];
