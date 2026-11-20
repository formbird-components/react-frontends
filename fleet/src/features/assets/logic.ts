// What the asset pages work out from a record: progress towards the next service, fuel figures,
// and which of the editable fields a manager changed.

import { serviceRemaining, serviceWarning } from '@/domain/logic/service';
import { toDate } from '@/domain/logic/time';
import { first, type Asset, type FuelReceipt, type LookupValue, type PersonValue, type StatusValue } from '@/domain/types';

export type Warning = 'Overdue' | 'Due Soon' | 'Not Due' | '';

export interface ServiceProgress {
  /** How far through the service interval the asset is: 0 just serviced, 1 due (may exceed 1). */
  fraction: number;
  /** Which measure is furthest along (and so decides when the service falls due). */
  by: 'date' | 'meter';
  warning: Warning;
  /** Meter and days left (negative: overdue). */
  remaining: { meter?: number; days?: number };
}

/**
 * Where an asset stands against its next service: the warning the server derives (worked out
 * again here, from domain/logic/service.ts, so it is current), and how far through the interval it
 * is, by date and by meter, whichever is further.
 * @param asset - The asset (its plan, due date and meter, current meter)
 * @param now - Reference time
 * @returns Progress, or undefined when no service is scheduled
 */
export function serviceProgress(asset: Partial<Asset>, now = Date.now()): ServiceProgress | undefined {
  const plan = first(asset.servicePlanRel);
  const due = toDate(asset.serviceDueDate)?.getTime();
  const dueMeter = num(asset.serviceDueMeterNum);
  const meter = num(asset.meterReadingNum);
  if (due === undefined && dueMeter === undefined) return undefined;

  const warning = serviceWarning({ dueDate: asset.serviceDueDate, dueMeter, meter, now, leadWeeks: num(plan?.leadWeeks), leadMeter: num(plan?.leadMeter) });
  const remaining = serviceRemaining({ dueDate: asset.serviceDueDate, dueMeter, meter, now });

  // The interval started one plan interval before the due point (the schedule doesn't drift), or
  // at the last service when the plan isn't known.
  const fractions: { by: 'date' | 'meter'; value: number }[] = [];
  const weeks = num(plan?.weeks);
  if (due !== undefined) {
    const start = weeks ? due - weeks * 7 * 86_400_000 : toDate(asset.lastServiceDate)?.getTime();
    if (start !== undefined && due > start) fractions.push({ by: 'date', value: (now - start) / (due - start) });
  }
  const interval = num(plan?.meter);
  if (dueMeter !== undefined && meter !== undefined) {
    const start = interval ? dueMeter - interval : num(asset.lastServiceMeterNum);
    if (start !== undefined && dueMeter > start) fractions.push({ by: 'meter', value: (meter - start) / (dueMeter - start) });
  }
  const furthest = fractions.sort((a, b) => b.value - a.value)[0];
  return { fraction: Math.max(0, furthest?.value ?? (warning === 'Overdue' ? 1 : 0)), by: furthest?.by ?? 'date', warning, remaining };
}

function num(value: unknown): number | undefined {
  if (value === null || value === undefined || value === '') return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

/** "6,084 km or 152 days to go", "Overdue by 12 days", in words. */
export function remainingText(progress: ServiceProgress, unit: string | undefined): string {
  const { meter, days } = progress.remaining;
  const u = unit === 'hours' ? 'h' : 'km';
  const parts: string[] = [];
  if (progress.warning === 'Overdue') {
    if (days !== undefined && days < 0) parts.push(`${Math.abs(days).toLocaleString('en-AU')} ${Math.abs(days) === 1 ? 'day' : 'days'}`);
    if (meter !== undefined && meter < 0) parts.push(`${Math.abs(meter).toLocaleString('en-AU')} ${u}`);
    return parts.length ? `Overdue by ${parts.join(' and ')}` : 'Overdue';
  }
  if (meter !== undefined) parts.push(`${meter.toLocaleString('en-AU')} ${u}`);
  if (days !== undefined) parts.push(`${days.toLocaleString('en-AU')} ${days === 1 ? 'day' : 'days'}`);
  return parts.length ? `${parts.join(' or ')} to go` : '';
}

// ------------------------------------------------------------------------------------ fuel

export interface FuelSummary {
  count: number;
  litres: number;
  cost: number;
  /** Average price per litre over the receipts. */
  perLitre?: number;
  /** L/100 km over the fills that have a distance (total litres over total distance). */
  consumption?: number;
}

export function fuelSummary(receipts: FuelReceipt[]): FuelSummary {
  let litres = 0;
  let cost = 0;
  let measuredLitres = 0;
  let distance = 0;
  for (const r of receipts) {
    litres += num(r.litresNum) ?? 0;
    cost += num(r.costNum) ?? 0;
    const d = num(r.distanceNum);
    const c = num(r.consumptionNum);
    if (d && d > 0 && c !== undefined) {
      measuredLitres += num(r.litresNum) ?? 0;
      distance += d;
    }
  }
  return {
    count: receipts.length,
    litres: Math.round(litres * 10) / 10,
    cost: Math.round(cost * 100) / 100,
    perLitre: litres ? Math.round((cost / litres) * 1000) / 1000 : undefined,
    consumption: distance ? Math.round((measuredLitres / distance) * 1000) / 10 : undefined,
  };
}

export interface ConsumptionPoint {
  time: number;
  consumption: number;
  litres: number;
  cost: number;
  ref: string;
}

/** Fills with a consumption figure, oldest first: the consumption chart. */
export function consumptionSeries(receipts: FuelReceipt[]): ConsumptionPoint[] {
  return receipts
    .map((r) => ({ time: toDate(r.fuelDate)?.getTime(), consumption: num(r.consumptionNum), litres: num(r.litresNum) ?? 0, cost: num(r.costNum) ?? 0, ref: r.fuelRef ?? '' }))
    .filter((p): p is ConsumptionPoint => p.time !== undefined && p.consumption !== undefined && p.consumption > 0)
    .sort((a, b) => a.time - b.time);
}

// ------------------------------------------------------------------------------------ editing

/** The fields a manager edits on the asset page. */
export interface AssetEdit {
  assetStatusRel: StatusValue[];
  disposedByRel: LookupValue[];
  allocationStatus: string;
  responsiblePersonRel: PersonValue[];
  locationRel: LookupValue[];
  poolsRel: LookupValue[];
  regDueDate: string | null;
  insuranceDueDate: string | null;
}

export const ALLOCATIONS = ['Permanently Assigned', 'Temporary Allocation', 'Unassigned', 'Hire Store'] as const;

export function editableOf(asset: Asset & { disposedByRel?: LookupValue[] }): AssetEdit {
  return {
    assetStatusRel: asset.assetStatusRel ?? [],
    disposedByRel: asset.disposedByRel ?? [],
    allocationStatus: String(asset.allocationStatus ?? 'Unassigned'),
    responsiblePersonRel: asset.responsiblePersonRel ?? [],
    locationRel: asset.locationRel ?? [],
    poolsRel: asset.poolsRel ?? [],
    regDueDate: asset.regDueDate ?? null,
    insuranceDueDate: asset.insuranceDueDate ?? null,
  };
}

const ids = (list: { documentId: string }[] | null | undefined) => (list ?? []).map((v) => v.documentId).sort().join(',');
const sameInstant = (a: string | null, b: string | null) => (toDate(a)?.getTime() ?? null) === (toDate(b)?.getTime() ?? null);

/** The fields that differ between two edits: what a save sends. */
export function changedFields(before: AssetEdit, after: AssetEdit): Partial<AssetEdit> {
  const changes: Partial<AssetEdit> = {};
  if (ids(before.assetStatusRel) !== ids(after.assetStatusRel)) changes.assetStatusRel = after.assetStatusRel;
  if (ids(before.disposedByRel) !== ids(after.disposedByRel)) changes.disposedByRel = after.disposedByRel;
  if (before.allocationStatus !== after.allocationStatus) changes.allocationStatus = after.allocationStatus;
  if (ids(before.responsiblePersonRel) !== ids(after.responsiblePersonRel)) changes.responsiblePersonRel = after.responsiblePersonRel;
  if (ids(before.locationRel) !== ids(after.locationRel)) changes.locationRel = after.locationRel;
  if (ids(before.poolsRel) !== ids(after.poolsRel)) changes.poolsRel = after.poolsRel;
  if (!sameInstant(before.regDueDate, after.regDueDate)) changes.regDueDate = after.regDueDate;
  if (!sameInstant(before.insuranceDueDate, after.insuranceDueDate)) changes.insuranceDueDate = after.insuranceDueDate;
  return changes;
}

/** Plant has no registration or insurance dates (fleet's rulePlantFields hides them). */
export const isPlant = (asset: Partial<Asset>) => ['Plant', 'Yellow Plant'].includes(String(asset.assetClass ?? first(asset.assetTypeRel)?.assetClass ?? ''));
