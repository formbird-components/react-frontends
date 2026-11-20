// Recent (Formbird's "My Recent Documents"): what the person saved last. Lazy-loaded.
import type { RouteObject } from 'react-router';
import { PageSkeleton, RouteError } from '@react-frontends/shared/components';

export const routes: RouteObject[] = [
  { path: 'recent', lazy: async () => ({ Component: (await import('./recent-page')).RecentPage }), hydrateFallbackElement: <PageSkeleton tiles={0} />, errorElement: <RouteError /> },
];
