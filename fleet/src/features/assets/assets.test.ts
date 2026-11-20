import { describe, expect, it } from 'vitest';
import type { Asset, FuelReceipt } from '@/domain/types';
import { activeFilterCount, assetsLink, assetsRequest, clearedFilters, endOfDayIn, filtersToParams, parseFilters } from './filters';
import { changedFields, consumptionSeries, editableOf, fuelSummary, isPlant, remainingText, serviceProgress } from './logic';

const DAY = 86_400_000;

describe('asset register filters', () => {
  it('reads filters from the query string and ignores unknown values', () => {
    const f = parseFilters(new URLSearchParams('hire=On%20Hire&service=due&rego=30&sort=-meter&view=grid&lifecycle=&bogus=1'));
    expect(f).toMatchObject({ q: '', hire: 'On Hire', service: 'due', rego: 30, sort: 'meter', desc: true, view: 'grid', lifecycle: undefined });
    expect(parseFilters(new URLSearchParams('service=later&rego=-3&sort=colour&view=list'))).toMatchObject({ service: undefined, rego: undefined, sort: 'id', desc: false, view: undefined });
  });

  it('round-trips through the query string, leaving defaults out', () => {
    const f = parseFilters(new URLSearchParams('q=hilux&type=Dual%20Cab%20Ute&location=Alexandria%20Depot&insurance=14&sort=rego'));
    expect(parseFilters(filtersToParams(f))).toEqual(f);
    expect(filtersToParams(parseFilters(new URLSearchParams(''))).toString()).toBe('');
  });

  it('counts and clears the filters, keeping sort and view', () => {
    const f = parseFilters(new URLSearchParams('q=van&hire=On%20Hire&rego=30&sort=-meter&view=grid'));
    expect(activeFilterCount(f)).toBe(3);
    expect(clearedFilters(f)).toEqual({ q: '', sort: 'meter', desc: true, view: 'grid' });
    expect(activeFilterCount(clearedFilters(f))).toBe(0);
  });

  it('builds the search: filters, text, disposed assets left out, sort with a tiebreak', () => {
    const now = new Date(2026, 10, 10, 9, 30).getTime();
    const request = assetsRequest(parseFilters(new URLSearchParams('q=V-2&hire=On%20Hire&service=due&rego=30&sort=-meter')), now) as {
      sort: unknown[];
      query: { bool: { filter: unknown[]; must_not: unknown[] } };
    };
    const json = JSON.stringify(request.query.bool.filter);
    expect(json).toContain('{"term":{"appTags":"asset"}}');
    expect(json).toContain('{"term":{"hireStatusRel.name":"On Hire"}}');
    expect(json).toContain('{"terms":{"serviceWarning":["Due Soon","Overdue"]}}');
    expect(json).toContain(`{"range":{"regDueDate":{"lte":"${endOfDayIn(30, now)}"}}}`);
    expect(json).toContain('"assetId.lcase":{"value":"*v-2*","case_insensitive":true}');
    expect(request.query.bool.must_not).toEqual([{ term: { 'assetStatusRel.name': 'Disposed' } }]);
    expect(request.sort).toEqual([{ meterReadingNum: { order: 'desc', missing: '_last' } }, { 'assetId.lcase': { order: 'asc' } }]);
  });

  it('shows disposed assets when a lifecycle is chosen', () => {
    const request = assetsRequest(parseFilters(new URLSearchParams('lifecycle=Disposed'))) as { query: { bool: { must_not?: unknown[] } } };
    expect(request.query.bool.must_not).toBeUndefined();
  });

  it('ends "due within n days" at the end of that local day', () => {
    const now = new Date(2026, 10, 10, 9, 30).getTime();
    const end = new Date(endOfDayIn(30, now));
    expect([end.getFullYear(), end.getMonth(), end.getDate(), end.getHours(), end.getMinutes()]).toEqual([2026, 11, 10, 23, 59]);
  });

  it('links to a filtered register', () => {
    expect(assetsLink({ hire: 'Available For Hire', lifecycle: 'Active' })).toBe('/assets?hire=Available+For+Hire&lifecycle=Active');
    expect(assetsLink({})).toBe('/assets');
  });
});

describe('service progress', () => {
  const plan = { documentId: 'p', name: 'Light Vehicle Service', weeks: 26, meter: 10000, leadWeeks: 4, leadMeter: 1000 };
  const now = new Date(2026, 10, 10).getTime();

  it('measures the interval by date and by meter, whichever is further along', () => {
    const asset: Partial<Asset> = { servicePlanRel: [plan], serviceDueDate: new Date(now + 91 * DAY).toISOString(), serviceDueMeterNum: 44_000, meterReadingNum: 41_500 };
    const p = serviceProgress(asset, now)!;
    expect(p.by).toBe('meter');
    expect(p.fraction).toBeCloseTo(0.75, 5);
    expect(p.warning).toBe('Not Due');
    expect(p.remaining).toEqual({ meter: 2500, days: 91 });
    expect(remainingText(p, 'km')).toBe('2,500 km or 91 days to go');
  });

  it('warns when due soon and when overdue (domain serviceWarning)', () => {
    const soon = serviceProgress({ servicePlanRel: [plan], serviceDueDate: new Date(now + 10 * DAY).toISOString(), serviceDueMeterNum: 50_000, meterReadingNum: 41_000 }, now)!;
    expect(soon.warning).toBe('Due Soon');
    expect(soon.by).toBe('date');
    const overdue = serviceProgress({ servicePlanRel: [plan], serviceDueDate: new Date(now - 12 * DAY).toISOString(), serviceDueMeterNum: 40_000, meterReadingNum: 40_400 }, now)!;
    expect(overdue.warning).toBe('Overdue');
    expect(overdue.fraction).toBeGreaterThan(1);
    expect(remainingText(overdue, 'km')).toBe('Overdue by 12 days and 400 km');
  });

  it('falls back to the last service without a plan, and is undefined with nothing scheduled', () => {
    const p = serviceProgress({ lastServiceDate: new Date(now - 30 * DAY).toISOString(), serviceDueDate: new Date(now + 30 * DAY).toISOString() }, now)!;
    expect(p.fraction).toBeCloseTo(0.5, 5);
    expect(serviceProgress({ meterReadingNum: 100 }, now)).toBeUndefined();
  });
});

describe('fuel figures', () => {
  const receipts = [
    { fuelRef: 'FR-2', fuelDate: '2026-10-20T06:00:00Z', litresNum: 40, costNum: 80, distanceNum: 500, consumptionNum: 8 },
    { fuelRef: 'FR-1', fuelDate: '2026-10-10T06:00:00Z', litresNum: 50, costNum: 95, distanceNum: null, consumptionNum: null },
    { fuelRef: 'FR-3', fuelDate: '2026-10-30T06:00:00Z', litresNum: 30, costNum: 63, distanceNum: 300, consumptionNum: 10 },
  ] as unknown as FuelReceipt[];

  it('sums litres and cost, and averages consumption over measured fills', () => {
    expect(fuelSummary(receipts)).toEqual({ count: 3, litres: 120, cost: 238, perLitre: 1.983, consumption: 8.8 });
    expect(fuelSummary([])).toEqual({ count: 0, litres: 0, cost: 0, perLitre: undefined, consumption: undefined });
  });

  it('charts fills with a consumption, oldest first', () => {
    expect(consumptionSeries(receipts).map((p) => [p.ref, p.consumption])).toEqual([
      ['FR-2', 8],
      ['FR-3', 10],
    ]);
  });
});

describe('asset edits', () => {
  const asset = {
    documentId: 'a',
    systemHeader: { systemType: 'document', templateId: 't' },
    assetId: 'V-201',
    assetStatusRel: [{ documentId: 's1', name: 'Active' }],
    allocationStatus: 'Unassigned',
    locationRel: [{ documentId: 'l1', name: 'Alexandria Depot' }],
    poolsRel: [{ documentId: 'p1', name: 'Field' }, { documentId: 'p2', name: 'Plant' }],
    regDueDate: '2027-08-27T14:00:00.000Z',
  } as Asset;

  it('sends only what changed', () => {
    const before = editableOf(asset);
    expect(changedFields(before, { ...before, poolsRel: [...before.poolsRel].reverse() })).toEqual({});
    expect(changedFields(before, { ...before, regDueDate: '2027-08-28T00:00:00.000+10:00' })).toEqual({});
    const after = { ...before, locationRel: [{ documentId: 'l2', name: 'Parramatta Depot' }], insuranceDueDate: '2027-01-01T00:00:00.000Z', allocationStatus: 'Hire Store' };
    expect(changedFields(before, after)).toEqual({ locationRel: after.locationRel, insuranceDueDate: after.insuranceDueDate, allocationStatus: 'Hire Store' });
  });

  it('knows plant from its class', () => {
    expect(isPlant({ assetClass: 'Yellow Plant' })).toBe(true);
    expect(isPlant({ assetTypeRel: [{ documentId: 't', name: 'Forklift', assetClass: 'Plant' }] })).toBe(true);
    expect(isPlant({ assetClass: 'Light Vehicle' })).toBe(false);
  });
});
