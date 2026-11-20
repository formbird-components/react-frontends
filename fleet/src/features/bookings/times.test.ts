import { describe, expect, it } from 'vitest';
import { clickRange, dayScrollTarget, defaultRange, dragRange, durationText, endAfter, estimateCost, lengthText, moveStart, ratesText, slotOf, untilFivePm } from './times';

const H = 3_600_000;
const M = 60_000;
const local = (y: number, m: number, d: number, h = 0, min = 0) => new Date(y, m - 1, d, h, min).getTime();
const iso = (t: number) => new Date(t).toISOString();

describe('booking times', () => {
  it('starts a new booking at the next half hour, for two hours', () => {
    expect(defaultRange(local(2026, 11, 10, 9, 12))).toEqual({ start: iso(local(2026, 11, 10, 9, 30)), end: iso(local(2026, 11, 10, 11, 30)) });
    expect(defaultRange(local(2026, 11, 10, 9, 30)).start).toBe(iso(local(2026, 11, 10, 9, 30)));
  });

  it('sets ends from quick durations and "until 5 pm"', () => {
    const start = iso(local(2026, 11, 10, 9));
    expect(endAfter(start, 4)).toBe(iso(local(2026, 11, 10, 13)));
    expect(untilFivePm(start)).toBe(iso(local(2026, 11, 10, 17)));
    expect(untilFivePm(iso(local(2026, 11, 10, 17)))).toBe(iso(local(2026, 11, 11, 17)));
  });

  it('keeps the length when the start moves', () => {
    const moved = moveStart(iso(local(2026, 11, 10, 9)), iso(local(2026, 11, 10, 12)), iso(local(2026, 11, 11, 8)));
    expect(moved).toEqual({ start: iso(local(2026, 11, 11, 8)), end: iso(local(2026, 11, 11, 11)) });
    // No valid end yet: the default two hours.
    expect(moveStart(undefined, undefined, iso(local(2026, 11, 11, 8))).end).toBe(iso(local(2026, 11, 11, 10)));
  });

  it('says how long', () => {
    expect(lengthText(2 * H)).toBe('2 h');
    expect(lengthText(2.5 * H)).toBe('2 h 30 min');
    expect(lengthText(45 * M)).toBe('45 min');
    expect(lengthText(28 * H)).toBe('1 d 4 h');
    expect(lengthText(48 * H)).toBe('2 d');
    expect(lengthText(-H)).toBe('');
    expect(durationText(iso(local(2026, 11, 10, 9)), iso(local(2026, 11, 10, 10, 15)))).toBe('1 h 15 min');
  });

  it('estimates the hire cost as the server works it out', () => {
    const rates = { hireRateHourly: 18, hireRateDaily: 110 };
    // Tuesday 9:00–11:00 in Sydney: 2 h × $18.
    expect(estimateCost(rates, '2026-11-09T22:00:00Z', '2026-11-10T00:00:00Z')).toBe(36);
    // A whole weekday is capped at the daily rate.
    expect(estimateCost(rates, '2026-11-09T21:00:00Z', '2026-11-10T07:00:00Z')).toBe(110);
    // Saturday is free.
    expect(estimateCost(rates, '2026-11-13T22:00:00Z', '2026-11-14T02:00:00Z')).toBe(0);
    expect(estimateCost(undefined, '2026-11-09T22:00:00Z', '2026-11-10T00:00:00Z')).toBeUndefined();
    expect(estimateCost(rates, undefined, '2026-11-10T00:00:00Z')).toBeUndefined();
    expect(ratesText(rates)).toBe('$18/h, $110/day');
    expect(ratesText({ hireRateDaily: 90 })).toBe('$90/day');
  });
});

describe('dragging on the calendar', () => {
  const window = { start: local(2026, 11, 10), end: local(2026, 11, 11) };

  it('snaps to half hours, either way, inside the window', () => {
    expect(slotOf(local(2026, 11, 10, 9, 44))).toBe(local(2026, 11, 10, 9, 30));
    expect(dragRange(local(2026, 11, 10, 9, 10), local(2026, 11, 10, 11, 5), window)).toEqual({ start: local(2026, 11, 10, 9), end: local(2026, 11, 10, 11, 30) });
    expect(dragRange(local(2026, 11, 10, 11, 5), local(2026, 11, 10, 9, 10), window)).toEqual({ start: local(2026, 11, 10, 9), end: local(2026, 11, 10, 11, 30) });
    expect(dragRange(local(2026, 11, 10, 23, 40), local(2026, 11, 11, 2), window).end).toBe(window.end);
  });

  it('picks two hours on a click, stopping at the next booking', () => {
    expect(clickRange(local(2026, 11, 10, 9, 10), window)).toEqual({ start: local(2026, 11, 10, 9), end: local(2026, 11, 10, 11) });
    expect(clickRange(local(2026, 11, 10, 9, 10), window, local(2026, 11, 10, 10))).toEqual({ start: local(2026, 11, 10, 9), end: local(2026, 11, 10, 10) });
    expect(clickRange(local(2026, 11, 10, 23, 40), window).end).toBe(window.end);
  });

  it('scrolls the day to 7 am, or to an hour before now later today', () => {
    const day = local(2026, 11, 10);
    expect(dayScrollTarget(day, local(2026, 11, 9, 14))).toBe(local(2026, 11, 10, 7));
    expect(dayScrollTarget(day, local(2026, 11, 10, 6))).toBe(local(2026, 11, 10, 7));
    expect(dayScrollTarget(day, local(2026, 11, 10, 13))).toBe(local(2026, 11, 10, 12));
    expect(dayScrollTarget(day, local(2026, 11, 10, 22))).toBe(local(2026, 11, 10, 16));
  });
});
