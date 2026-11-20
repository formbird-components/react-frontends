// What can be done with a booking, by whom, and the change each action saves: start the hire,
// return it, cancel it, or move its times. Pure: no React.

import type { StatusValue } from '@/domain/types';
import { first, nameOf, type Booking, type LookupValue } from '@/domain/types';
import { nextStatuses, type Who } from '@/domain/workflow';
import { isOverdue } from './model';

export type BookingAction = 'start' | 'return' | 'cancel' | 'editTimes';

/** The statuses of the stepper, in order. */
export const STEPS = ['Asset Reserved', 'Hire Commenced', 'Closed'] as const;

export interface ActionsFor {
  /** The actions the person may take now, the main one first. */
  actions: BookingAction[];
  /** Why there are none (shown instead), or ''. */
  note: string;
  /** The person booked it, or manages the fleet. */
  canAct: boolean;
}

/**
 * The actions on a booking for a person: the requester and asset managers may act. A reserved
 * booking can be started, have its times changed, or be cancelled; a hire on the road returned.
 */
export function actionsFor(booking: Pick<Booking, 'bookingStatusRel' | 'requestedByRel'>, who: Who): ActionsFor {
  const status = nameOf(booking.bookingStatusRel);
  const mine = !!who.userId && first(booking.requestedByRel)?.documentId === who.userId;
  const canAct = mine || who.isManager;
  const next = nextStatuses('bookingStatus', status);
  if (!next.length) return { actions: [], note: status === 'Cancelled' ? 'This booking was cancelled.' : status === 'Closed' ? 'This hire is finished.' : '', canAct };
  if (!canAct) return { actions: [], note: `Only ${first(booking.requestedByRel)?.name ?? 'the person who booked it'} or a fleet manager can change this booking.`, canAct };
  const actions: BookingAction[] = [];
  if (next.includes('Hire Commenced')) actions.push('start');
  if (next.includes('Closed')) actions.push('return');
  if (status === 'Asset Reserved') actions.push('editTimes');
  if (next.includes('Cancelled')) actions.push('cancel');
  return { actions, note: '', canAct };
}

/** A status value as records store it. */
export const statusValue = (s: StatusValue): StatusValue => ({
  documentId: s.documentId,
  name: s.name,
  ...(s.color ? { color: s.color } : {}),
  ...(s.statusCategory ? { statusCategory: s.statusCategory } : {}),
  ...(s.indexNum !== undefined ? { indexNum: s.indexNum } : {}),
});

/** A change to save: the fields sent (only what changes, plus the status). */
export type Change = Record<string, unknown> & { bookingStatusRel: StatusValue[] };

export const startChange = (status: StatusValue, startMeterNum: number): Change => ({ bookingStatusRel: [status], startMeterNum });
export const returnChange = (status: StatusValue, endMeterNum: number): Change => ({ bookingStatusRel: [status], endMeterNum });
export const cancelChange = (status: StatusValue, reason: LookupValue): Change => ({ bookingStatusRel: [status], cancelReasonRel: [reason] });
export const timesChange = (status: StatusValue, startDate: string, endDate: string): Change => ({ bookingStatusRel: [status], startDate, endDate });

/** The booking as it would be saved (what validateBooking checks): the record with the change. */
export const withChange = (booking: Booking, change: Change): Booking => ({ ...booking, ...change });

/** Where a booking is on the stepper: the index of its step, and whether it was cancelled. */
export function stepOf(booking: Pick<Booking, 'bookingStatusRel'>): { index: number; cancelled: boolean } {
  const status = nameOf(booking.bookingStatusRel);
  if (status === 'Cancelled') return { index: 0, cancelled: true };
  return { index: Math.max(0, STEPS.indexOf(status as (typeof STEPS)[number])), cancelled: false };
}

/** A booking's state in a word or two, for badges: its status, or "Hire Overdue". */
export function stateOf(booking: Booking, now: number): { label: string; color?: string; overdue: boolean } {
  const status = first(booking.bookingStatusRel);
  if (isOverdue(booking, now)) return { label: 'Hire Overdue', color: 'var(--danger)', overdue: true };
  return { label: status?.name ?? '', color: status?.color, overdue: false };
}
