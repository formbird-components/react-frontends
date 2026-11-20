// Booking times: defaults, quick durations, keeping the length when the start moves, snapping a
// drag on the calendar, and the hire cost estimate. Pure: no React.

import { hireCost } from '@/domain/logic/booking';
import { HOUR, MINUTE, roundUp, startOfDay } from '@/domain/logic/time';
import { TIME_ZONE } from '@/domain/model';

/** Quick durations on the booking form, hours. */
export const QUICK_HOURS = [1, 2, 4, 8];

/** Length of a new booking (Fleet Booking - Client: two hours from the next half hour). */
export const DEFAULT_HOURS = 2;

/** Drag-to-book snaps to this. */
export const SLOT_MINUTES = 30;

const iso = (t: number) => new Date(t).toISOString();
const ms = (value: string | number | undefined | null) => (value === undefined || value === null || value === '' ? NaN : new Date(value).getTime());

/** A new booking's times: from the next half hour, for two hours. */
export function defaultRange(now: number): { start: string; end: string } {
  const start = roundUp(now, SLOT_MINUTES);
  return { start: iso(start), end: iso(start + DEFAULT_HOURS * HOUR) };
}

/** The end that many hours after the start. */
export const endAfter = (start: string, hours: number) => iso(ms(start) + hours * HOUR);

/** 5 pm on the start's day, or the next day when the start is 5 pm or later. */
export function untilFivePm(start: string): string {
  const s = ms(start);
  const five = new Date(s);
  five.setHours(17, 0, 0, 0);
  if (five.getTime() <= s) five.setDate(five.getDate() + 1);
  return iso(five.getTime());
}

/** Moving the start keeps the length (or gives the default length when there is no valid end). */
export function moveStart(start: string | undefined, end: string | undefined, nextStart: string | undefined): { start?: string; end?: string } {
  if (!nextStart) return { start: undefined, end };
  const length = ms(end) - ms(start);
  const keep = Number.isFinite(length) && length > 0 ? length : DEFAULT_HOURS * HOUR;
  return { start: nextStart, end: iso(ms(nextStart) + keep) };
}

/** The length of a period: "2 h", "2 h 30 min", "45 min", "3 d 4 h" ('' when not positive). */
export const durationText = (start: string | number | undefined, end: string | number | undefined) => lengthText(ms(end) - ms(start));

/** A length in ms: "2 h", "2 h 30 min", "45 min", "3 d 4 h" ('' when not positive). */
export function lengthText(length: number): string {
  if (!Number.isFinite(length) || length <= 0) return '';
  const minutes = Math.round(length / MINUTE);
  const days = Math.floor(minutes / (24 * 60));
  const h = Math.floor((minutes % (24 * 60)) / 60);
  const m = minutes % 60;
  if (days) return [days && `${days} d`, h && `${h} h`].filter(Boolean).join(' ');
  if (!h) return `${m} min`;
  return m ? `${h} h ${m} min` : `${h} h`;
}

/** Rates as an asset (or the asset value a booking stores) carries them. */
export interface Rates {
  hireRateHourly?: number | null;
  hireRateDaily?: number | null;
}

/** The hire cost the server will work out (hourly, capped daily per Sydney day, weekends free). */
export function estimateCost(rates: Rates | undefined, start: string | number | undefined, end: string | number | undefined, closed?: string | number | null): number | undefined {
  if (!rates || !Number.isFinite(ms(start)) || !Number.isFinite(ms(end))) return undefined;
  return hireCost({ start: ms(start), end: ms(end), closed: closed ? ms(closed) : undefined, hourlyRate: rates.hireRateHourly, dailyRate: rates.hireRateDaily, timeZone: TIME_ZONE });
}

/** "$18/h, $110/day", or ''. */
export function ratesText(rates: Rates | undefined): string {
  if (!rates) return '';
  const parts = [];
  if (rates.hireRateHourly) parts.push(`$${rates.hireRateHourly}/h`);
  if (rates.hireRateDaily) parts.push(`$${rates.hireRateDaily}/day`);
  return parts.join(', ');
}

/** A time snapped down to the slot it falls in. */
export const slotOf = (time: number, slotMinutes = SLOT_MINUTES) => Math.floor(time / (slotMinutes * MINUTE)) * slotMinutes * MINUTE;

/**
 * The period a drag covers: from the slot it started in to the slot it is in now (either way).
 * @param from - Time where the drag started
 * @param at - Time under the pointer now
 * @param window - Visible window (the period stays inside it)
 */
export function dragRange(from: number, at: number, window: { start: number; end: number }, slotMinutes = SLOT_MINUTES): { start: number; end: number } {
  const slot = slotMinutes * MINUTE;
  const a = slotOf(from, slotMinutes);
  const b = slotOf(at, slotMinutes);
  const start = Math.max(window.start, Math.min(a, b));
  const end = Math.min(window.end, Math.max(a, b) + slot);
  return { start, end };
}

/**
 * The period a click (no drag) on free time picks: the default length from the slot clicked, not
 * running into the next booking on the row, nor past the window.
 * @param at - Time clicked
 * @param nextStart - Start of the next item after `at` on the row, if any
 */
export function clickRange(at: number, window: { start: number; end: number }, nextStart?: number, slotMinutes = SLOT_MINUTES): { start: number; end: number } {
  const start = slotOf(at, slotMinutes);
  let end = Math.min(start + DEFAULT_HOURS * HOUR, window.end);
  if (nextStart !== undefined && nextStart > start && nextStart < end) end = nextStart;
  if (end - start < slotMinutes * MINUTE) end = start + slotMinutes * MINUTE;
  return { start, end };
}

/** Where the day view scrolls to: 7 am, or an hour before now later in the day (not past 4 pm). */
export function dayScrollTarget(windowStart: number, now: number): number {
  const seven = windowStart + 7 * HOUR;
  const latest = windowStart + 16 * HOUR;
  if (startOfDay(now) !== startOfDay(windowStart)) return seven;
  return Math.max(seven, Math.min(now - HOUR, latest));
}
