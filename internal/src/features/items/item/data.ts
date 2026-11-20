// What the Item page reads besides the item: the items it's related to, its versions, and the
// people and items the Markdown editors suggest for @ and #.

import { useQuery } from '@tanstack/react-query';
import { api } from '@react-frontends/shared/api';
import { useSearch } from '@react-frontends/shared/data';
import { ITEMS, searchPeople } from '@/data/sdms';
import { itemsByIdQuery, linkableItemsQuery, versionsQuery } from '@/domain/queries';
import type { Account, Item } from '@/domain/types';

/** The fields a list of items shows (relationships, suggestions). */
export const ITEM_ROW_FIELDS = ['documentId', 'itemId', 'itemRef', 'summary', 'statusRel', 'assigneeRel', 'reporterRel', 'typeRel', 'systemHeader.summaryName'];

/** The items an item is related to (ruleDisplayRelationships reads them by id). */
export function useRelatedItems(ids: string[]) {
  return useSearch<Item>(ITEMS, ids.length ? itemsByIdQuery(ids) : null, { size: Math.max(ids.length, 1), include: ITEM_ROW_FIELDS });
}

/**
 * Every version of an item, oldest first (ruleLoadVersions). Keyed by the current version, so a
 * save reads them again.
 */
export function useItemVersions(documentId: string, versionId: string | undefined) {
  return useQuery({
    queryKey: ['item-versions', documentId, versionId],
    queryFn: async () => (await api.search<Item>(versionsQuery(documentId), { includeAllVersions: true, size: 200 })).documents,
  });
}

/** SDMS people for an @mention. */
export const suggestPeople = (text: string) => searchPeople([], text, 8);

/** Items for a #link: by number or summary, on your projects (ruleFilterAddItemsRel's list). */
export async function suggestItems(text: string, thisId: string | undefined, account: Account, size = 8): Promise<Item[]> {
  return (await api.search<Item>(linkableItemsQuery(thisId, account, text), { size, include: ITEM_ROW_FIELDS })).documents;
}
