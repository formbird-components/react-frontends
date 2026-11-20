import { describe, expect, it } from 'vitest';
import type { Asset, Booking, WorkshopRequest } from '@/domain/types';
import { blockItem, bookingItem, filterRows, freeAt, groupRows, inWindow, isBlockOut, isOverdue, itemsByAsset, legendOf, OPEN_BLOCK_MS, optionsOf, toRow } from './model';

const H = 3_600_000;
const local = (y: number, m: number, d: number, h = 0, min = 0) => new Date(y, m - 1, d, h, min).getTime();
const iso = (t: number) => new Date(t).toISOString();

const status = (name: string, color = '#7c5cff') => [{ documentId: name, name, color }];
const ref = (documentId: string, name = documentId) => [{ documentId, name }];

function asset(id: string, o: Partial<Asset> = {}): Asset {
  return {
    documentId: `doc-${id}`,
    systemHeader: { systemType: 'document', templateId: 't', summaryName: `${id} · Toyota HiAce · ABC123` },
    assetId: id,
    makeModel: 'Toyota HiAce',
    registration: 'ABC123',
    iconKind: 'van',
    assetTypeRel: ref('van', 'Panel Van'),
    locationRel: ref('alx', 'Alexandria Depot'),
    poolsRel: ref('field', 'Field Services pool'),
    hireStatusRel: status('Available For Hire', '#2f9e5b'),
    ...o,
  };
}

function booking(id: string, assetId: string, start: number, end: number, statusName = 'Asset Reserved', o: Partial<Booking> = {}): Booking {
  return {
    documentId: id,
    systemHeader: { systemType: 'document', templateId: 't' },
    bookingRef: id.toUpperCase(),
    bookingStatusRel: status(statusName),
    assetRel: [{ documentId: `doc-${assetId}`, name: assetId, assetId }],
    requestedByRel: [{ documentId: 'p1', name: 'Sofia Russo' }],
    startDate: iso(start),
    endDate: iso(end),
    ...o,
  };
}

describe('rows', () => {
  it('reads an asset as a row', () => {
    const row = toRow(asset('V-201', { hireStatusRel: status('Unavailable For Hire', '#d1361f') }));
    expect(row).toMatchObject({ assetId: 'V-201', model: 'Toyota HiAce', typeName: 'Panel Van', location: 'Alexandria Depot', poolIds: ['field'], unavailable: true, iconKind: 'van' });
    expect(row.haystack).toContain('abc123');
    expect(toRow(asset('X', { locationRel: [], makeModel: undefined, make: 'Kubota', model: 'U17' })).location).toBe('No location');
    expect(toRow(asset('X', { makeModel: undefined, make: 'Kubota', model: 'U17' })).model).toBe('Kubota U17');
  });

  it('groups rows by location, in natural fleet-ID order, with no location last', () => {
    const rows = [
      toRow(asset('V-10')),
      toRow(asset('V-2')),
      toRow(asset('C-1', { locationRel: ref('par', 'Parramatta Depot') })),
      toRow(asset('Z-1', { locationRel: [] })),
      toRow(asset('A-1', { locationRel: ref('mq', 'Macquarie Park Office') })),
    ];
    const groups = groupRows(rows);
    expect(groups.map((g) => g.location)).toEqual(['Alexandria Depot', 'Macquarie Park Office', 'Parramatta Depot', 'No location']);
    expect(groups[0].rows.map((r) => r.assetId)).toEqual(['V-2', 'V-10']);
  });

  it('filters by text, pool, type, location and availability', () => {
    const now = local(2026, 11, 10, 10);
    const rows = [
      toRow(asset('V-201')),
      toRow(asset('U-301', { makeModel: 'Ford Ranger', assetTypeRel: ref('ute', 'Dual Cab Ute') })),
      toRow(asset('C-101', { poolsRel: ref('corp'), locationRel: ref('par', 'Parramatta Depot') })),
      toRow(asset('V-202', { hireStatusRel: status('Unavailable For Hire') })),
    ];
    const items = itemsByAsset([bookingItem(booking('b1', 'U-301', now - H, now + H, 'Hire Commenced'), now)!]);
    const ids = (f: Parameters<typeof filterRows>[1]) => filterRows(rows, f, items, now).map((r) => r.assetId);
    expect(ids({})).toEqual(['V-201', 'U-301', 'C-101', 'V-202']);
    expect(ids({ text: 'ford  ute' })).toEqual(['U-301']);
    expect(ids({ text: 'nothing' })).toEqual([]);
    expect(ids({ pool: 'corp' })).toEqual(['C-101']);
    expect(ids({ type: 'ute' })).toEqual(['U-301']);
    expect(ids({ location: 'par' })).toEqual(['C-101']);
    // On hire now (U-301) and Unavailable For Hire (V-202) aren't available.
    expect(ids({ onlyAvailable: true })).toEqual(['V-201', 'C-101']);
    expect(freeAt(rows[1], items.get('doc-U-301'), now + 2 * H)).toBe(true);
  });

  it('lists filter options once each, by label', () => {
    const rows = [toRow(asset('V-1')), toRow(asset('V-2')), toRow(asset('U-1', { assetTypeRel: ref('ute', 'Dual Cab Ute') }))];
    expect(optionsOf(rows, (r) => [r.typeId, r.typeName])).toEqual([
      { value: 'ute', label: 'Dual Cab Ute' },
      { value: 'van', label: 'Panel Van' },
    ]);
  });
});

describe('bars', () => {
  const now = local(2026, 11, 10, 12);

  it('reads a booking, and an overdue hire runs to now and blocks the next 24 hours', () => {
    const reserved = bookingItem(booking('b1', 'V-201', now + H, now + 3 * H), now)!;
    expect(reserved).toMatchObject({ kind: 'booking', assetDocId: 'doc-V-201', ref: 'B1', status: 'Asset Reserved', person: 'Sofia Russo', overdue: false, active: true, drawEnd: now + 3 * H, until: now + 3 * H });
    const out = booking('b2', 'V-201', now - 5 * H, now - 2 * H, 'Hire Commenced');
    expect(isOverdue(out, now)).toBe(true);
    const overdue = bookingItem(out, now)!;
    expect(overdue).toMatchObject({ overdue: true, active: true, drawEnd: now, until: now + 24 * H });
    // Returned early: the rest of the slot is free; closed bookings don't hold the asset.
    const back = bookingItem(booking('b3', 'V-201', now - 5 * H, now + 2 * H, 'Closed', { closedDate: iso(now - H) }), now)!;
    expect(back).toMatchObject({ active: false, until: now - H, overdue: false });
    expect(bookingItem(booking('b4', 'V-201', now, now, 'Asset Reserved', { startDate: undefined }), now)).toBeUndefined();
  });

  it('reads workshop requests that take the asset out, as the server does', () => {
    const request = (o: Partial<WorkshopRequest> & { createdDate?: string }): WorkshopRequest => ({
      documentId: 'r1',
      systemHeader: { systemType: 'document', templateId: 't' },
      requestRef: 'REQ-8',
      assetRel: [{ documentId: 'doc-T-403', name: 'T-403', assetId: 'T-403' }],
      requestStatusRel: status('In Progress'),
      disableBooking: 'Do Not Disable',
      expectedStartDate: iso(now - 24 * H),
      expectedCompletionDate: iso(now + 24 * H),
      ...o,
    });
    expect(isBlockOut(request({}))).toBe(true);
    expect(isBlockOut(request({ requestStatusRel: status('Open') }))).toBe(false);
    expect(isBlockOut(request({ requestStatusRel: status('Open'), disableBooking: 'Auto Disable' }))).toBe(true);
    expect(isBlockOut(request({ requestStatusRel: status('Pick Up'), disableBooking: 'Disable' }))).toBe(false);
    expect(blockItem(request({}), now)).toMatchObject({ kind: 'block', ref: 'REQ-8', status: 'In Progress', start: now - 24 * H, end: now + 24 * H, active: true, openEnded: false });
    // No expected dates: from when it was raised, for a week from now.
    const open = blockItem(request({ requestStatusRel: status('Pending'), disableBooking: 'Disable', expectedStartDate: undefined, expectedCompletionDate: undefined, createdDate: iso(now - 48 * H) }), now)!;
    expect(open).toMatchObject({ start: now - 48 * H, end: now + OPEN_BLOCK_MS, openEnded: true });
    expect(blockItem(request({ requestStatusRel: status('Closed') }), now)).toBeUndefined();
  });

  it('shows bars that touch the window, and a legend of the statuses on screen', () => {
    const window = { start: local(2026, 11, 10), end: local(2026, 11, 11) };
    const items = [
      bookingItem(booking('a', 'V-1', local(2026, 11, 9, 9), local(2026, 11, 9, 11)), now)!,
      bookingItem(booking('b', 'V-1', local(2026, 11, 9, 22), local(2026, 11, 10, 2), 'Closed'), now)!,
      bookingItem(booking('c', 'V-1', local(2026, 11, 9, 8), local(2026, 11, 9, 9), 'Hire Commenced'), now)!,
    ];
    expect(items.filter((i) => inWindow(i, window)).map((i) => i.id)).toEqual(['b', 'c']);
    expect(legendOf(items).map((l) => l.name)).toEqual(['Asset Reserved', 'Closed']);
  });
});
