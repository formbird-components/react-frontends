// SDMS in the shared app shell: its brand, pages and New menu, and what ⌘K finds: items by number
// (an exact match first) or by words in their summary.

import { api } from '@react-frontends/shared/api';
import { AppShell, type PaletteSearch } from '@react-frontends/shared/shell';
import { ItemStatus, itemPath, TypeIcon } from '@/components/item-bits';
import type { Item } from '@/domain/types';
import { BRAND } from './brand';
import { NAV, NEW_ITEMS } from './nav';
import { exactNumberQuery, mergeResults, PALETTE_FIELDS, PALETTE_SIZE, paletteTextQuery, typedNumber } from './palette';

/** ⌘K: up to 8 items, the one with the number typed first (a search that fails shows nothing). */
const search: PaletteSearch = async (text) => {
  const number = typedNumber(text);
  const [exact, others] = await Promise.all([
    number ? api.search<Item>(exactNumberQuery(number), { size: 2, include: PALETTE_FIELDS }).catch(() => undefined) : undefined,
    api.search<Item>(paletteTextQuery(text), { size: PALETTE_SIZE, include: PALETTE_FIELDS }).catch(() => undefined),
  ]);
  const items = mergeResults(exact?.documents ?? [], others?.documents ?? []);
  return [
    {
      heading: 'Items',
      items: items.map((item) => ({
        id: `item-${item.documentId}`,
        to: itemPath(item),
        icon: <TypeIcon name={item.typeRel?.[0]?.name} />,
        // On a phone the status goes under the summary, so the summary keeps the width.
        label: (
          <span className="min-w-0 flex-1">
            <span className="block truncate">
              <span className="mr-2 font-mono text-xs text-muted-foreground tabular-nums">{item.itemId || item.itemRef}</span>
              {item.summary || item.systemHeader?.summaryName || '(no summary)'}
            </span>
            <ItemStatus value={item.statusRel} className="mt-0.5 text-xs sm:hidden" />
          </span>
        ),
        trailing: <ItemStatus value={item.statusRel} className="text-xs max-sm:hidden" />,
      })),
    },
  ];
};

export function InternalShell() {
  return (
    <AppShell
      brand={BRAND}
      nav={NAV}
      newItems={NEW_ITEMS}
      search={search}
      searchPlaceholder="Search items or go to…"
      searchHint=" items…"
      searchDescription="Go to a page, or find an item by its number or summary"
      sidebarFooter={
        <>
          Data from <span className="font-medium text-foreground">fieldtec-web</span> <span className="whitespace-nowrap">(internal-5)</span>. Saves run its rules.
        </>
      }
    />
  );
}
