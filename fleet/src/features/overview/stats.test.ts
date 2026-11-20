import { describe, expect, it } from 'vitest';
import type { Asset, Booking, WorkshopRequest } from '@/domain/types';
import { attentionItems, bookingsPerDay, businessHours, fuelByWeek, greeting, hireInterval, inDays, utilisationByKind, weekStart } from './stats';

// Local times (the tests run in any time zone): Tuesday 10 November 2026, 9:30 am.
const at = (d: number, h = 0, m = 0) => new Date(2026, 10, d, h, m).getTime();
const iso = (d: number, h = 0, m = 0) => new Date(at(d, h, m)).toISOString();
const NOW = at(10, 9, 30);
const status = (name: string) => [{ documentId: name, name }];

describe('greeting', () => {
  it('follows the time of day', () => {
    expect(greeting(at(10, 8))).toBe('Good morning');
    expect(greeting(at(10, 13))).toBe('Good afternoon');
    expect(greeting(at(10, 19))).toBe('Good evening');
    expect(greeting(at(10, 2))).toBe('Good evening');
  });
});

describe('bookings per day', () => {
  it('counts bookings by local start day, leaves out cancelled ones, and marks today', () => {
    const bookings = [
      { startDate: iso(9, 8), bookingStatusRel: status('Closed') },
      { startDate: iso(10, 7), bookingStatusRel: status('Hire Commenced') },
      { startDate: iso(10, 23, 59), bookingStatusRel: status('Asset Reserved') },
      { startDate: iso(10, 10), bookingStatusRel: status('Cancelled') },
      { startDate: iso(11, 0), bookingStatusRel: status('Asset Reserved') },
      { startDate: iso(20, 9), bookingStatusRel: status('Asset Reserved') },
    ] as Booking[];
    const days = bookingsPerDay(bookings, { from: at(9, 15), days: 3, now: NOW });
    expect(days.map((d) => [new Date(d.day).getDate(), d.count, d.when])).toEqual([
      [9, 1, 'past'],
      [10, 2, 'today'],
      [11, 1, 'future'],
    ]);
  });
});

describe('fuel by week', () => {
  it('sums cost and litres per Monday-to-Sunday week, oldest first', () => {
    expect(new Date(weekStart(NOW)).getDate()).toBe(9); // Monday 9 November
    const weeks = fuelByWeek(
      [
        { fuelDate: iso(9, 6), costNum: 50.5, litresNum: 25 },
        { fuelDate: iso(15, 23), costNum: 20, litresNum: 10.25 },
        { fuelDate: iso(8, 12), costNum: 70, litresNum: 35 },
        { fuelDate: iso(1, 12), costNum: 99, litresNum: 50 }, // three weeks back: outside
      ],
      { weeks: 2, now: NOW },
    );
    expect(weeks.map((w) => [new Date(w.week).getDate(), w.cost, w.litres, w.count])).toEqual([
      [2, 70, 35, 1],
      [9, 70.5, 35.3, 2],
    ]);
  });
});

describe('utilisation', () => {
  it('counts weekday business hours only', () => {
    expect(businessHours(at(10, 6), at(10, 9))).toBe(2); // 7–9 am
    expect(businessHours(at(10, 16), at(11, 8))).toBe(2); // 4–5 pm and 7–8 am
    expect(businessHours(at(14, 0), at(16, 0))).toBe(0); // Saturday and Sunday
    expect(businessHours(at(9, 0), at(16, 0))).toBe(50); // a working week
    expect(businessHours(at(10, 12), at(10, 11))).toBe(0);
  });

  it('takes a hire from commencement to return, an open one until now', () => {
    const closed = { bookingStatusRel: status('Closed'), startDate: iso(9, 8), endDate: iso(9, 17), commencedDate: iso(9, 8, 15), closedDate: iso(9, 15) } as Booking;
    expect(hireInterval(closed, NOW)).toEqual([at(9, 8, 15), at(9, 15)]);
    const open = { bookingStatusRel: status('Hire Commenced'), startDate: iso(10, 8), endDate: iso(10, 12) } as Booking;
    expect(hireInterval(open, NOW)).toEqual([at(10, 8), NOW]);
    expect(hireInterval({ bookingStatusRel: status('Asset Reserved'), startDate: iso(10, 8), endDate: iso(10, 12) } as Booking, NOW)).toBeUndefined();
  });

  it('divides hours on hire by the hours the kind could have been on hire', () => {
    const vans = [{ iconKind: 'van' }, { iconKind: 'van' }] as Asset[];
    const utes = [{ iconKind: 'ute' }] as Asset[];
    const bookings = [
      { assetRel: [{ iconKind: 'van' }], bookingStatusRel: status('Closed'), startDate: iso(9, 7), endDate: iso(9, 17) },
      { assetRel: [{ iconKind: 'van' }], bookingStatusRel: status('Cancelled'), startDate: iso(9, 7), endDate: iso(9, 17) },
      { assetRel: [{ iconKind: 'ute' }], bookingStatusRel: status('Closed'), startDate: iso(6, 12), endDate: iso(9, 12) }, // from before the window
      { assetRel: [{ iconKind: 'truck' }], bookingStatusRel: status('Closed'), startDate: iso(9, 7), endDate: iso(9, 17) }, // no hireable trucks
    ] as unknown as Booking[];
    const result = utilisationByKind(bookings, [...vans, ...utes], { from: at(9), to: at(10), now: NOW });
    expect(result).toEqual([
      { kind: 'ute', assets: 1, hours: 5, available: 10, share: 0.5 }, // a tie: by name
      { kind: 'van', assets: 2, hours: 10, available: 20, share: 0.5 },
    ]);
  });
});

describe('attention items', () => {
  it('puts overdue and out-of-service first, then what is coming up, soonest first', () => {
    const items = attentionItems(
      {
        overdueBookings: [{ documentId: 'b1', bookingRef: 'BK-7', assetRel: [{ assetId: 'V-203', iconKind: 'van' }], requestedByRel: [{ name: 'Liam Walsh' }], endDate: iso(8, 17) } as unknown as Booking],
        urgentRequests: [
          { documentId: 'r1', requestRef: 'REQ-4', assetRel: [{ assetId: 'V-206' }], priorityRel: [{ name: 'Urgent – Asset Out of Service' }], requestStatusRel: status('Open') } as unknown as WorkshopRequest,
          { documentId: 'r2', requestRef: 'REQ-5', priorityRel: [{ name: 'Non-Urgent – Asset Operational' }] } as unknown as WorkshopRequest,
        ],
        assets: [
          { documentId: 'a1', assetId: 'C-101', registration: 'DH55PL', regDueDate: iso(23), insuranceDueDate: iso(25) },
          { documentId: 'a2', assetId: 'T-405', regDueDate: iso(4), serviceWarning: 'Overdue', serviceDueDate: iso(1), servicePlanRel: [{ name: 'Heavy Vehicle Service' }] },
          { documentId: 'a3', assetId: 'V-201', regDueDate: new Date(2027, 7, 27).toISOString() },
        ] as unknown as Asset[],
      },
      NOW,
    );
    expect(items.map((i) => [i.kind, i.title, i.tone])).toEqual([
      ['hire-overdue', 'V-203 not returned', 'danger'],
      ['urgent-request', 'V-206 out of service', 'danger'],
      ['service-overdue', 'T-405 service overdue', 'danger'],
      ['rego', 'T-405 registration expired', 'danger'],
      ['rego', 'C-101 registration due', 'warning'],
      ['insurance', 'C-101 insurance due', 'warning'],
    ]);
    expect(items[0]).toMatchObject({ detail: 'BK-7 · Liam Walsh · due back 2 days ago', to: '/bookings/b1' });
    expect(items[2].detail).toBe('Heavy Vehicle Service was due 9 days ago');
    expect(items[4].detail).toBe('Registration due in 13 days · DH55PL');
  });

  it('says when, in days', () => {
    expect(inDays(at(10, 18), NOW)).toBe('today');
    expect(inDays(at(11, 1), NOW)).toBe('tomorrow');
    expect(inDays(at(3), NOW)).toBe('7 days ago');
  });
});
