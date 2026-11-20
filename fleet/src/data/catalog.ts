// What rarely changes: template ids by record kind, and lookup values (statuses, types, reasons…)
// by kind, as records store them.

import { useQuery } from '@tanstack/react-query';
import { api } from '@react-frontends/shared/api';
import { fleetQuery } from '@/lib/es';
import { term } from '@react-frontends/shared/es';
import type { LookupKind, RecordKind } from '@/domain/model';
import type { Doc, StatusValue } from '@/domain/types';

const FOREVER = { staleTime: Infinity, gcTime: Infinity } as const;

/** The fleet's templates, by kind (appTags[1]): new records are created with these. */
export function useTemplates() {
  return useQuery({
    queryKey: ['templates'],
    queryFn: async () => {
      const { documents } = await api.search<Doc>(
        { query: { bool: { filter: [term('systemHeader.systemType', 'template'), term('appTags', 'fleet')] } } },
        { size: 200, include: ['documentId', 'appTags', 'name'] },
      );
      return Object.fromEntries(documents.map((t) => [t.appTags?.[1] ?? String(t.name), t.documentId])) as Record<string, string>;
    },
    ...FOREVER,
  });
}

/** A template id, once loaded. */
export function useTemplateId(kind: RecordKind): string | undefined {
  return useTemplates().data?.[kind];
}

export type LookupOption = StatusValue & { [field: string]: unknown };

/**
 * The active values of a lookup kind, in order, as related values ({ documentId, name, color,
 * statusCategory, indexNum } plus any `extra` fields).
 */
export function useLookup(kind: LookupKind | RecordKind, extra: string[] = []) {
  return useQuery({
    queryKey: ['lookup', kind, extra],
    queryFn: async () => {
      const { documents } = await api.search<Doc>(
        fleetQuery(kind, { mustNot: [term('inactiveBool', true)], sort: [{ indexNum: 'asc' }, { 'systemHeader.summaryName': 'asc' }] }),
        { size: 500, include: ['documentId', 'systemHeader.summaryName', 'nameId', 'color', 'statusCategory', 'indexNum', ...extra] },
      );
      return documents.map((d) => {
        const value: LookupOption = { documentId: d.documentId, name: String(d.systemHeader?.summaryName ?? d.nameId ?? '') };
        for (const field of ['color', 'statusCategory', 'indexNum', ...extra]) if (d[field] !== undefined) value[field] = d[field];
        return value;
      });
    },
    ...FOREVER,
  });
}

/** One value of a lookup kind by name (e.g. the "Asset Reserved" status), once loaded. */
export function useLookupValue(kind: LookupKind, name: string): LookupOption | undefined {
  return useLookup(kind).data?.find((v) => v.name === name);
}
