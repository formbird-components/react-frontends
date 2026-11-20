// Reading and saving the fleet's records: the shared hooks, by record kind. A save of a kind
// refreshes searches of that kind; new records get the kind's template and appTags.

import { useCreateDocument, useSearch as useSharedSearch, useUpdateDocument } from '@react-frontends/shared/data';
import type { SearchOptions } from '@react-frontends/shared/api';
import type { RecordKind } from '@/domain/model';
import type { Doc } from '@/domain/types';
import { useTemplates } from './catalog';

export { useRecord, useRefresh } from '@react-frontends/shared/data';

/** A search over records. `kind` names the cache group a save of that kind refreshes. */
export function useSearch<T extends Doc = Doc>(kind: RecordKind | 'any', request: Record<string, unknown> | null, options: SearchOptions = {}, enabled = true) {
  return useSharedSearch<T>(kind, request, options, enabled);
}

/** Creates a record of a kind (the server numbers it and runs its rules). */
export function useCreate<T extends Doc = Doc>(kind: RecordKind) {
  const templateId = useTemplates().data?.[kind];
  return useCreateDocument<T>(templateId, { group: kind, defaults: { appTags: ['fleet', kind] }, missing: `The ${kind} form isn't available on this server.` });
}

/** Changes fields of a record. */
export function useUpdate<T extends Doc = Doc>(kind: RecordKind) {
  return useUpdateDocument<T>(kind);
}
