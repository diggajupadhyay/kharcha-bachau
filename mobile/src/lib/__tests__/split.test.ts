import { describe, it, expect } from 'vitest';
import { isSplitSumValid } from '../split';
import type { SplitDetails } from '../types';

/**
 * The cent-distribution used by AddExpenseModal and by StoreContext.updateExpense.
 * Mirrored here so the invariant both of them rely on — shares add up to the total
 * exactly, never off by a rounding paisa — is pinned by a test.
 */
const distribute = (total: number, n: number): number[] => {
  const totalCents = Math.round(total * 100);
  const baseCents = Math.floor(totalCents / n);
  let remainder = totalCents - baseCents * n;
  return Array.from({ length: n }, () => {
    const cents = baseCents + (remainder > 0 ? 1 : 0);
    if (remainder > 0) remainder -= 1;
    return cents / 100;
  });
};

const asSplit = (shares: number[]): SplitDetails => ({
  splitType: 'equal',
  paidBy: 'u0',
  participants: shares.map((amount, i) => ({ userId: `u${i}`, userName: `U${i}`, amount }))
});

describe('equal split distribution', () => {
  it('sums to the total for the classic 100/3 case', () => {
    const shares = distribute(100, 3);
    expect(shares).toEqual([33.34, 33.33, 33.33]);
    expect(shares.reduce((a, b) => a + b, 0)).toBeCloseTo(100, 10);
  });

  it('never loses or invents a paisa across a wide sweep', () => {
    for (let n = 2; n <= 8; n++) {
      for (let cents = 1; cents <= 20000; cents++) {
        const total = cents / 100;
        const shares = distribute(total, n);
        const sumCents = shares.reduce((a, b) => a + Math.round(b * 100), 0);
        expect(sumCents).toBe(cents);
      }
    }
  });

  it('produces shares the validator accepts', () => {
    for (let n = 2; n <= 8; n++) {
      for (const total of [0.01, 0.07, 1, 9.99, 100, 1234.56, 99999.99]) {
        expect(isSplitSumValid(asSplit(distribute(total, n)), total)).toBe(true);
      }
    }
  });

  it('spreads the remainder one paisa at a time, never more', () => {
    const shares = distribute(10, 3);
    const max = Math.max(...shares);
    const min = Math.min(...shares);
    expect(Math.round((max - min) * 100)).toBe(1);
  });
});
