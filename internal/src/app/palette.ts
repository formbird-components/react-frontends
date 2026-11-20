// What ⌘K finds: items by number (an exact itemRef / itemId first) or by text in their summary
// and number. Pure requests; the shell runs them.

import { term } from '@react-frontends/shared/es';
import { bool, itemsQuery, sdms, textSearch, type EsRequest } from '@/domain/queries';
import type { Item } from '@/domain/types';

/** How many items the palette lists. */
export const PALETTE_SIZE = 8;
/** Fields a result shows. */
export const PALETTE_FIELDS = ['documentId', 'itemId', 'itemRef', 'summary', 'systemHeader.summaryName', 'typeRel', 'statusRel'];

/** A number typed as "31492", "0031492" or "#31492" (null for other text). */
export function typedNumber(text: string): string | null {
  const m = /^#?\s*(\d+)$/.exec(text.trim());
  return m ? m[1] : null;
}

/** The item with exactly this number (itemRef without zeros, or the padded itemId). */
export function exactNumberQuery(number: string): EsRequest {
  return {
    query: bool({
      filter: sdms('item'),
      should: [term('itemRef', number.replace(/^0+(?=\d)/, '')), term('itemId', number), term('itemId', number.padStart(7, '0'))],
    }),
  };
}

/** Items whose summary or number contains the text, latest change first. */
export const paletteTextQuery = (text: string): EsRequest =>
  itemsQuery({ must: [textSearch(text.replace(/^#/, ''), [['systemHeader.summaryName.lcase', 1], ['itemId', 1]])] });

/** The exact match first, then the others, without repeats, up to `size`. */
export function mergeResults(exact: Item[], others: Item[], size = PALETTE_SIZE): Item[] {
  const seen = new Set<string>();
  const out: Item[] = [];
  for (const item of [...exact, ...others]) {
    if (seen.has(item.documentId)) continue;
    seen.add(item.documentId);
    out.push(item);
    if (out.length === size) break;
  }
  return out;
}
