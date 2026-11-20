// What the fleet's maps show: assets at their last known position, coloured by hire status, and the
// sites' boundaries. Used by the fleet map, the overview and the asset page.

import { assetIcon } from '@/components/asset-icon';
import { areaOf, pointOf } from '@/components/map-geo';
import type { MapArea, MapMarker } from '@/components/map-view';
import { useLookup, type LookupOption } from '@/data/catalog';
import { useSearch } from '@/data/records';
import { first, type Asset, type GeoCollection } from '@/domain/types';
import { fleetQuery } from '@/lib/es';
import { term } from '@react-frontends/shared/es';

/** The fields a map needs of an asset (marker, popup, list row, filters). */
export const MAP_ASSET_FIELDS = [
  'documentId', 'systemHeader.summaryName', 'assetId', 'makeModel', 'registration', 'iconKind', 'yearNum', 'hireStatusRel', 'assetStatusRel', 'locationRel',
  'assetTypeRel.documentId', 'assetTypeRel.name', 'meterReadingNum', 'meterReadingDate', 'primaryMeterUnit', 'locationGeo', 'lastPositionDate', 'serviceWarning', 'bookableBool',
];

/** Assets shown on maps (fleet's asset map layer): included in the map, not disposed. */
export const MAP_ASSETS_REQUEST = fleetQuery('asset', {
  filter: [term('includeInMapBool', true)],
  mustNot: [term('assetStatusRel.name', 'Disposed')],
  sort: [{ 'assetId.lcase': 'asc' }],
});

export function useMapAssets() {
  return useSearch<Asset>('asset', MAP_ASSETS_REQUEST, { size: 1000, include: MAP_ASSET_FIELDS });
}

export type Site = LookupOption & { boundaryGeo?: GeoCollection; addressGeo?: GeoCollection; locationType?: string; code?: string };

/** Depots, workshops and offices, with their boundaries. */
export function useSites() {
  const query = useLookup('location', ['boundaryGeo', 'addressGeo', 'locationType', 'code']);
  return { ...query, data: query.data as Site[] | undefined };
}

/** The colour of an asset's hire status (grey when it has none). */
export const hireColor = (asset: Pick<Asset, 'hireStatusRel'>) => first(asset.hireStatusRel)?.color ?? '#8b8d98';

/** An asset as a map marker, or undefined without a position. */
export function assetMarker(asset: Asset): MapMarker | undefined {
  const position = pointOf(asset.locationGeo);
  if (!position) return undefined;
  return {
    id: asset.documentId,
    position,
    color: hireColor(asset),
    icon: assetIcon(asset.iconKind),
    label: asset.assetId,
    title: [asset.assetId, asset.makeModel, first(asset.hireStatusRel)?.name].filter(Boolean).join(' · '),
  };
}

/** Sites as map areas (those with a boundary). */
export function siteAreas(sites: Site[] | undefined): MapArea[] {
  const areas: MapArea[] = [];
  for (const site of sites ?? []) {
    const geometry = areaOf(site.boundaryGeo);
    if (geometry) areas.push({ id: site.documentId, geometry, label: site.name });
  }
  return areas;
}

/** Where an asset was last seen, in words ("Near Bankstown"), from its position's label. */
export function positionLabel(asset: Pick<Asset, 'locationGeo'>): string {
  const props = asset.locationGeo?.features?.find((f) => f?.geometry?.type === 'Point')?.properties ?? {};
  return typeof props.label === 'string' ? props.label : '';
}

/** Speed at the last position (telematics), if known. */
export function positionSpeed(asset: Pick<Asset, 'locationGeo'>): number | undefined {
  const props = asset.locationGeo?.features?.find((f) => f?.geometry?.type === 'Point')?.properties ?? {};
  const speed = Number(props.speedKmh);
  return Number.isFinite(speed) && props.speedKmh !== null && props.speedKmh !== undefined ? speed : undefined;
}
