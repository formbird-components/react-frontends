// The fleet map's filters (in the URL: ?q=&hire=&type=&location=&asset=). The map loads every mapped
// asset, so filtering happens here, as you type.

import { first, nameOf, type Asset } from '@/domain/types';
import { positionLabel } from './layers';

export interface MapFilters {
  q: string;
  hire?: string;
  type?: string;
  location?: string;
}

const text = (value: string | null) => (value && value.trim() ? value.trim() : undefined);

export function parseMapFilters(params: URLSearchParams): MapFilters {
  return { q: params.get('q') ?? '', hire: text(params.get('hire')), type: text(params.get('type')), location: text(params.get('location')) };
}

/** Whether an asset passes the filters, leaving one out (to count what choosing it would show). */
export function matchesMapFilters(asset: Asset, f: MapFilters, ignore?: keyof MapFilters): boolean {
  if (ignore !== 'hire' && f.hire && nameOf(asset.hireStatusRel) !== f.hire) return false;
  if (ignore !== 'type' && f.type && first(asset.assetTypeRel)?.name !== f.type) return false;
  if (ignore !== 'location' && f.location && nameOf(asset.locationRel) !== f.location) return false;
  const q = ignore === 'q' ? '' : f.q.trim().toLowerCase();
  if (q) {
    const haystack = [asset.assetId, asset.makeModel, asset.registration, nameOf(asset.locationRel), positionLabel(asset), first(asset.assetTypeRel)?.name].filter(Boolean).join(' ').toLowerCase();
    if (!q.split(/\s+/).every((word) => haystack.includes(word))) return false;
  }
  return true;
}

/** How many assets have each value of a field, among those passing the other filters. */
export function countBy(assets: Asset[], f: MapFilters, field: 'hire' | 'type' | 'location'): Map<string, number> {
  const counts = new Map<string, number>();
  for (const a of assets) {
    if (!matchesMapFilters(a, f, field)) continue;
    const value = field === 'hire' ? nameOf(a.hireStatusRel) : field === 'type' ? (first(a.assetTypeRel)?.name ?? '') : nameOf(a.locationRel);
    if (value) counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return counts;
}

export const mapFiltersActive = (f: MapFilters) => !!(f.q.trim() || f.hire || f.type || f.location);
