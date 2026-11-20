// All Items and the Item form (Formbird's "All Items" and "Item" templates). Lazy-loaded, with a
// placeholder while their code downloads.
import type { RouteObject } from 'react-router';
import { PageSkeleton, RouteError } from '@react-frontends/shared/components';

const states = { hydrateFallbackElement: <PageSkeleton />, errorElement: <RouteError /> };

export const routes: RouteObject[] = [
  { path: 'items', lazy: async () => ({ Component: (await import('./all-items/all-items-page')).AllItemsPage }), ...states },
  { path: 'items/new', lazy: async () => ({ Component: (await import('./item/item-page')).NewItemPage }), ...states },
  { path: 'items/:ref', lazy: async () => ({ Component: (await import('./item/item-page')).ItemPage }), ...states },
];
