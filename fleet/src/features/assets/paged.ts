// A search shown a page at a time, with "show more": TanStack's infinite query over api.search.
// Its key starts ['search', kind], so a save of that kind refreshes it (data/records useRefresh).

import { keepPreviousData, useInfiniteQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import type { RecordKind } from '@/domain/model';
import type { Doc } from '@/domain/types';
import { api } from '@react-frontends/shared/api';

export function usePagedSearch<T extends Doc = Doc>(kind: RecordKind, request: Record<string, unknown> | null, o: { pageSize: number; include?: string[]; enabled?: boolean }) {
  const query = useInfiniteQuery({
    queryKey: ['search', kind, request, { pageSize: o.pageSize, include: o.include, paged: true }],
    queryFn: ({ pageParam }) => api.search<T>(request!, { size: o.pageSize, page: pageParam, include: o.include }),
    initialPageParam: 0,
    getNextPageParam: (last, pages) => (pages.length * o.pageSize < last.total ? pages.length : undefined),
    placeholderData: keepPreviousData,
    enabled: (o.enabled ?? true) && !!request,
  });
  const items = useMemo(() => query.data?.pages.flatMap((p) => p.documents) ?? [], [query.data]);
  const total = query.data?.pages[0]?.total ?? 0;
  return { ...query, items, total };
}
