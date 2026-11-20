import { describe, expect, it } from 'vitest';
import type { Booking } from '@/domain/types';
import { groupByDay, isListTab, listRequest, tabOf } from './lists';

const H = 3_600_000;
const now = new Date(2026, 10, 10, 12).getTime();
const iso = (t: number) => new Date(t).toISOString();
const b = (status: string, start: number, end: number, id = 'b'): Booking => ({
  documentId: id,
  systemHeader: { systemType: 'document', templateId: 't' },
  bookingStatusRel: [{ documentId: status, name: status }],
  startDate: iso(start),
  endDate: iso(end),
});

describe('list tabs', () => {
  it('puts each booking under one tab', () => {
    expect(tabOf(b('Asset Reserved', now + H, now + 2 * H), now)).toBe('upcoming');
    expect(tabOf(b('Asset Reserved', now - H, now + H), now)).toBe('upcoming');
    expect(tabOf(b('Asset Reserved', now - 3 * H, now - H), now)).toBe('past');
    expect(tabOf(b('Hire Commenced', now - H, now + H), now)).toBe('onHire');
    expect(tabOf(b('Hire Commenced', now - 3 * H, now - H), now)).toBe('overdue');
    expect(tabOf(b('Closed', now - 3 * H, now - H), now)).toBe('past');
    expect(tabOf(b('Cancelled', now + H, now + 2 * H), now)).toBe('cancelled');
    expect(isListTab('overdue')).toBe(true);
    expect(isListTab('nope')).toBe(false);
  });

  it('searches a tab, narrowed to a person, text and assets', () => {
    const request = listRequest('overdue', { personId: 'p1', text: 'V-20', assetIds: ['a1'] }) as { sort: unknown[]; query: { bool: { filter: unknown[] } } };
    const filter = JSON.stringify(request.query.bool.filter);
    expect(filter).toContain('{"term":{"appTags":"booking"}}');
    expect(filter).toContain('{"term":{"bookingStatusRel.name":"Hire Commenced"}}');
    expect(filter).toContain('{"range":{"endDate":{"lt":"now"}}}');
    expect(filter).toContain('{"term":{"requestedByRel.documentId":"p1"}}');
    expect(filter).toContain('{"terms":{"assetRel.documentId":["a1"]}}');
    expect(filter).toContain('*v-20*');
    expect(request.sort[0]).toEqual({ endDate: 'asc' });
    // No assets match the calendar's filters: nothing, rather than everything.
    expect(JSON.stringify(listRequest('upcoming', { assetIds: [] }))).toContain('["none"]');
    expect(JSON.stringify(listRequest('past'))).toContain('"should"');
  });

  it('groups by day in the order given', () => {
    const list = [b('Asset Reserved', new Date(2026, 10, 10, 9).getTime(), now, 'a'), b('Asset Reserved', new Date(2026, 10, 10, 15).getTime(), now, 'b'), b('Asset Reserved', new Date(2026, 10, 12, 8).getTime(), now, 'c')];
    const groups = groupByDay(list, (x) => x.startDate);
    expect(groups.map((g) => g.items.map((i) => i.documentId))).toEqual([['a', 'b'], ['c']]);
    expect(groups[0].key).toBe(new Date(2026, 10, 10).getTime());
  });
});
