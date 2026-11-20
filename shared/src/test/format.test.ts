import { describe, expect, it } from 'vitest';
import { daysUntil, dueText, fromInputs, hours, relative, toDate, toDateInput, toTimeInput } from '../format';

describe('format', () => {
  it('reads stored dates', () => {
    expect(toDate('')).toBeUndefined();
    expect(toDate('nonsense')).toBeUndefined();
    expect(toDate(0)?.getTime()).toBe(0);
  });

  it('round-trips date and time inputs', () => {
    const iso = fromInputs('2026-11-04', '09:30')!;
    expect(toDateInput(iso)).toBe('2026-11-04');
    expect(toTimeInput(iso)).toBe('09:30');
    expect(fromInputs('', '09:30')).toBeUndefined();
  });

  it('says how far away a time is', () => {
    const now = Date.UTC(2026, 10, 11, 12);
    expect(relative(now + 30_000, now)).toBe('just now');
    expect(relative(now - 2 * 3_600_000, now)).toBe('2 hours ago');
    expect(relative(now + 3 * 86_400_000, now)).toBe('in 3 days');
    expect(daysUntil(now, now)).toBe(0);
  });

  it('describes due dates and durations', () => {
    expect(dueText(new Date())).toBe('Due today');
    expect(hours(5)).toBe('5 h');
    expect(hours(2.5)).toBe('2.5 h');
    expect(hours(76)).toBe('3 d 4 h');
  });
});
