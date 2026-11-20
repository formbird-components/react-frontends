// GeoJSON as records store it (FeatureCollections in …Geo fields): points, polygons, their centres
// and bounds, for the map. Pure functions (no MapLibre), so pages and tests can use them.

import type { GeoCollection } from '@/domain/types';

export type LngLat = [number, number];
/** A polygon's rings: the outer ring first, then holes. */
export type Ring = LngLat[];
export interface AreaGeometry {
  type: 'Polygon' | 'MultiPolygon';
  coordinates: Ring[] | Ring[][];
}
/** West, south, east, north. */
export type Bounds = [number, number, number, number];

const isLngLat = (value: unknown): value is LngLat =>
  Array.isArray(value) && value.length >= 2 && Number.isFinite(value[0]) && Number.isFinite(value[1]) && Math.abs(value[0] as number) <= 180 && Math.abs(value[1] as number) <= 90;

/** The first point of a FeatureCollection (an asset's last position, a site's address), or undefined. */
export function pointOf(geo: GeoCollection | null | undefined): LngLat | undefined {
  for (const feature of geo?.features ?? []) {
    const geometry = feature?.geometry;
    if (geometry?.type === 'Point' && isLngLat(geometry.coordinates)) return [geometry.coordinates[0], geometry.coordinates[1]];
  }
  return undefined;
}

/** The properties of the first point feature (label, speed, recordedDate…), or {}. */
export function pointProperties(geo: GeoCollection | null | undefined): Record<string, unknown> {
  const feature = geo?.features?.find((f) => f?.geometry?.type === 'Point');
  return feature?.properties ?? {};
}

/** The polygons of a FeatureCollection, as one geometry (a site's boundary), or undefined. */
export function areaOf(geo: GeoCollection | null | undefined): AreaGeometry | undefined {
  const polygons: Ring[][] = [];
  for (const feature of geo?.features ?? []) {
    const geometry = feature?.geometry;
    if (geometry?.type === 'Polygon' && Array.isArray(geometry.coordinates)) polygons.push(geometry.coordinates as Ring[]);
    if (geometry?.type === 'MultiPolygon' && Array.isArray(geometry.coordinates)) polygons.push(...(geometry.coordinates as Ring[][]));
  }
  const valid = polygons.filter((rings) => Array.isArray(rings[0]) && rings[0].length >= 3 && rings[0].every(isLngLat));
  if (!valid.length) return undefined;
  return valid.length === 1 ? { type: 'Polygon', coordinates: valid[0] } : { type: 'MultiPolygon', coordinates: valid };
}

/** Every outer ring of an area. */
const outerRings = (area: AreaGeometry): Ring[] => (area.type === 'Polygon' ? [(area.coordinates as Ring[])[0]] : (area.coordinates as Ring[][]).map((rings) => rings[0]));

/**
 * Where to put an area's label: the centre of its largest outer ring (the vertex average, which is
 * inside for the convex site boundaries records hold).
 */
export function areaCentre(area: AreaGeometry): LngLat {
  const rings = outerRings(area);
  let ring = rings[0];
  let largest = -1;
  for (const r of rings) {
    const [w, s, e, n] = boundsOf(r)!;
    const size = (e - w) * (n - s);
    if (size > largest) {
      largest = size;
      ring = r;
    }
  }
  // A closed ring repeats its first vertex at the end: count it once.
  const closed = ring.length > 1 && ring[0][0] === ring[ring.length - 1][0] && ring[0][1] === ring[ring.length - 1][1];
  const vertices = closed ? ring.slice(0, -1) : ring;
  const sum = vertices.reduce<LngLat>((acc, [lng, lat]) => [acc[0] + lng, acc[1] + lat], [0, 0]);
  return [sum[0] / vertices.length, sum[1] / vertices.length];
}

/** Where an area's label sits: on top of it, at the middle of its northern edge (a tab). */
export function areaLabelPoint(area: AreaGeometry): LngLat {
  const [w, , e, n] = boundsOf(areaPoints(area))!;
  return [(w + e) / 2, n];
}

/** The bounds of some points, or undefined when there are none. */
export function boundsOf(points: LngLat[]): Bounds | undefined {
  if (!points.length) return undefined;
  let [w, s, e, n] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const [lng, lat] of points) {
    w = Math.min(w, lng);
    s = Math.min(s, lat);
    e = Math.max(e, lng);
    n = Math.max(n, lat);
  }
  return [w, s, e, n];
}

/** Every vertex of an area's outer rings (for fitting the map to it). */
export const areaPoints = (area: AreaGeometry): LngLat[] => outerRings(area).flat();

/** A point on screen, in pixels. */
export interface ScreenPoint {
  id: string;
  x: number;
  y: number;
}

/**
 * Groups points that sit within `radius` pixels of a group's first point (greedy, in the order
 * given), so overlapping markers show as one cluster. Groups of one are left out.
 * @param points - Projected marker positions
 * @param radius - Pixels
 * @returns The ids of each cluster (two or more points)
 */
export function clusterPoints(points: ScreenPoint[], radius: number): string[][] {
  const used = new Set<string>();
  const clusters: string[][] = [];
  const r2 = radius * radius;
  for (const p of points) {
    if (used.has(p.id)) continue;
    const members = [p.id];
    for (const q of points) {
      if (q.id === p.id || used.has(q.id)) continue;
      const dx = q.x - p.x;
      const dy = q.y - p.y;
      if (dx * dx + dy * dy <= r2) members.push(q.id);
    }
    if (members.length > 1) {
      for (const id of members) used.add(id);
      clusters.push(members);
    }
  }
  return clusters;
}
