// Reading and saving records. Lists are searches (Elasticsearch, a second or so behind a save);
// a single record is read from the database.
//
// Searches are cached by a group name (e.g. a record kind): a save names the group it changes, and
// searches of that group refresh.

import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, type Doc, type Identified, type SearchOptions } from '../api';

/** The group of searches no particular save refreshes (they refresh with every save, a moment later). */
export const ANY = 'any';

/** A search over records. `group` names the cache group a save of that group refreshes. */
export function useSearch<T extends Identified = Doc>(group: string, request: Record<string, unknown> | null, options: SearchOptions = {}, enabled = true) {
  return useQuery({
    queryKey: ['search', group, request, options],
    queryFn: () => api.search<T>(request!, options),
    enabled: enabled && !!request,
    placeholderData: keepPreviousData,
  });
}

/** One record, from the database. */
export function useRecord<T extends Identified = Doc>(documentId: string | undefined) {
  return useQuery({
    queryKey: ['record', documentId],
    queryFn: () => api.get<T>(documentId!),
    enabled: !!documentId,
  });
}

/** Refreshes what a save changed: the record, searches of its group, and (later) what its rules changed. */
export function useRefresh() {
  const client = useQueryClient();
  return (group?: string, documentId?: string) => {
    if (documentId) void client.invalidateQueries({ queryKey: ['record', documentId] });
    void client.invalidateQueries({ queryKey: ['search', group ?? ANY] });
    // The server's PostSave rules update other records after the response, and search sees a save
    // about a second later: refresh again then.
    setTimeout(() => void client.invalidateQueries({ queryKey: ['search'] }), 1200);
    setTimeout(() => void client.invalidateQueries({ queryKey: ['record'] }), 1500);
  };
}

/**
 * Creates a document of a template (the server numbers it and runs its rules).
 * @param templateId - The template; while it is unknown (still loading, or not on this server) a create fails with `missing`
 * @param o.group - The search group to refresh
 * @param o.defaults - Fields every new document gets (the call's fields win)
 * @param o.missing - The error when there is no template id
 */
export function useCreateDocument<T extends Identified = Doc>(templateId: string | undefined, o: { group?: string; defaults?: Record<string, unknown>; missing?: string } = {}) {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: async (fields: Record<string, unknown>) => {
      if (!templateId) throw new Error(o.missing ?? "This form isn't available on this server.");
      return api.create<T>(templateId, { ...o.defaults, ...fields });
    },
    onSuccess: (saved) => refresh(o.group, saved?.documentId),
  });
}

/** Changes fields of a document; `group` is the search group to refresh. */
export function useUpdateDocument<T extends Identified = Doc>(group?: string) {
  const refresh = useRefresh();
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ documentId, fields }: { documentId: string; fields: Record<string, unknown> }) => api.update<T>(documentId, fields),
    onSuccess: (saved, { documentId }) => {
      if (saved) client.setQueryData(['record', documentId], saved);
      refresh(group, documentId);
    },
  });
}
