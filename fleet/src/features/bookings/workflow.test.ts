import { describe, expect, it } from 'vitest';
import { validateBooking } from '@/domain/validate';
import type { Booking } from '@/domain/types';
import { whoFor } from '@/domain/workflow';
import { actionsFor, cancelChange, returnChange, startChange, stateOf, statusValue, stepOf, timesChange, withChange } from './workflow';

const s = (name: string) => ({ documentId: `s-${name}`, name, color: '#123456', statusCategory: 'todo' as const, indexNum: 10 });
const sofia = whoFor({ documentId: 'sofia', systemHeader: { systemType: 'account', templateId: 't' }, accountType: 'Driver' });
const liam = whoFor({ documentId: 'liam', systemHeader: { systemType: 'account', templateId: 't' }, accountType: 'Driver' });
const marcus = whoFor({ documentId: 'marcus', systemHeader: { systemType: 'account', templateId: 't' }, accountType: 'Asset Manager' });

const booking = (status: string, o: Partial<Booking> = {}): Booking => ({
  documentId: 'b1',
  systemHeader: { systemType: 'document', templateId: 't' },
  bookingStatusRel: [s(status)],
  lastStatus: status,
  assetRel: [{ documentId: 'a1', name: 'V-201', assetId: 'V-201', maxBookingHours: 48, primaryMeterUnit: 'km' }],
  requestedByRel: [{ documentId: 'sofia', name: 'Sofia Russo' }],
  startDate: '2026-11-11T22:00:00.000Z',
  endDate: '2026-11-12T00:00:00.000Z',
  ...o,
});

describe('booking actions', () => {
  it('lets the requester and managers act, by status', () => {
    expect(actionsFor(booking('Asset Reserved'), sofia).actions).toEqual(['start', 'editTimes', 'cancel']);
    expect(actionsFor(booking('Hire Commenced'), sofia).actions).toEqual(['return']);
    expect(actionsFor(booking('Hire Commenced'), marcus).actions).toEqual(['return']);
    const other = actionsFor(booking('Asset Reserved'), liam);
    expect(other).toMatchObject({ actions: [], canAct: false });
    expect(other.note).toContain('Sofia Russo');
    expect(actionsFor(booking('Closed'), sofia)).toMatchObject({ actions: [], note: 'This hire is finished.' });
    expect(actionsFor(booking('Cancelled'), marcus)).toMatchObject({ actions: [], note: 'This booking was cancelled.' });
  });

  it('saves only the change and the new status, which validateBooking accepts', () => {
    const reserved = booking('Asset Reserved');
    const start = startChange(statusValue(s('Hire Commenced')), 38420);
    expect(start).toEqual({ bookingStatusRel: [s('Hire Commenced')], startMeterNum: 38420 });
    expect(validateBooking(withChange(reserved, start), sofia)).toBe('');

    const out = booking('Hire Commenced', { startMeterNum: 38420 });
    expect(validateBooking(withChange(out, returnChange(s('Closed'), 38400)), sofia)).toBe('Lower than the start reading (38,420 km).');
    expect(validateBooking(withChange(out, returnChange(s('Closed'), 38500)), sofia)).toBe('');

    const reason = { documentId: 'r1', name: 'Weather' };
    expect(cancelChange(s('Cancelled'), reason)).toEqual({ bookingStatusRel: [s('Cancelled')], cancelReasonRel: [reason] });
    expect(validateBooking(withChange(reserved, cancelChange(s('Cancelled'), reason)), sofia)).toBe('');
    // A reserved booking's new times keep to the asset's limit (managers may exceed it).
    const long = timesChange(s('Asset Reserved'), '2026-11-11T22:00:00.000Z', '2026-11-14T22:00:00.000Z');
    expect(validateBooking(withChange(reserved, long), sofia)).toBe('This asset can be booked for at most 48 hours at a time.');
    expect(validateBooking(withChange(reserved, long), marcus)).toBe('');
  });

  it('places a booking on the stepper and names its state', () => {
    expect(stepOf(booking('Asset Reserved'))).toEqual({ index: 0, cancelled: false });
    expect(stepOf(booking('Closed'))).toEqual({ index: 2, cancelled: false });
    expect(stepOf(booking('Cancelled'))).toEqual({ index: 0, cancelled: true });
    const now = new Date('2026-11-13T00:00:00.000Z').getTime();
    expect(stateOf(booking('Hire Commenced'), now)).toMatchObject({ label: 'Hire Overdue', overdue: true });
    expect(stateOf(booking('Asset Reserved'), now)).toMatchObject({ label: 'Asset Reserved', color: '#123456' });
  });

  it('keeps only stored status fields', () => {
    expect(statusValue({ ...s('Closed'), extra: 1 } as never)).toEqual(s('Closed'));
  });
});
