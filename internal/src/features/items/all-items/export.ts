// Exporting the current results: fetched a page at a time (up to EXPORT_LIMIT), then saved as CSV.

import { api, type SearchOptions, type SearchResult } from '@react-frontends/shared/api';
import type { EsRequest } from '@/domain/queries';
import type { Item } from '@/domain/types';

export const EXPORT_LIMIT = 5000;
export const EXPORT_PAGE = 500;

type Search = (request: Record<string, unknown>, options: SearchOptions) => Promise<SearchResult<Item>>;

/** Every result of a search, up to `limit`, a page at a time; `onProgress` hears how many so far. */
export async function fetchAll(
  request: EsRequest,
  include: string[],
  o: { limit?: number; pageSize?: number; onProgress?: (loaded: number, total: number) => void; search?: Search } = {},
): Promise<{ items: Item[]; total: number }> {
  const limit = o.limit ?? EXPORT_LIMIT;
  const size = o.pageSize ?? EXPORT_PAGE;
  const search: Search = o.search ?? ((r, options) => api.search<Item>(r, options));
  const items: Item[] = [];
  let total = 0;
  for (let page = 0; ; page++) {
    const result = await search(request, { size, page, include, trackTotal: true });
    total = result.total;
    items.push(...result.documents);
    o.onProgress?.(Math.min(items.length, limit), Math.min(total, limit));
    if (!result.documents.length || items.length >= Math.min(total, limit)) break;
  }
  return { items: items.slice(0, limit), total };
}

/** Saves text as a file in the browser's downloads. */
export function download(text: string, fileName: string, type = 'text/csv;charset=utf-8') {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
