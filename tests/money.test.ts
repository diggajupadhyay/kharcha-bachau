import { describe, it, expect } from 'vitest';
import { getCurrencySymbol } from '../utils/currencyFormatter';
import { isSplitSumValid } from '../utils/split';
import type { SplitDetails } from '../types';

describe('getCurrencySymbol', () => {
  it('returns the app currency symbol', () => {
    expect(getCurrencySymbol()).toBe('Rs.');
  });
});

describe('isSplitSumValid', () => {
  const build = (participants: Array<{ userId: string; amount: number }>): SplitDetails => ({
    splitType: 'equal',
    paidBy: 'u1',
    participants
  });

  it('passes when shares sum to the total', () => {
    expect(isSplitSumValid(build([
      { userId: 'u1', amount: 50 },
      { userId: 'u2', amount: 50 }
    ]), 100)).toBe(true);
  });

  it('passes within floating-point tolerance', () => {
    expect(isSplitSumValid(build([
      { userId: 'u1', amount: 33.34 },
      { userId: 'u2', amount: 33.33 },
      { userId: 'u3', amount: 33.33 }
    ]), 100)).toBe(true);
  });

  it('fails when shares do not match the total', () => {
    expect(isSplitSumValid(build([
      { userId: 'u1', amount: 40 },
      { userId: 'u2', amount: 50 }
    ]), 100)).toBe(false);
  });
});
