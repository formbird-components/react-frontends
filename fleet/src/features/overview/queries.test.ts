import { describe, expect, it } from 'vitest';
import { assetsRequest, parseFilters } from '../assets/filters';
import { assetWarningsRequest, countRequests, KPI_LINKS, todayBookingsRequest } from './queries';

const today = new Date(2026, 10, 11).getTime();
const iso = (d: number) => new Date(2026, 10, d).toISOString();

describe('overview searches', () => {
  it('counts assets with the same search the tile opens in the register', () => {
    const counts = countRequests(today);
    for (const key of ['available', 'onHire', 'unavailable', 'serviceDue', 'regoDue'] as const) {
      const link = new URL(KPI_LINKS[key], 'http://x');
      expect(link.pathname).toBe('/assets');
      const linked = parseFilters(link.searchParams);
      // Sorting differs (the register sorts by what the tile is about); the matches don't.
      const strip = (r: Record<string, unknown>) => ({ ...r, sort: undefined });
      expect(strip(counts[key].request)).toEqual(strip(assetsRequest(linked, today)));
    }
  });

  it('finds bookings overlapping today, leaving cancelled ones out', () => {
    const json = JSON.stringify(countRequests(today).bookingsToday.request);
    expect(json).toContain(`{"range":{"startDate":{"lt":"${iso(12)}"}}}`);
    expect(json).toContain(`{"range":{"endDate":{"gte":"${iso(11)}"}}}`);
    expect(json).toContain('"must_not":[{"term":{"bookingStatusRel.name":"Cancelled"}}]');
  });

  it('lists bookings starting or ending today', () => {
    const request = todayBookingsRequest(today) as { query: { bool: { should: unknown[]; minimum_should_match: number } } };
    expect(request.query.bool.should).toEqual([{ range: { startDate: { gte: iso(11), lt: iso(12) } } }, { range: { endDate: { gte: iso(11), lt: iso(12) } } }]);
    expect(request.query.bool.minimum_should_match).toBe(1);
  });

  it('looks for registrations and insurance due within 30 days (inclusive) or services overdue', () => {
    const json = JSON.stringify(assetWarningsRequest(today));
    expect(json).toContain(`{"range":{"regDueDate":{"lt":"${iso(42)}"}}}`);
    expect(json).toContain(`{"range":{"insuranceDueDate":{"lt":"${iso(42)}"}}}`);
    expect(json).toContain('{"term":{"serviceWarning":"Overdue"}}');
    expect(json).toContain('"must_not":[{"term":{"assetStatusRel.name":"Disposed"}}]');
  });
});
