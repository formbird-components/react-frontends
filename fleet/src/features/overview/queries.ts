// The overview's searches, as fleet's overview and workshop dashboards define them. Times are
// local days (the viewer's), computed from `today` (local midnight) so the requests stay the same
// all day; "now" comparisons use Elasticsearch's own `now`.

import { addDays } from '@/domain/logic/time';
import type { RecordKind } from '@/domain/model';
import { fleetQuery } from '@/lib/es';
import { range, term, terms } from '@react-frontends/shared/es';
import { assetsLink, assetsRequest, type AssetFilters } from '../assets/filters';

export const URGENT = 'Urgent – Asset Out of Service';
const iso = (time: number) => new Date(time).toISOString();
const asset = (f: Partial<AssetFilters>, now: number) => assetsRequest({ q: '', sort: 'id', desc: false, ...f }, now);

const OPEN_REQUEST = terms('requestStatusRel.name', ['Closed', 'Cancelled']);
const NOT_DISPOSED = term('assetStatusRel.name', 'Disposed');

export type KpiKey = 'available' | 'onHire' | 'hireOverdue' | 'unavailable' | 'serviceDue' | 'regoDue' | 'openRequests' | 'bookingsToday';
export type CountKey = KpiKey | 'activeAssets' | 'serviceOverdue' | 'regoExpired' | 'urgentRequests';

/** Bookings overdue: hire commenced, past the booking end (fleet's "Hire Overdue"). */
export const HIRE_OVERDUE = fleetQuery('booking', { filter: [term('bookingStatusRel.name', 'Hire Commenced'), range('endDate', { lt: 'now' })], sort: [{ endDate: 'asc' }] });

/** Where each tile links. Assets go to the register with the same filters, so the counts agree. */
export const KPI_LINKS: Record<KpiKey, string> = {
  available: assetsLink({ hire: 'Available For Hire', lifecycle: 'Active' }),
  onHire: assetsLink({ hire: 'On Hire' }),
  hireOverdue: '/bookings?view=list&tab=overdue&mine=0',
  unavailable: assetsLink({ hire: 'Unavailable For Hire', lifecycle: 'Active' }),
  serviceDue: assetsLink({ service: 'due', sort: 'service' }),
  regoDue: assetsLink({ rego: 30, sort: 'rego' }),
  openRequests: '/workshop',
  bookingsToday: '/bookings?view=calendar&mode=day',
};

/** The count searches for the tiles (and the figures under them). */
export function countRequests(today: number, now = today): Record<CountKey, { kind: RecordKind; request: Record<string, unknown> }> {
  const tomorrow = addDays(today, 1);
  return {
    available: { kind: 'asset', request: asset({ hire: 'Available For Hire', lifecycle: 'Active' }, now) },
    onHire: { kind: 'asset', request: asset({ hire: 'On Hire' }, now) },
    unavailable: { kind: 'asset', request: asset({ hire: 'Unavailable For Hire', lifecycle: 'Active' }, now) },
    activeAssets: { kind: 'asset', request: asset({ lifecycle: 'Active' }, now) },
    serviceDue: { kind: 'asset', request: asset({ service: 'due' }, now) },
    serviceOverdue: { kind: 'asset', request: asset({ service: 'overdue' }, now) },
    regoDue: { kind: 'asset', request: asset({ rego: 30 }, now) },
    regoExpired: { kind: 'asset', request: fleetQuery('asset', { filter: [range('regDueDate', { lt: 'now' })], mustNot: [NOT_DISPOSED] }) },
    hireOverdue: { kind: 'booking', request: HIRE_OVERDUE },
    bookingsToday: {
      kind: 'booking',
      request: fleetQuery('booking', { filter: [range('startDate', { lt: iso(tomorrow) }), range('endDate', { gte: iso(today) })], mustNot: [term('bookingStatusRel.name', 'Cancelled')] }),
    },
    openRequests: { kind: 'request', request: fleetQuery('request', { mustNot: [OPEN_REQUEST] }) },
    urgentRequests: { kind: 'request', request: fleetQuery('request', { filter: [term('priorityRel.name', URGENT)], mustNot: [OPEN_REQUEST] }) },
  };
}

/** Bookings starting or ending today (not cancelled), by start time. */
export function todayBookingsRequest(today: number) {
  const tomorrow = addDays(today, 1);
  const day = { gte: iso(today), lt: iso(tomorrow) };
  return fleetQuery('booking', { should: [range('startDate', day), range('endDate', day)], mustNot: [term('bookingStatusRel.name', 'Cancelled')], sort: [{ startDate: 'asc' }] });
}

/** Assets with a registration or insurance expired or due within `days`, or a service overdue. */
export function assetWarningsRequest(today: number, days = 30) {
  const horizon = iso(addDays(today, days + 1));
  return fleetQuery('asset', {
    should: [range('regDueDate', { lt: horizon }), range('insuranceDueDate', { lt: horizon }), term('serviceWarning', 'Overdue')],
    mustNot: [NOT_DISPOSED],
    sort: [{ 'assetId.lcase': 'asc' }],
  });
}

/** Open requests that took an asset out of service. */
export const URGENT_REQUESTS = fleetQuery('request', { filter: [term('priorityRel.name', URGENT)], mustNot: [OPEN_REQUEST], sort: [{ 'systemHeader.createdDate': 'asc' }] });

/** Every open request (the workshop queue). */
export const OPEN_REQUESTS = fleetQuery('request', { mustNot: [OPEN_REQUEST], sort: [{ expectedStartDate: { order: 'asc', missing: '_last' } }] });

/**
 * Bookings for the charts: from `daysBack` days before today (a few more, for hires that began
 * earlier and ran into the window) to `daysAhead` days after it.
 */
export function chartBookingsRequest(today: number, daysBack: number, daysAhead: number) {
  return fleetQuery('booking', { filter: [range('startDate', { gte: iso(addDays(today, -daysBack - 3)), lt: iso(addDays(today, daysAhead + 1)) })] });
}

/** Fuel receipts from the Monday `weeks` weeks back. */
export function fuelRequest(fromMonday: number) {
  return fleetQuery('fuelReceipt', { filter: [range('fuelDate', { gte: iso(fromMonday) })] });
}

/** Hireable assets (bookable and active): utilisation's denominator. */
export const HIREABLE_ASSETS = fleetQuery('asset', { filter: [term('bookableBool', true), term('assetStatusRel.name', 'Active')] });
