// What the fuel pages read.

import { useMemo } from 'react';
import { useSearch } from '@/data/records';
import type { FuelReceipt } from '@/domain/types';
import { exists, range, term } from '@react-frontends/shared/es';
import { fleetQuery } from '@/lib/es';

export const FUEL_FIELDS = [
  'documentId', 'systemHeader.createdDate', 'fuelRef', 'assetRel', 'driverRel', 'fuelDate', 'meterReadingNum', 'litresNum', 'costNum', 'fuelTypeRel', 'supplier',
  'fuelFlags', 'distanceNum', 'consumptionNum',
];

/** Receipts of the last `days` days, newest first. */
export function useReceipts(days: number) {
  const request = useMemo(() => fleetQuery('fuelReceipt', { filter: [range('fuelDate', { gte: `now-${days}d/d` })], sort: [{ fuelDate: 'desc' }] }), [days]);
  return useSearch<FuelReceipt>('fuelReceipt', request, { size: 1000, include: FUEL_FIELDS });
}

/** The fill before a time on an asset (what the server checks a receipt against). */
export function usePreviousFill(assetId: string | undefined, before: string | undefined) {
  const request = useMemo(
    () => (assetId && before ? fleetQuery('fuelReceipt', { filter: [term('assetRel.documentId', assetId), range('fuelDate', { lt: before }), exists('meterReadingNum')], sort: [{ fuelDate: 'desc' }] }) : null),
    [assetId, before],
  );
  return useSearch<FuelReceipt>('fuelReceipt', request, { size: 1, include: FUEL_FIELDS });
}

/** Suppliers on recent receipts, most used first (suggestions for the supplier box). */
export function useSuppliers() {
  const request = useMemo(() => fleetQuery('fuelReceipt', { filter: [exists('supplier')], sort: [{ fuelDate: 'desc' }] }), []);
  const { data } = useSearch<FuelReceipt>('fuelReceipt', request, { size: 200, include: ['supplier'] });
  return useMemo(() => {
    const counts = new Map<string, number>();
    for (const r of data?.documents ?? []) if (r.supplier) counts.set(r.supplier, (counts.get(r.supplier) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([s]) => s);
  }, [data]);
}
