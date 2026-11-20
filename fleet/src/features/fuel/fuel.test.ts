import { describe, expect, it } from 'vitest';
import type { FuelReceipt } from '@/domain/types';
import { averageConsumption, bucketFor, bucketStart, filterReceipts, flagsOf, fuelSeries, fuelSummary, pricePerLitre } from './fuel';

let n = 0;
const receipt = (extra: Partial<FuelReceipt> = {}): FuelReceipt => {
  n++;
  return {
    documentId: `f${n}`,
    systemHeader: { systemType: 'document', templateId: 't' },
    fuelRef: `FR-${n}`,
    assetRel: [{ documentId: 'a1', name: 'V-201 · Toyota HiAce', assetId: 'V-201' }],
    driverRel: [{ documentId: 'p', name: 'Liam Walsh' }],
    fuelDate: '2026-11-04T01:00:00Z',
    litresNum: 50,
    costNum: 100,
    supplier: 'Ampol Alexandria',
    fuelFlags: [],
    ...extra,
  };
};

describe('fuel receipts', () => {
  it('filter by words, flags and asset', () => {
    const a = receipt();
    const b = receipt({ fuelFlags: ['Tank Capacity Exceeded'], supplier: 'BP Parramatta', assetRel: [{ documentId: 'a2', name: 'U-301 · Toyota HiLux', assetId: 'U-301' }] });
    expect(filterReceipts([a, b], { flaggedOnly: true })).toEqual([b]);
    expect(filterReceipts([a, b], { text: 'hilux bp' })).toEqual([b]);
    expect(filterReceipts([a, b], { text: 'tank' })).toEqual([b]);
    expect(filterReceipts([a, b], { asset: 'a1' })).toEqual([a]);
    expect(flagsOf({ fuelFlags: undefined })).toEqual([]);
  });

  it('add up: spend, litres, price per litre, weighted consumption, flagged', () => {
    const list = [
      receipt({ litresNum: 40, costNum: 80, distanceNum: 500, consumptionNum: 8 }),
      receipt({ litresNum: 60, costNum: 126, distanceNum: 500, consumptionNum: 12 }),
      receipt({ litresNum: 30, costNum: 60, distanceNum: null, consumptionNum: null, fuelFlags: ['Meter Not Increasing'] }),
    ];
    expect(fuelSummary(list)).toEqual({ receipts: 3, spend: 266, litres: 130, pricePerLitre: 2.046, consumption: 10, flagged: 1 });
    expect(averageConsumption([])).toBeUndefined();
    expect(pricePerLitre(0, 10)).toBeUndefined();
    expect(pricePerLitre(201.5, 100)).toBe(2.015);
  });

  it('chart by week (Monday) or month, empty periods included', () => {
    // Wednesday 4 Nov 2026, local time
    const wed = new Date(2026, 10, 4, 15).getTime();
    expect(new Date(bucketStart(wed, 'week')).getDay()).toBe(1);
    expect(new Date(bucketStart(wed, 'month')).getDate()).toBe(1);
    const from = new Date(2026, 9, 20).getTime();
    const to = new Date(2026, 10, 9, 23).getTime();
    const series = fuelSeries([receipt({ fuelDate: new Date(2026, 10, 4, 10).toISOString(), costNum: 90 }), receipt({ fuelDate: new Date(2026, 10, 5, 10).toISOString(), costNum: 10 }), receipt({ fuelDate: new Date(2025, 1, 1).toISOString() })], 'week', from, to);
    // Weeks of 19 Oct, 26 Oct, 2 Nov (both receipts) and 9 Nov
    expect(series.map((p) => p.spend)).toEqual([0, 0, 100, 0]);
    expect(series[2].receipts).toBe(2);
    expect(fuelSeries([receipt({ fuelDate: new Date(2026, 10, 4, 10).toISOString() })], 'day', new Date(2026, 10, 3).getTime(), new Date(2026, 10, 5, 12).getTime()).map((p) => p.spend)).toEqual([0, 100, 0]);
    expect(bucketFor(30)).toBe('day');
    expect(bucketFor(90)).toBe('week');
    expect(bucketFor(365)).toBe('month');
  });
});
