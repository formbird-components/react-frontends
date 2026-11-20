// My View's project filter (ruleSetProjectfilter, ruleSetFilters, the Project Access include): the
// projects picked (kept in the URL, ?project=<id>,<id>), an admin's "show all projects" (?all=1),
// and the projects in scope that every list and the board search.

import { useQuery } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';
import { api } from '@react-frontends/shared/api';
import { terms } from '@react-frontends/shared/es';
import { rememberedProject, rememberProject, useAccount, useIsAdmin } from '@/data/sdms';
import { bool, projectScope, sdms } from '@/domain/queries';
import type { Project, Ref } from '@/domain/types';

/** Names of projects by id (the URL keeps only ids). */
function useProjectNames(ids: string[]) {
  const key = [...ids].sort().join(',');
  return useQuery({
    queryKey: ['project-names', key],
    queryFn: async () => {
      const found = await api.search<Project>({ query: bool({ filter: [...sdms('project'), terms('documentId', key.split(','))] }) }, { size: ids.length, include: ['documentId', 'systemHeader.summaryName'] });
      return new Map(found.documents.map((p) => [p.documentId, p.systemHeader?.summaryName ?? '']));
    },
    enabled: !!key,
    staleTime: 10 * 60_000,
  });
}

export function useMyViewScope() {
  const account = useAccount();
  const isAdmin = useIsAdmin();
  const [params, setParams] = useSearchParams();
  // On load with nothing picked, the project last picked (here or on Formbird's SDMS forms): used
  // from the first render, and put in the URL once.
  const [arrival, setArrival] = useState(() => (params.get('project') ? null : rememberedProject()));
  const projectParam = params.get('project') ?? arrival?.map((r) => r.documentId).join(',') ?? '';
  const ids = useMemo(() => projectParam.split(',').filter(Boolean), [projectParam]);
  const showAll = isAdmin && params.get('all') === '1';

  useEffect(() => {
    if (arrival?.length)
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (!next.get('project')) next.set('project', arrival.map((r) => r.documentId).join(','));
          return next;
        },
        { replace: true },
      );
    // Once, on arrival.
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const names = useProjectNames(ids);
  const picked: Ref[] = useMemo(() => {
    const known = [...(account.sdmsProjectRel ?? []), ...(rememberedProject() ?? [])];
    return ids.map((id) => ({ documentId: id, name: names.data?.get(id) ?? known.find((k) => k.documentId === id)?.name ?? '…' }));
  }, [ids, names.data, account.sdmsProjectRel]);

  const scope = useMemo(() => projectScope(picked, account, showAll), [picked, account, showAll]);

  const setPicked = useCallback(
    (refs: Ref[]) => {
      setArrival(null);
      rememberProject(account, refs);
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (refs.length) next.set('project', refs.map((r) => r.documentId).join(','));
          else next.delete('project');
          return next;
        },
        { replace: true },
      );
    },
    [account, setParams],
  );

  const setShowAll = useCallback(
    (on: boolean) =>
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (on) next.set('all', '1');
          else next.delete('all');
          return next;
        },
        { replace: true },
      ),
    [setParams],
  );

  /** What the lists cover, in words. */
  const ownCount = account.sdmsProjectRel?.length ?? 0;
  const describe =
    picked.length === 1
      ? `Items in ${picked[0].name}`
      : picked.length > 1
        ? `Items in ${picked.length} projects`
        : showAll || !ownCount
          ? 'Items in every project'
          : ownCount === 1
            ? 'Items in your project'
            : `Items in your ${ownCount} projects`;

  return { account, isAdmin, picked, setPicked, showAll, setShowAll, scope, describe };
}

export type MyViewScope = ReturnType<typeof useMyViewScope>;
