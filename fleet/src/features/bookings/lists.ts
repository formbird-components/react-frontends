// The bookings list: its tabs (Upcoming, On hire, Overdue, Past, Cancelled), the search each tab
// runs, which tab a booking belongs to, and grouping by day. Pure: no React.

import { startOfDay } from '@/domain/logic/time';
import { nameOf, type Booking } from '@/domain/types';
import { contains, range, term, terms, type Clause } from '@react-frontends/shared/es';
import { fleetQuery } from '@/lib/es';

export type ListTab = 'upcoming' | 'onHire' | 'overdue' | 'past' | 'cancelled';

export const LIST_TABS: { value: ListTab; label: string }[] = [
  { value: 'upcoming', label: 'Upcoming' },
  { value: 'onHire', label: 'On hire' },
  { value: 'overdue', label: 'Overdue' },
  { value: 'past', label: 'Past' },
  { value: 'cancelled', label: 'Cancelled' },
];

export const isListTab = (value: string | null | undefined): value is ListTab => LIST_TABS.some((t) => t.value === value);

const time = (value: unknown) => (value ? new Date(value as string).getTime() : NaN);

/**
 * The tab a booking is listed under: reserved and not over yet → Upcoming; on hire → On hire, or
 * Overdue once past its end; closed, or reserved but never started and over → Past; Cancelled.
 */
export function tabOf(booking: Pick<Booking, 'bookingStatusRel' | 'endDate'>, now: number): ListTab {
  const status = nameOf(booking.bookingStatusRel);
  const ended = time(booking.endDate) < now;
  if (status === 'Cancelled') return 'cancelled';
  if (status === 'Hire Commenced') return ended ? 'overdue' : 'onHire';
  if (status === 'Asset Reserved') return ended ? 'past' : 'upcoming';
  return 'past';
}

/** The clauses of a tab (Elasticsearch's "now", so the request stays the same from minute to minute). */
export function tabClauses(tab: ListTab): { filter: Clause[]; sort: Record<string, unknown>[] } {
  const status = (name: string) => term('bookingStatusRel.name', name);
  switch (tab) {
    case 'upcoming':
      return { filter: [status('Asset Reserved'), range('endDate', { gte: 'now' })], sort: [{ startDate: 'asc' }] };
    case 'onHire':
      return { filter: [status('Hire Commenced'), range('endDate', { gte: 'now' })], sort: [{ endDate: 'asc' }] };
    case 'overdue':
      return { filter: [status('Hire Commenced'), range('endDate', { lt: 'now' })], sort: [{ endDate: 'asc' }] };
    case 'past':
      return {
        filter: [{ bool: { should: [status('Closed'), { bool: { filter: [status('Asset Reserved'), range('endDate', { lt: 'now' })] } }], minimum_should_match: 1 } }],
        sort: [{ startDate: 'desc' }],
      };
    case 'cancelled':
      return { filter: [status('Cancelled')], sort: [{ startDate: 'desc' }] };
  }
}

/** What narrows the list besides the tab. */
export interface ListScope {
  /** Only this person's bookings (documentId). */
  personId?: string;
  /** Text in the reference, asset, person, job code or destination. */
  text?: string;
  /** Only bookings of these assets (from the calendar's pool, type and location filters). */
  assetIds?: string[];
}

/** Fields the list shows. */
export const LIST_FIELDS = [
  'documentId', 'bookingRef', 'bookingStatusRel', 'assetRel', 'requestedByRel', 'startDate', 'endDate', 'closedDate', 'commencedDate',
  'bookingReasonRel', 'jobCode', 'destination', 'hireCost', 'hireDurationHours', 'distanceNum', 'hireOverdueBool', 'cancelReasonRel',
];

/** The search behind a tab. */
export function listRequest(tab: ListTab, scope: ListScope = {}): Record<string, unknown> {
  const { filter, sort } = tabClauses(tab);
  return fleetQuery('booking', {
    filter: [
      ...filter,
      scope.personId ? term('requestedByRel.documentId', scope.personId) : undefined,
      scope.assetIds ? terms('assetRel.documentId', scope.assetIds.length ? scope.assetIds : ['none']) : undefined,
      contains(['bookingRef', 'assetRel.name', 'requestedByRel.name', 'jobCode', 'destination'], scope.text ?? ''),
    ],
    sort: [...sort, { 'bookingRef.lcase': 'asc' }],
  });
}

/** Bookings under day headings ("Today", "Tomorrow", "Wed 12 Nov"), in the order given. */
export function groupByDay<T extends Booking>(bookings: T[], dateOf: (b: T) => unknown): { key: number; items: T[] }[] {
  const groups: { key: number; items: T[] }[] = [];
  for (const booking of bookings) {
    const t = time(dateOf(booking));
    const key = Number.isNaN(t) ? 0 : startOfDay(t);
    const last = groups[groups.length - 1];
    if (last && last.key === key) last.items.push(booking);
    else groups.push({ key, items: [booking] });
  }
  return groups;
}

/** The date a tab groups by: when it starts (upcoming, past), or is due back (on hire, overdue). */
export const groupDateOf = (tab: ListTab) => (b: Booking) => (tab === 'onHire' || tab === 'overdue' ? b.endDate : b.startDate);
