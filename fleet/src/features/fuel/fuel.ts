// Fuel receipts: filtering, what they add up to, and spend and consumption over time.

import { first, nameOf, type FuelReceipt } from '@/domain/types';
import { startOfDay, toDate } from '@/domain/logic/time';

export const FLAG_HELP: Record<string, string> = {
  'Tank Capacity Exceeded': 'More litres than the asset’s tank holds.',
  'Expected Range Exceeded': 'Further since the last fill than a tank should go.',
  'Meter Not Increasing': 'The meter isn’t above the last fill’s.',
};

export interface FuelFilters {
  text?: string;
  flaggedOnly?: boolean;
  /** An asset's documentId. */
  asset?: string;
}

export const flagsOf = (r: Pick<FuelReceipt, 'fuelFlags'>) => (Array.isArray(r.fuelFlags) ? r.fuelFlags.filter(Boolean) : []);

export function filterReceipts(list: FuelReceipt[], f: FuelFilters): FuelReceipt[] {
  const words = (f.text ?? '').toLowerCase().split(/\s+/).filter(Boolean);
  return list.filter((r) => {
    if (f.flaggedOnly && !flagsOf(r).length) return false;
    if (f.asset && first(r.assetRel)?.documentId !== f.asset) return false;
    if (words.length) {
      const text = [r.fuelRef, first(r.assetRel)?.name, nameOf(r.driverRel), r.supplier, nameOf(r.fuelTypeRel), ...flagsOf(r)].filter(Boolean).join(' ').toLowerCase();
      if (!words.every((w) => text.includes(w))) return false;
    }
    return true;
  });
}

const round = (value: number, digits = 2) => Math.round(value * 10 ** digits) / 10 ** digits;

/** Price per litre, or undefined. */
export const pricePerLitre = (cost: unknown, litres: unknown) => {
  const c = Number(cost);
  const l = Number(litres);
  return c > 0 && l > 0 ? round(c / l, 3) : undefined;
};

/**
 * Consumption across receipts, weighted: litres over distance of the receipts that have both (a
 * receipt's litres refill what was used since the previous fill).
 */
export function averageConsumption(list: Pick<FuelReceipt, 'litresNum' | 'distanceNum' | 'consumptionNum'>[]): number | undefined {
  let litres = 0;
  let distance = 0;
  for (const r of list) {
    const d = Number(r.distanceNum);
    const l = Number(r.litresNum);
    if (r.consumptionNum === null || r.consumptionNum === undefined || !(d > 0) || !(l > 0)) continue;
    litres += l;
    distance += d;
  }
  return distance ? round((litres / distance) * 100, 1) : undefined;
}

export interface FuelSummary {
  receipts: number;
  spend: number;
  litres: number;
  pricePerLitre?: number;
  consumption?: number;
  flagged: number;
}

export function fuelSummary(list: FuelReceipt[]): FuelSummary {
  const spend = round(list.reduce((sum, r) => sum + (Number(r.costNum) || 0), 0));
  const litres = round(list.reduce((sum, r) => sum + (Number(r.litresNum) || 0), 0), 1);
  return { receipts: list.length, spend, litres, pricePerLitre: pricePerLitre(spend, litres), consumption: averageConsumption(list), flagged: list.filter((r) => flagsOf(r).length).length };
}

export type Bucket = 'day' | 'week' | 'month';

/** The start of the day, week (Monday) or month a time falls in, local time. */
export function bucketStart(time: number, bucket: Bucket): number {
  const d = new Date(startOfDay(time));
  if (bucket === 'month') d.setDate(1);
  else if (bucket === 'week') d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d.getTime();
}

const nextBucket = (time: number, bucket: Bucket) => {
  const d = new Date(time);
  if (bucket === 'month') d.setMonth(d.getMonth() + 1);
  else d.setDate(d.getDate() + (bucket === 'week' ? 7 : 1));
  return d.getTime();
};

export interface SeriesPoint {
  start: number;
  label: string;
  spend: number;
  litres: number;
  consumption?: number;
  receipts: number;
}

/** Spend, litres and consumption per week or month from `from` to `to`, empty periods included. */
export function fuelSeries(list: FuelReceipt[], bucket: Bucket, from: number, to: number): SeriesPoint[] {
  const points = new Map<number, FuelReceipt[]>();
  for (let t = bucketStart(from, bucket); t <= to; t = nextBucket(t, bucket)) points.set(t, []);
  for (const r of list) {
    const at = toDate(r.fuelDate)?.getTime();
    if (at === undefined || at < from || at > to) continue;
    points.get(bucketStart(at, bucket))?.push(r);
  }
  return [...points.entries()].map(([start, receipts]) => {
    const s = fuelSummary(receipts);
    const date = new Date(start);
    return {
      start,
      label: bucket === 'month' ? date.toLocaleDateString('en-AU', { month: 'short', year: '2-digit' }) : date.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' }),
      spend: s.spend,
      litres: s.litres,
      consumption: s.consumption,
      receipts: receipts.length,
    };
  });
}

/** Days for a month, weeks for a quarter, months for longer. */
export const bucketFor = (days: number): Bucket => (days > 120 ? 'month' : days > 31 ? 'week' : 'day');

export const BUCKET_NAMES: Record<Bucket, string> = { day: 'day', week: 'week', month: 'month' };
