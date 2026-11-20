// The overview's figures, worked out from the records its searches return: bookings per day, fuel
// spend per week, utilisation (hours on hire in business hours) and the attention list.

import { addDays, DAY, HOUR, startOfDay, toDate } from '@/domain/logic/time';
import { first, nameOf, type Asset, type Booking, type FuelReceipt, type WorkshopRequest } from '@/domain/types';

// ------------------------------------------------------------------------------------ greeting

export function greeting(now = Date.now()): string {
  const hour = new Date(now).getHours();
  if (hour < 5) return 'Good evening';
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

// ------------------------------------------------------------------------------------ bookings per day

export interface DayCount {
  /** Local midnight, epoch ms. */
  day: number;
  count: number;
  /** Before today (done), today, or ahead (booked). */
  when: 'past' | 'today' | 'future';
}

/**
 * Bookings starting on each local day of a range (cancelled ones left out).
 * @param bookings - Bookings (startDate, status)
 * @param o - First day (any time in it), number of days, and today
 * @returns One entry per day, in order
 */
export function bookingsPerDay(bookings: Pick<Booking, 'startDate' | 'bookingStatusRel'>[], o: { from: number; days: number; now?: number }): DayCount[] {
  const today = startOfDay(o.now ?? Date.now());
  const days: DayCount[] = [];
  const index = new Map<number, DayCount>();
  for (let i = 0, day = startOfDay(o.from); i < o.days; i++, day = addDays(day, 1)) {
    const entry: DayCount = { day, count: 0, when: day < today ? 'past' : day === today ? 'today' : 'future' };
    days.push(entry);
    index.set(day, entry);
  }
  for (const b of bookings) {
    if (nameOf(b.bookingStatusRel) === 'Cancelled') continue;
    const start = toDate(b.startDate);
    if (!start) continue;
    const entry = index.get(startOfDay(start.getTime()));
    if (entry) entry.count++;
  }
  return days;
}

// ------------------------------------------------------------------------------------ fuel per week

export interface WeekSpend {
  /** Monday, local midnight. */
  week: number;
  cost: number;
  litres: number;
  count: number;
}

/** Monday (local midnight) of the week containing a time. */
export function weekStart(time: number): number {
  const day = startOfDay(time);
  const weekday = (new Date(day).getDay() + 6) % 7; // Monday = 0
  return addDays(day, -weekday);
}

/**
 * Fuel cost and litres per week (Monday to Sunday), for the `weeks` weeks ending with this one.
 * @param receipts - Fuel receipts (fuelDate, costNum, litresNum)
 * @param o - Number of weeks and the reference time
 * @returns One entry per week, oldest first
 */
export function fuelByWeek(receipts: Pick<FuelReceipt, 'fuelDate' | 'costNum' | 'litresNum'>[], o: { weeks: number; now?: number }): WeekSpend[] {
  const thisWeek = weekStart(o.now ?? Date.now());
  const weeks: WeekSpend[] = [];
  const index = new Map<number, WeekSpend>();
  for (let i = o.weeks - 1; i >= 0; i--) {
    const entry = { week: addDays(thisWeek, -7 * i), cost: 0, litres: 0, count: 0 };
    weeks.push(entry);
    index.set(entry.week, entry);
  }
  for (const r of receipts) {
    const date = toDate(r.fuelDate);
    if (!date) continue;
    const entry = index.get(weekStart(date.getTime()));
    if (!entry) continue;
    entry.cost += Number(r.costNum) || 0;
    entry.litres += Number(r.litresNum) || 0;
    entry.count++;
  }
  for (const w of weeks) {
    w.cost = Math.round(w.cost * 100) / 100;
    w.litres = Math.round(w.litres * 10) / 10;
  }
  return weeks;
}

// ------------------------------------------------------------------------------------ utilisation

/** Business hours: weekdays, 7 am to 5 pm local time. */
export const BUSINESS = { open: 7, close: 17 } as const;

/**
 * Hours of [start, end) that fall in business hours (weekdays, open to close, local time).
 * @param start - Epoch ms
 * @param end - Epoch ms
 * @param hoursOf - Opening and closing hour
 * @returns Hours
 */
export function businessHours(start: number, end: number, hoursOf: { open: number; close: number } = BUSINESS): number {
  if (!(end > start)) return 0;
  let total = 0;
  for (let day = startOfDay(start); day < end; day = addDays(day, 1)) {
    const weekday = new Date(day).getDay();
    if (weekday === 0 || weekday === 6) continue;
    const open = new Date(day).setHours(hoursOf.open, 0, 0, 0);
    const close = new Date(day).setHours(hoursOf.close, 0, 0, 0);
    const overlap = Math.min(end, close) - Math.max(start, open);
    if (overlap > 0) total += overlap;
  }
  return total / HOUR;
}

/** When a booking had (or has) its asset: from commencement to return; an open hire counts until now. */
export function hireInterval(b: Pick<Booking, 'bookingStatusRel' | 'startDate' | 'endDate' | 'commencedDate' | 'closedDate'>, now: number): [number, number] | undefined {
  const status = nameOf(b.bookingStatusRel);
  if (status !== 'Hire Commenced' && status !== 'Closed') return undefined;
  const start = toDate(b.commencedDate ?? b.startDate)?.getTime();
  const end = status === 'Hire Commenced' ? now : toDate(b.closedDate ?? b.endDate)?.getTime();
  if (start === undefined || end === undefined || !(end > start)) return undefined;
  return [start, end];
}

export interface Utilisation {
  kind: string;
  /** Assets of the kind that could be hired. */
  assets: number;
  /** Business hours on hire. */
  hours: number;
  /** Business hours available (assets × business hours in the window). */
  available: number;
  /** hours ÷ available, 0–1. */
  share: number;
}

/**
 * Utilisation per asset kind over a window: business hours on hire divided by business hours the
 * kind's hireable assets could have been on hire.
 * @param bookings - Bookings overlapping the window (asset's iconKind, status, times)
 * @param assets - The hireable assets (iconKind)
 * @param o - The window and the reference time
 * @returns One entry per kind with assets, most used first
 */
export function utilisationByKind(
  bookings: Pick<Booking, 'assetRel' | 'bookingStatusRel' | 'startDate' | 'endDate' | 'commencedDate' | 'closedDate'>[],
  assets: Pick<Asset, 'iconKind'>[],
  o: { from: number; to: number; now?: number },
): Utilisation[] {
  const now = o.now ?? Date.now();
  const window = businessHours(o.from, o.to);
  const byKind = new Map<string, Utilisation>();
  for (const a of assets) {
    const kind = a.iconKind || 'equipment';
    const entry = byKind.get(kind) ?? { kind, assets: 0, hours: 0, available: 0, share: 0 };
    entry.assets++;
    entry.available += window;
    byKind.set(kind, entry);
  }
  for (const b of bookings) {
    const entry = byKind.get(first(b.assetRel)?.iconKind || 'equipment');
    const interval = hireInterval(b, now);
    if (!entry || !interval) continue;
    entry.hours += businessHours(Math.max(interval[0], o.from), Math.min(interval[1], o.to));
  }
  const list = [...byKind.values()].map((u) => ({ ...u, hours: Math.round(u.hours * 10) / 10, share: u.available ? Math.min(1, u.hours / u.available) : 0 }));
  return list.sort((a, b) => b.share - a.share || a.kind.localeCompare(b.kind));
}

/** Plural names of asset kinds (iconKind), for charts. */
export const KIND_LABELS: Record<string, string> = {
  car: 'Cars',
  van: 'Vans',
  ute: 'Utes',
  truck: 'Trucks',
  bus: 'Buses',
  trailer: 'Trailers',
  forklift: 'Forklifts',
  excavator: 'Excavators',
  generator: 'Generators',
  lift: 'Work platforms',
  equipment: 'Equipment',
};

// ------------------------------------------------------------------------------------ attention

export type AttentionKind = 'hire-overdue' | 'urgent-request' | 'service-overdue' | 'rego' | 'insurance';

export interface AttentionItem {
  id: string;
  kind: AttentionKind;
  /** danger: overdue or out of service; warning: coming up. */
  tone: 'danger' | 'warning';
  title: string;
  detail: string;
  /** When it was or is due (sorts the list). */
  due?: number;
  /** For the icon. */
  iconKind?: string | null;
  to: string;
}

const URGENT = 'Urgent – Asset Out of Service';

const daysWord = (n: number) => `${n} ${n === 1 ? 'day' : 'days'}`;

/** "in 5 days", "today", "6 days ago". */
export function inDays(time: number, now: number): string {
  const days = Math.round((startOfDay(time) - startOfDay(now)) / DAY);
  if (days === 0) return 'today';
  if (days === 1) return 'tomorrow';
  if (days === -1) return 'yesterday';
  return days > 0 ? `in ${daysWord(days)}` : `${daysWord(-days)} ago`;
}

/**
 * Everything that needs someone's attention, worst first: hires not returned, urgent workshop
 * requests, services overdue, registrations and insurance expired or due within `withinDays`.
 */
export function attentionItems(
  input: { overdueBookings: Booking[]; assets: Asset[]; urgentRequests: WorkshopRequest[]; withinDays?: number },
  now = Date.now(),
): AttentionItem[] {
  const items: AttentionItem[] = [];
  const horizon = addDays(startOfDay(now), (input.withinDays ?? 30) + 1);

  for (const b of input.overdueBookings) {
    const end = toDate(b.endDate)?.getTime();
    const asset = first(b.assetRel);
    items.push({
      id: `booking-${b.documentId}`,
      kind: 'hire-overdue',
      tone: 'danger',
      title: `${asset?.assetId ?? 'Asset'} not returned`,
      detail: [b.bookingRef, nameOf(b.requestedByRel), end !== undefined ? `due back ${inDays(end, now)}` : ''].filter(Boolean).join(' · '),
      due: end,
      iconKind: asset?.iconKind,
      to: `/bookings/${b.documentId}`,
    });
  }

  for (const r of input.urgentRequests) {
    if (nameOf(r.priorityRel) !== URGENT) continue;
    const asset = first(r.assetRel);
    const created = toDate(r.createdDate ?? r.systemHeader?.createdDate)?.getTime();
    items.push({
      id: `request-${r.documentId}`,
      kind: 'urgent-request',
      tone: 'danger',
      title: `${asset?.assetId ?? 'Asset'} out of service`,
      detail: [r.requestRef, nameOf(r.requestStatusRel), nameOf(r.requestTypeRel)].filter(Boolean).join(' · '),
      due: created,
      iconKind: asset?.iconKind,
      to: `/workshop/requests/${r.documentId}`,
    });
  }

  for (const a of input.assets) {
    const base = { iconKind: a.iconKind, to: `/assets/${a.documentId}` };
    if (a.serviceWarning === 'Overdue') {
      const due = toDate(a.serviceDueDate)?.getTime();
      const meterOver = a.serviceDueMeterNum !== undefined && a.meterReadingNum !== undefined && Number(a.meterReadingNum) >= Number(a.serviceDueMeterNum);
      const detail = due !== undefined && due <= now ? `was due ${inDays(due, now)}` : meterOver ? `past ${Number(a.serviceDueMeterNum).toLocaleString('en-AU')} ${a.primaryMeterUnit === 'hours' ? 'h' : 'km'}` : 'overdue';
      items.push({ ...base, id: `service-${a.documentId}`, kind: 'service-overdue', tone: 'danger', title: `${a.assetId} service overdue`, detail: `${nameOf(a.servicePlanRel) || 'Service'} ${detail}`, due });
    }
    for (const [kind, field, label] of [['rego', 'regDueDate', 'Registration'], ['insurance', 'insuranceDueDate', 'Insurance']] as const) {
      const due = toDate(a[field])?.getTime();
      if (due === undefined || due >= horizon) continue;
      const expired = due < now;
      items.push({
        ...base,
        id: `${kind}-${a.documentId}`,
        kind,
        tone: expired ? 'danger' : 'warning',
        title: `${a.assetId} ${label.toLowerCase()} ${expired ? 'expired' : 'due'}`,
        detail: `${label} ${expired ? 'expired' : 'due'} ${inDays(due, now)}${a.registration ? ` · ${a.registration}` : ''}`,
        due,
      });
    }
  }

  const order: Record<AttentionKind, number> = { 'hire-overdue': 0, 'urgent-request': 1, 'service-overdue': 2, rego: 3, insurance: 4 };
  return items.sort((a, b) => (a.tone === b.tone ? 0 : a.tone === 'danger' ? -1 : 1) || order[a.kind] - order[b.kind] || (a.due ?? Infinity) - (b.due ?? Infinity));
}
