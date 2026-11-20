import { describe, expect, it } from 'vitest';
import { areaCentre, areaLabelPoint, areaOf, areaPoints, boundsOf, clusterPoints, pointOf, pointProperties } from '@/components/map-geo';
import type { Asset, GeoCollection } from '@/domain/types';
import { countBy, mapFiltersActive, matchesMapFilters, parseMapFilters } from './filters';
import { assetMarker, positionLabel, positionSpeed, siteAreas } from './layers';

const point = (lng: number, lat: number, properties: Record<string, unknown> = {}): GeoCollection => ({ type: 'FeatureCollection', features: [{ type: 'Feature', geometry: { type: 'Point', coordinates: [lng, lat] }, properties }] });
const box: GeoCollection = {
  type: 'FeatureCollection',
  features: [{ type: 'Feature', geometry: { type: 'Polygon', coordinates: [[[151.19, -33.91], [151.2, -33.91], [151.2, -33.9], [151.19, -33.9], [151.19, -33.91]]] }, properties: {} }],
};

describe('map geometry', () => {
  it('reads the first point of a collection, and ignores bad ones', () => {
    expect(pointOf(point(151.2, -33.9, { label: 'Near Ryde' }))).toEqual([151.2, -33.9]);
    expect(pointProperties(point(151.2, -33.9, { label: 'Near Ryde' }))).toEqual({ label: 'Near Ryde' });
    expect(pointOf(point(500, -33.9))).toBeUndefined();
    expect(pointOf({ type: 'FeatureCollection', features: [{ type: 'Feature', geometry: null }] })).toBeUndefined();
    expect(pointOf(undefined)).toBeUndefined();
  });

  it('reads polygons, finds their centre, label point and bounds', () => {
    const area = areaOf(box)!;
    expect(area.type).toBe('Polygon');
    const [lng, lat] = areaCentre(area);
    expect(lng).toBeCloseTo(151.195, 6);
    expect(lat).toBeCloseTo(-33.905, 6);
    const [labelLng, labelLat] = areaLabelPoint(area);
    expect(labelLng).toBeCloseTo(151.195, 6);
    expect(labelLat).toBeCloseTo(-33.9, 6);
    expect(boundsOf(areaPoints(area))).toEqual([151.19, -33.91, 151.2, -33.9]);
    expect(boundsOf([])).toBeUndefined();
    expect(areaOf(point(1, 1))).toBeUndefined();
  });

  it('joins several polygons into a MultiPolygon', () => {
    const two: GeoCollection = { type: 'FeatureCollection', features: [...box.features, ...box.features] };
    expect(areaOf(two)?.type).toBe('MultiPolygon');
  });

  it('clusters points that overlap on screen, leaving lone points alone', () => {
    const clusters = clusterPoints(
      [
        { id: 'a', x: 0, y: 0 },
        { id: 'b', x: 10, y: 10 },
        { id: 'c', x: 200, y: 200 },
        { id: 'd', x: 20, y: -15 },
        { id: 'e', x: 230, y: 200 },
        { id: 'f', x: 500, y: 0 },
      ],
      34,
    );
    expect(clusters).toEqual([
      ['a', 'b', 'd'],
      ['c', 'e'],
    ]);
  });
});

const asset = (id: string, o: Partial<Asset> = {}): Asset =>
  ({
    documentId: id,
    systemHeader: { systemType: 'document', templateId: 't' },
    assetId: id.toUpperCase(),
    makeModel: 'Toyota HiAce',
    registration: 'CX45LM',
    iconKind: 'van',
    hireStatusRel: [{ documentId: 'h1', name: 'On Hire', color: '#3e63dd' }],
    assetTypeRel: [{ documentId: 't1', name: 'Panel Van' }],
    locationRel: [{ documentId: 'l1', name: 'Alexandria Depot' }],
    locationGeo: point(151.03, -33.91, { label: 'Near Bankstown', speedKmh: 12 }),
    ...o,
  }) as Asset;

describe('map layers', () => {
  it('makes a marker coloured by hire status, or none without a position', () => {
    expect(assetMarker(asset('v-201'))).toMatchObject({ id: 'v-201', position: [151.03, -33.91], color: '#3e63dd', label: 'V-201', title: 'V-201 · Toyota HiAce · On Hire' });
    expect(assetMarker(asset('v-202', { locationGeo: undefined }))).toBeUndefined();
    expect(positionLabel(asset('v-201'))).toBe('Near Bankstown');
    expect(positionSpeed(asset('v-201'))).toBe(12);
    expect(positionSpeed(asset('v-201', { locationGeo: point(151, -33) }))).toBeUndefined();
  });

  it('makes areas of sites with a boundary', () => {
    const areas = siteAreas([
      { documentId: 's1', name: 'Alexandria Depot', boundaryGeo: box },
      { documentId: 's2', name: 'Head office' },
    ]);
    expect(areas.map((a) => [a.id, a.label, a.geometry.type])).toEqual([['s1', 'Alexandria Depot', 'Polygon']]);
  });
});

describe('map filters', () => {
  const assets = [
    asset('v-201'),
    asset('u-301', { makeModel: 'Toyota HiLux', hireStatusRel: [{ documentId: 'h2', name: 'Available For Hire' }], assetTypeRel: [{ documentId: 't2', name: 'Dual Cab Ute' }] }),
    asset('c-101', { makeModel: 'Corolla', hireStatusRel: [{ documentId: 'h2', name: 'Available For Hire' }], locationRel: [{ documentId: 'l2', name: 'Parramatta Depot' }], locationGeo: point(151, -33.8, { label: 'Parramatta Depot' }) }),
  ];

  it('reads the URL', () => {
    expect(parseMapFilters(new URLSearchParams('q=van&hire=On%20Hire&type=&asset=x'))).toEqual({ q: 'van', hire: 'On Hire', type: undefined, location: undefined });
    expect(mapFiltersActive(parseMapFilters(new URLSearchParams('')))).toBe(false);
    expect(mapFiltersActive(parseMapFilters(new URLSearchParams('location=Parramatta%20Depot')))).toBe(true);
  });

  it('matches every word of the search across ID, model, rego, place and type', () => {
    const f = (q: string) => assets.filter((a) => matchesMapFilters(a, { q })).map((a) => a.assetId);
    expect(f('toyota')).toEqual(['V-201', 'U-301']);
    expect(f('bankstown hiace')).toEqual(['V-201']);
    expect(f('parramatta')).toEqual(['C-101']);
    expect(f('dual cab')).toEqual(['U-301']);
    expect(f('nothing')).toEqual([]);
  });

  it('counts each value among the assets the other filters leave', () => {
    const counts = countBy(assets, { q: '', location: 'Alexandria Depot', hire: 'On Hire' }, 'hire');
    expect(Object.fromEntries(counts)).toEqual({ 'On Hire': 1, 'Available For Hire': 1 });
    expect(Object.fromEntries(countBy(assets, { q: 'toyota' }, 'type'))).toEqual({ 'Panel Van': 1, 'Dual Cab Ute': 1 });
  });
});
