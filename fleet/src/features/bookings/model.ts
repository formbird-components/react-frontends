// The booking calendar's model: rows (bookable assets, grouped by location), bars (bookings and
// workshop block-outs), the filters, and which bars are visible in a window. Pure: no React.

import { blockedUntil, type TimedItem, type TimeWindow } from '@/domain/logic/calendar';
import { DAY } from '@/domain/logic/time';
import { IN_WORKSHOP } from '@/domain/model';
import { first, nameOf, type Asset, type Booking, type StatusValue, type WorkshopRequest } from '@/domain/types';

/** Booking statuses that hold their asset (the server's ruleConflicts looks only at these). */
export const ACTIVE_STATUSES = ['Asset Reserved', 'Hire Commenced'];

/** Request statuses that release the asset again (block-outs end there). */
export const RELEASED_REQUEST_STATUSES = ['Closed', 'Cancelled', 'Pick Up'];

/** disableBooking values that block bookings while a request is open (ruleConflicts). */
export const BLOCKING_DISABLE = ['Disable', 'Auto Disable'];

/** How long a block-out without an expected completion lasts, from now (ruleConflicts: 7 days). */
export const OPEN_BLOCK_MS = 7 * DAY;

/** A row of the calendar: one bookable asset. */
export interface Row {
  documentId: string;
  /** Fleet ID ("V-201"). */
  assetId: string;
  /** Make and model ("Toyota HiAce LWB"). */
  model: string;
  registration: string;
  typeId: string;
  typeName: string;
  iconKind?: string;
  locationId: string;
  location: string;
  poolIds: string[];
  hireStatus?: StatusValue;
  /** Unavailable For Hire: in the workshop or tagged out. */
  unavailable: boolean;
  /** Lower-case text the search box matches. */
  haystack: string;
  /** The asset document, for the related value a booking stores. */
  asset: Asset;
}

const NO_LOCATION = 'No location';

export function toRow(asset: Asset): Row {
  const type = first(asset.assetTypeRel);
  const location = first(asset.locationRel);
  const hireStatus = first(asset.hireStatusRel);
  const model = asset.makeModel || [asset.make, asset.model].filter(Boolean).join(' ') || asset.systemHeader?.summaryName || '';
  const row: Row = {
    documentId: asset.documentId,
    assetId: asset.assetId || asset.systemHeader?.summaryName || '',
    model,
    registration: asset.registration ?? '',
    typeId: type?.documentId ?? '',
    typeName: type?.name ?? '',
    iconKind: asset.iconKind ?? type?.iconKind ?? undefined,
    locationId: location?.documentId ?? '',
    location: location?.name ?? NO_LOCATION,
    poolIds: (asset.poolsRel ?? []).map((p) => p.documentId),
    hireStatus,
    unavailable: /unavailable/i.test(hireStatus?.name ?? ''),
    haystack: '',
    asset,
  };
  row.haystack = [row.assetId, row.model, row.registration, row.typeName, row.location].join(' ').toLowerCase();
  return row;
}

/** Fleet IDs in natural order: V-2 before V-10. */
export const byAssetId = (a: { assetId: string }, b: { assetId: string }) => a.assetId.localeCompare(b.assetId, undefined, { numeric: true });

export interface RowGroup {
  key: string;
  location: string;
  rows: Row[];
}

/** Rows grouped by location (locations A–Z, "No location" last), assets by fleet ID. */
export function groupRows(rows: Row[]): RowGroup[] {
  const groups = new Map<string, RowGroup>();
  for (const row of rows) {
    const key = row.locationId || NO_LOCATION;
    const group = groups.get(key) ?? { key, location: row.location, rows: [] };
    group.rows.push(row);
    groups.set(key, group);
  }
  const list = [...groups.values()];
  for (const group of list) group.rows.sort(byAssetId);
  return list.sort((a, b) => (a.location === NO_LOCATION ? 1 : b.location === NO_LOCATION ? -1 : a.location.localeCompare(b.location)));
}

/** A bar on a row: a booking, or a workshop request that blocks the asset. */
export interface Item extends TimedItem {
  kind: 'booking' | 'block';
  /** documentId of the asset (the row). */
  assetDocId: string;
  /** "BK-12", "REQ-8". */
  ref: string;
  status: string;
  color?: string;
  person?: string;
  personId?: string;
  /** Where the bar is drawn to: its end, or now for a hire still out past its end. */
  drawEnd: number;
  /** Until when it keeps the asset (blockedUntil). */
  until: number;
  /** A hire still out past its end. */
  overdue: boolean;
  /** Counts for clashes: a reserved or commenced booking, or a block-out. */
  active: boolean;
  /** A block-out with no expected completion ("until further notice"). */
  openEnded?: boolean;
  reason?: string;
  destination?: string;
}

const time = (value: unknown): number | undefined => {
  if (value === null || value === undefined || value === '') return undefined;
  const t = new Date(value as string).getTime();
  return Number.isNaN(t) ? undefined : t;
};

/** Whether a booking is a hire still out past its end. */
export function isOverdue(booking: Pick<Booking, 'bookingStatusRel' | 'endDate' | 'closedDate'>, now: number): boolean {
  const end = time(booking.endDate);
  return nameOf(booking.bookingStatusRel) === 'Hire Commenced' && end !== undefined && end < now && !booking.closedDate;
}

/** A booking as a bar (undefined without valid times). */
export function bookingItem(booking: Booking, now: number): Item | undefined {
  const start = time(booking.startDate);
  const end = time(booking.endDate);
  const asset = first(booking.assetRel);
  if (start === undefined || end === undefined || !asset?.documentId) return undefined;
  const status = first(booking.bookingStatusRel);
  const closed = time(booking.closedDate);
  const overdue = isOverdue(booking, now);
  const person = first(booking.requestedByRel);
  return {
    id: booking.documentId,
    kind: 'booking',
    assetDocId: asset.documentId,
    start,
    end,
    drawEnd: overdue ? Math.max(end, now) : end,
    until: blockedUntil({ end, overdue, closed, now }),
    ref: booking.bookingRef || 'Booking',
    status: status?.name ?? '',
    color: status?.color,
    person: person?.name,
    personId: person?.documentId,
    overdue,
    active: ACTIVE_STATUSES.includes(status?.name ?? ''),
    reason: nameOf(booking.bookingReasonRel) || undefined,
    destination: booking.destination || undefined,
  };
}

/** Whether a workshop request takes its asset out (the server's ruleConflicts query). */
export function isBlockOut(request: Pick<WorkshopRequest, 'requestStatusRel' | 'disableBooking'>): boolean {
  const status = nameOf(request.requestStatusRel);
  if (RELEASED_REQUEST_STATUSES.includes(status)) return false;
  return IN_WORKSHOP.includes(status) || BLOCKING_DISABLE.includes(request.disableBooking ?? '');
}

/**
 * A workshop request as a block-out, over its expected start to completion, as the server reads it:
 * from the expected start (or when it was raised) to the expected completion (or a week from now).
 */
export function blockItem(request: WorkshopRequest & { createdDate?: string }, now: number): Item | undefined {
  const asset = first(request.assetRel);
  if (!asset?.documentId || !isBlockOut(request)) return undefined;
  const start = time(request.expectedStartDate) ?? time(request.createdDate) ?? time(request.systemHeader?.createdDate);
  if (start === undefined) return undefined;
  const expectedEnd = time(request.expectedCompletionDate);
  const end = expectedEnd ?? now + OPEN_BLOCK_MS;
  return {
    id: request.documentId,
    kind: 'block',
    assetDocId: asset.documentId,
    start,
    end,
    drawEnd: end,
    until: end,
    ref: request.requestRef || 'Workshop',
    status: nameOf(request.requestStatusRel),
    overdue: false,
    active: true,
    openEnded: expectedEnd === undefined,
    reason: nameOf(request.requestTypeRel) || undefined,
  };
}

/** Items by the asset (row) they are on. */
export function itemsByAsset(items: Item[]): Map<string, Item[]> {
  const map = new Map<string, Item[]>();
  for (const item of items) {
    const list = map.get(item.assetDocId);
    if (list) list.push(item);
    else map.set(item.assetDocId, [item]);
  }
  return map;
}

/** Whether a bar shows in a window (its drawn range, or what it still blocks, touches it). */
export const inWindow = (item: Item, window: TimeWindow) => item.start < window.end && Math.max(item.drawEnd, item.active ? item.until : 0) > window.start;

/** What the calendar's filters narrow the rows to. */
export interface RowFilters {
  text?: string;
  pool?: string;
  type?: string;
  location?: string;
  /** Only assets free at `at`: not Unavailable For Hire, not booked, on hire or in the workshop. */
  onlyAvailable?: boolean;
}

/** Whether an asset is free at a moment: available for hire and nothing active on it then. */
export function freeAt(row: Row, items: Item[] | undefined, at: number): boolean {
  if (row.unavailable) return false;
  return !(items ?? []).some((item) => item.active && item.start <= at && at < item.until);
}

/**
 * The rows the filters keep.
 * @param rows - All rows
 * @param filters - Search text, pool, type, location, only available
 * @param items - Items by asset (for "only available")
 * @param at - The moment "only available" is judged at
 */
export function filterRows(rows: Row[], filters: RowFilters, items: Map<string, Item[]>, at: number): Row[] {
  const words = (filters.text ?? '').trim().toLowerCase().split(/\s+/).filter(Boolean);
  return rows.filter(
    (row) =>
      (!filters.pool || row.poolIds.includes(filters.pool)) &&
      (!filters.type || row.typeId === filters.type) &&
      (!filters.location || (row.locationId || NO_LOCATION) === filters.location) &&
      words.every((word) => row.haystack.includes(word)) &&
      (!filters.onlyAvailable || freeAt(row, items.get(row.documentId), at)),
  );
}

/** Distinct options of a row field, for the filter selects ({ value, label } sorted by label). */
export function optionsOf(rows: Row[], pick: (row: Row) => [string, string] | undefined): { value: string; label: string }[] {
  const map = new Map<string, string>();
  for (const row of rows) {
    const pair = pick(row);
    if (pair && pair[0]) map.set(pair[0], pair[1]);
  }
  return [...map.entries()].map(([value, label]) => ({ value, label })).sort((a, b) => a.label.localeCompare(b.label));
}

/** The statuses on screen, for the legend ({ name, color } in first-seen order). */
export function legendOf(items: Item[]): { name: string; color?: string }[] {
  const seen = new Map<string, string | undefined>();
  for (const item of items) if (item.kind === 'booking' && item.status && !item.overdue && !seen.has(item.status)) seen.set(item.status, item.color);
  return [...seen.entries()].map(([name, color]) => ({ name, color }));
}
