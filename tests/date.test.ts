import { describe, it, expect } from 'vitest';
import { isISODate, parseISODate, shiftISODate, todayISO } from '../utils/date';

describe('isISODate', () => {
  it('accepts a real calendar date', () => {
    expect(isISODate('2026-08-11')).toBe(true);
    expect(isISODate('2024-02-29')).toBe(true);
  });

  it('rejects dates that do not exist', () => {
    expect(isISODate('2026-02-30')).toBe(false);
    expect(isISODate('2025-02-29')).toBe(false);
    expect(isISODate('2026-13-01')).toBe(false);
  });

  it('rejects anything that is not YYYY-MM-DD', () => {
    expect(isISODate('11/08/2026')).toBe(false);
    expect(isISODate('2026-8-1')).toBe(false);
    expect(isISODate('')).toBe(false);
    expect(isISODate(undefined)).toBe(false);
    expect(isISODate(20260811)).toBe(false);
  });
});

describe('parseISODate', () => {
  it('parses to local midnight, not UTC midnight', () => {
    const d = parseISODate('2026-08-11')!;
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(7);
    expect(d.getDate()).toBe(11);
    expect(d.getHours()).toBe(0);
  });

  it('returns null rather than an Invalid Date', () => {
    expect(parseISODate('not-a-date')).toBeNull();
    expect(parseISODate('2026-02-30')).toBeNull();
  });
});

describe('shiftISODate', () => {
  // The regression this exists for: `new Date('YYYY-MM-DD')` parses as UTC midnight
  // while getDate/setDate work in local time, so subtracting a day and converting
  // back with toISOString landed a day early in any timezone ahead of UTC.
  it('steps back exactly one calendar day', () => {
    expect(shiftISODate('2026-08-11', -1)).toBe('2026-08-10');
  });

  it('crosses a month boundary', () => {
    expect(shiftISODate('2026-08-01', -1)).toBe('2026-07-31');
    expect(shiftISODate('2026-07-31', 1)).toBe('2026-08-01');
  });

  it('crosses a year boundary', () => {
    expect(shiftISODate('2026-01-01', -1)).toBe('2025-12-31');
  });

  it('handles a leap day', () => {
    expect(shiftISODate('2024-03-01', -1)).toBe('2024-02-29');
    expect(shiftISODate('2025-03-01', -1)).toBe('2025-02-28');
  });

  it('is the identity for a zero shift', () => {
    expect(shiftISODate('2026-08-11', 0)).toBe('2026-08-11');
  });

  it('leaves an unparseable value untouched', () => {
    expect(shiftISODate('rubbish', -1)).toBe('rubbish');
  });

  it('round-trips against today', () => {
    const today = todayISO();
    expect(shiftISODate(shiftISODate(today, -1), 1)).toBe(today);
  });
});
