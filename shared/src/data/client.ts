import { QueryClient, type QueryClientConfig } from '@tanstack/react-query';
import { ApiError } from '../api';

/**
 * The app's TanStack Query client: results stay fresh for 30 s, refresh when the window regains
 * focus, and requests the server refused (400, 401, 403, 404) aren't retried.
 */
export function createQueryClient(config: QueryClientConfig = {}): QueryClient {
  return new QueryClient({
    ...config,
    defaultOptions: {
      ...config.defaultOptions,
      queries: {
        staleTime: 30_000,
        refetchOnWindowFocus: true,
        retry: (count, error) => !(error instanceof ApiError && [400, 401, 403, 404].includes(error.status)) && count < 2,
        ...config.defaultOptions?.queries,
      },
    },
  });
}
