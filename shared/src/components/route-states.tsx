// What a route shows while its code loads (lazy routes), when it fails (a render error, or a
// chunk that didn't download after a deploy), and when nothing matches the address.

import { Loader2, RefreshCw, TriangleAlert } from 'lucide-react';
import { isRouteErrorResponse, Link, useRouteError } from 'react-router';
import { EmptyState, Page } from './page';
import { Button, Skeleton } from '../ui';

/** The whole window, waiting (e.g. for the session). */
export function FullPageSpinner() {
  return (
    <div className="flex h-dvh items-center justify-center text-muted-foreground">
      <Loader2 className="size-5 animate-spin" />
    </div>
  );
}

/** The page for an address no route matches. */
export function NotFound({ home = '/' }: { home?: string }) {
  return (
    <Page>
      <EmptyState
        title="Nothing here"
        action={
          <Button asChild variant="outline">
            <Link to={home}>Go home</Link>
          </Button>
        }
      >
        This page doesn't exist, or the record was removed.
      </EmptyState>
    </Page>
  );
}

/** A page-shaped placeholder: a heading, a row of tiles and a panel. */
export function PageSkeleton({ tiles = 4 }: { tiles?: number }) {
  return (
    <Page wide>
      <div aria-busy="true" aria-label="Loading">
        <Skeleton className="h-7 w-56" />
        <Skeleton className="mt-2 mb-7 h-4 w-80 max-w-full" />
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {Array.from({ length: tiles }, (_, i) => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))}
        </div>
        <Skeleton className="mt-4 h-72 rounded-xl" />
      </div>
    </Page>
  );
}

/** A route's error element: says what happened and offers a way on. */
export function RouteError() {
  const error = useRouteError();
  const notFound = isRouteErrorResponse(error) && error.status === 404;
  const stale = error instanceof Error && /dynamically imported module|Importing a module script failed|Loading chunk/i.test(error.message);
  const title = notFound ? 'Nothing here' : stale ? 'The app was updated' : 'This page ran into a problem';
  const detail = notFound
    ? "This page doesn't exist, or the record was removed."
    : stale
      ? 'Reload to get the latest version.'
      : error instanceof Error
        ? error.message
        : 'Something unexpected happened.';
  return (
    <Page>
      <div role="alert" className="mx-auto flex max-w-md flex-col items-center gap-3 py-16 text-center">
        <div className="flex size-11 items-center justify-center rounded-full bg-danger/10 text-danger">
          <TriangleAlert className="size-5" />
        </div>
        <h1 className="text-lg font-semibold tracking-tight">{title}</h1>
        <p className="text-sm break-words text-muted-foreground">{detail}</p>
        <div className="mt-2 flex gap-2">
          <Button variant="outline" asChild>
            <Link to="/">Go home</Link>
          </Button>
          {!notFound && (
            <Button onClick={() => window.location.reload()}>
              <RefreshCw />
              Reload
            </Button>
          )}
        </div>
      </div>
    </Page>
  );
}
