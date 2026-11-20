import { describe, expect, it } from 'vitest';
import type { Asset } from '@/domain/types';
import { assetProblem, bookerProblem, checkPeriod, licenceCovers, pickerBlock } from './availability';
import type { Item } from './model';

const H = 3_600_000;
const now = new Date(2026, 10, 10, 12).getTime();

const item = (o: Partial<Item>): Item => ({
  id: 'x',
  kind: 'booking',
  assetDocId: 'doc-V-201',
  start: now,
  end: now + H,
  drawEnd: now + H,
  until: now + H,
  ref: 'BK-1',
  status: 'Asset Reserved',
  person: 'Tom Nguyen',
  overdue: false,
  active: true,
  ...o,
});

describe('clashes for a period', () => {
  const items = [
    item({ id: 'b1', ref: 'BK-1', start: now + 2 * H, end: now + 4 * H, until: now + 4 * H }),
    item({ id: 'w1', kind: 'block', ref: 'REQ-8', status: 'In Progress', start: now + 3 * H, end: now + 30 * H, until: now + 30 * H }),
    item({ id: 'c1', ref: 'BK-0', status: 'Closed', active: false, start: now - 4 * H, end: now - 2 * H, until: now - 2 * H }),
  ];

  it('is free around other bookings (touching ends are fine)', () => {
    expect(checkPeriod(items, now, now + 2 * H, { assetId: 'V-201' })).toEqual({ clashes: [], message: '' });
    expect(checkPeriod(items, now - 3 * H, now - H, { assetId: 'V-201' }).clashes).toEqual([]);
  });

  it('names the first clash in the server words, bookings before the workshop', () => {
    const check = checkPeriod(items, now + 3 * H, now + 5 * H, { assetId: 'V-201' });
    expect(check.clashes.map((c) => c.id)).toEqual(['b1', 'w1']);
    expect(check.message).toMatch(/^V-201 is already booked then: BK-1 \(Tom Nguyen, .+ – .+\)\.$/);
    expect(checkPeriod(items, now + 5 * H, now + 6 * H, { assetId: 'V-201' }).message).toBe('V-201 is booked into the workshop then (REQ-8, In Progress).');
  });

  it('leaves out the booking being edited, and the workshop for Maintenance', () => {
    expect(checkPeriod(items, now + 2 * H, now + 3 * H, { assetId: 'V-201', ignoreId: 'b1' }).clashes).toEqual([]);
    expect(checkPeriod(items, now + 5 * H, now + 6 * H, { assetId: 'V-201', reason: 'Maintenance' }).clashes).toEqual([]);
  });

  it('says a hire is not back', () => {
    const out = item({ id: 'o', ref: 'BK-170', status: 'Hire Commenced', overdue: true, start: now - 10 * H, end: now - 5 * H, until: now + 24 * H });
    expect(checkPeriod([out], now + 20 * H, now + 22 * H, { assetId: 'V-203' }).message).toMatch(/^V-203 hasn't been returned from BK-170 \(Tom Nguyen, due back .+\)\.$/);
    expect(checkPeriod([out], now + 25 * H, now + 27 * H, { assetId: 'V-203' }).clashes).toEqual([]);
  });

  it('ignores an empty or backwards period', () => {
    expect(checkPeriod(items, now + 3 * H, now + 3 * H, { assetId: 'V-201' }).clashes).toEqual([]);
  });
});

describe('who may book what', () => {
  const pool = (id: string) => ({ documentId: id, name: `${id} pool` });
  const lic = (name: string) => ({ documentId: name, name });
  const truck = { assetId: 'T-401', poolsRel: [pool('logistics')], requiredLicence: 'LR' } as Pick<Asset, 'assetId' | 'poolsRel' | 'requiredLicence'>;
  const sofia = { name: 'Sofia Russo', poolsRel: [pool('field')], licencesRel: [lic('C')], licenceExpiryDate: '2029-03-09T13:00:00.000Z' };
  const liam = { name: 'Liam Walsh', poolsRel: [pool('field'), pool('logistics')], licencesRel: [lic('C'), lic('LR')], licenceExpiryDate: '2026-11-20T00:00:00.000Z' };

  it('covers lower road licences with higher ones, and tickets only by name', () => {
    expect(licenceCovers(['C'], 'C')).toBe(true);
    expect(licenceCovers(['MR'], 'LR')).toBe(true);
    expect(licenceCovers(['LR'], 'MR')).toBe(false);
    expect(licenceCovers(['HR'], 'LF')).toBe(false);
    expect(licenceCovers(['LF'], 'LF')).toBe(true);
    expect(licenceCovers([], null)).toBe(true);
  });

  it('needs a shared pool, a licence that covers the asset, lasting the booking', () => {
    expect(bookerProblem(sofia, truck, '2026-11-12T00:00:00Z')).toBe("Sofia Russo isn't in a vehicle hire pool that has T-401.");
    expect(bookerProblem({ ...sofia, poolsRel: [pool('logistics')] }, truck)).toBe('Sofia Russo needs a LR licence or ticket to book T-401.');
    expect(bookerProblem(liam, truck, '2026-11-12T00:00:00Z')).toBe('');
    expect(bookerProblem(liam, truck, '2026-11-21T00:00:00Z')).toBe("Liam Walsh's licence expires before the booking ends.");
    expect(pickerBlock(sofia, truck)).toBe('Not in your vehicle hire pools (logistics pool)');
    expect(pickerBlock({ ...sofia, poolsRel: [pool('logistics')] }, truck)).toBe('Needs a LR licence or ticket');
    expect(pickerBlock(liam, truck)).toBeUndefined();
  });

  it('refuses assets that are not active, not bookable, or unavailable (unless for maintenance)', () => {
    const s = (name: string) => [{ documentId: name, name }];
    const base = { assetId: 'V-202', assetStatusRel: s('Active'), bookableBool: true, hireStatusRel: s('Available For Hire') };
    expect(assetProblem(base)).toBe('');
    expect(assetProblem({ ...base, assetStatusRel: s('Decommission') })).toBe("V-202 can't be booked: it is Decommission.");
    expect(assetProblem({ ...base, bookableBool: false })).toBe("V-202 can't be booked: it is Active.");
    expect(assetProblem({ ...base, hireStatusRel: s('Unavailable For Hire') })).toBe('V-202 is Unavailable For Hire (in the workshop or tagged out).');
    expect(assetProblem({ ...base, hireStatusRel: s('Unavailable For Hire') }, 'Maintenance')).toBe('');
  });
});
