// What the bookings pages load: bookable assets (rows), bookings and workshop block-outs (bars) for
// a period, and the bookings list. Searches go through useSearch, so a save refreshes them.

import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo } from 'react';
import { useSearch } from '@/data/records';
import { useSession } from '@/data/session';
import { ASSET_PICK_FIELDS } from '@/data/values';
import { api, type SearchOptions } from '@react-frontends/shared/api';
import { IN_WORKSHOP } from '@/domain/model';
import type { Asset, Booking, WorkshopRequest } from '@/domain/types';
import { fleetQuery } from '@/lib/es';
import { range, term, terms } from '@react-frontends/shared/es';
import { ACTIVE_STATUSES, BLOCKING_DISABLE, blockItem, bookingItem, RELEASED_REQUEST_STATUSES, toRow, type Item, type Row } from './model';
import { listRequest, LIST_FIELDS, type ListScope, type ListTab } from './lists';

/** Fields of an asset the calendar and the form use. */
export const ROW_FIELDS = [...ASSET_PICK_FIELDS, 'bookableBool', 'make', 'model'];

/** Bookable assets: Active and in the booking calendar (the templates' BOOKABLE_ASSETS). */
export const BOOKABLE_FILTER = [term('bookableBool', true), term('assetStatusRel.name', 'Active')];

const ASSETS_REQUEST = fleetQuery('asset', { filter: BOOKABLE_FILTER, sort: [{ 'assetId.lcase': 'asc' }] });
const ASSETS_OPTIONS: SearchOptions = { size: 300, include: ROW_FIELDS };

/**
 * The calendar's rows: bookable assets, those in the person's pools unless they manage the fleet
 * (as fleet's client rules narrowed the calendar).
 */
export function useBookableRows() {
  const { who, account } = useSession();
  const query = useSearch<Asset>('asset', ASSETS_REQUEST, ASSETS_OPTIONS);
  const rows = useMemo<Row[]>(() => {
    const all = (query.data?.documents ?? []).map(toRow);
    if (who.isManager) return all;
    const pools = (account?.poolsRel ?? []).map((p) => p.documentId);
    return all.filter((row) => row.poolIds.some((id) => pools.includes(id)));
  }, [query.data, who.isManager, account]);
  return { rows, isLoading: query.isLoading, isFetching: query.isFetching, error: query.error, refetch: query.refetch };
}

const BOOKING_ITEM_FIELDS = ['documentId', 'bookingRef', 'bookingStatusRel', 'assetRel.documentId', 'assetRel.assetId', 'requestedByRel', 'startDate', 'endDate', 'closedDate', 'bookingReasonRel', 'destination'];
const BLOCK_FIELDS = ['documentId', 'requestRef', 'requestStatusRel', 'disableBooking', 'assetRel.documentId', 'assetRel.assetId', 'expectedStartDate', 'expectedCompletionDate', 'createdDate', 'systemHeader.createdDate', 'requestTypeRel'];

const iso = (t: number) => new Date(t).toISOString();

/**
 * Bookings touching a period, and hires still out (whatever their end): bars for the calendar.
 * @param activeOnly - Only reserved and commenced bookings (availability), else all but cancelled
 * @param assetIds - Only these assets
 */
export function bookingsRequest(start: number, end: number, o: { activeOnly?: boolean; assetIds?: string[] } = {}) {
  return fleetQuery('booking', {
    filter: [
      o.activeOnly ? terms('bookingStatusRel.name', ACTIVE_STATUSES) : undefined,
      o.assetIds ? terms('assetRel.documentId', o.assetIds) : undefined,
      range('startDate', { lt: iso(end) }),
      { bool: { should: [range('endDate', { gt: iso(start) }), term('bookingStatusRel.name', 'Hire Commenced')], minimum_should_match: 1 } },
    ],
    mustNot: o.activeOnly ? [] : [term('bookingStatusRel.name', 'Cancelled')],
    sort: [{ startDate: 'asc' }],
  });
}

/** Workshop requests that take their asset out (the server's ruleConflicts query), at any time. */
export function blocksRequest(assetIds?: string[]) {
  return fleetQuery('request', {
    filter: assetIds ? [terms('assetRel.documentId', assetIds)] : [],
    should: [terms('requestStatusRel.name', IN_WORKSHOP), terms('disableBooking', BLOCKING_DISABLE)],
    mustNot: [terms('requestStatusRel.name', RELEASED_REQUEST_STATUSES)],
  });
}

const BOOKING_OPTIONS: SearchOptions = { size: 1000, include: BOOKING_ITEM_FIELDS };
const BLOCK_OPTIONS: SearchOptions = { size: 300, include: BLOCK_FIELDS };

/**
 * Bars for a period: bookings and block-outs, built for `now`.
 * @param period - From and to (ms); null to load nothing
 * @param o - Only active bookings; only some assets
 */
export function useItems(period: { start: number; end: number } | null, now: number, o: { activeOnly?: boolean; assetIds?: string[] } = {}) {
  const assetKey = o.assetIds?.join(',');
  const bookingReq = useMemo(
    () => (period ? bookingsRequest(period.start, period.end, { activeOnly: o.activeOnly, assetIds: o.assetIds }) : null),
    [period?.start, period?.end, o.activeOnly, assetKey],
  );
  const blockReq = useMemo(() => (period ? blocksRequest(o.assetIds) : null), [!!period, assetKey]);
  const bookings = useSearch<Booking>('booking', bookingReq, BOOKING_OPTIONS);
  const blocks = useSearch<WorkshopRequest>('request', blockReq, BLOCK_OPTIONS);
  const items = useMemo<Item[]>(() => {
    const list: Item[] = [];
    for (const b of bookings.data?.documents ?? []) {
      const item = bookingItem(b, now);
      if (item) list.push(item);
    }
    for (const r of blocks.data?.documents ?? []) {
      const item = blockItem(r, now);
      if (item) list.push(item);
    }
    return list;
  }, [bookings.data, blocks.data, now]);
  return {
    items,
    isLoading: bookings.isLoading || blocks.isLoading,
    isFetching: bookings.isFetching || blocks.isFetching,
    /** The data on screen is for an earlier period (the new one is loading). */
    isPlaceholder: bookings.isPlaceholderData,
    error: bookings.error ?? blocks.error,
    refetch: () => Promise.all([bookings.refetch(), blocks.refetch()]),
  };
}

/** Loads the bars of other periods ahead of time (the next and previous week), for smooth paging. */
export function usePrefetchPeriods(periods: { start: number; end: number }[]) {
  const client = useQueryClient();
  const key = periods.map((p) => `${p.start}-${p.end}`).join('|');
  useEffect(() => {
    const timer = setTimeout(() => {
      for (const p of periods) {
        const request = bookingsRequest(p.start, p.end);
        // The same key useSearch gives this search, so the calendar finds it cached.
        void client.prefetchQuery({ queryKey: ['search', 'booking', request, BOOKING_OPTIONS], queryFn: () => api.search(request, BOOKING_OPTIONS), staleTime: 30_000 });
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [client, key]);
}

const LIST_OPTIONS = (size: number): SearchOptions => ({ size, include: LIST_FIELDS });

/** A tab of the bookings list, `size` long. */
export function useBookingList(tab: ListTab, scope: ListScope, size: number) {
  const request = useMemo(() => listRequest(tab, scope), [tab, scope]);
  return useSearch<Booking>('booking', request, LIST_OPTIONS(size));
}

const COUNT_OPTIONS: SearchOptions = { size: 0 };

/** How many bookings each tab has (for the tab badges). */
export function useTabCount(tab: ListTab, scope: ListScope) {
  const request = useMemo(() => listRequest(tab, scope), [tab, scope]);
  return useSearch<Booking>('booking', request, COUNT_OPTIONS).data?.total;
}
