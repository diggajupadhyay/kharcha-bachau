import { describe, it, expect } from 'vitest';
import {
  calculateEqualShares, buildEqualSplit, rebalanceEqualSplit,
  isSplitSumValid, splitParticipantIds, round2,
} from '../split';
import type { Split, SplitParticipant } from '../types';

const sum = (xs: number[]) => round2(xs.reduce((a, b) => a + b, 0));

describe('calculateEqualShares', () => {
  it('splits evenly when the division is exact', () => {
    expect(calculateEqualShares(300, 3)).toEqual([100, 100, 100]);
    expect(calculateEqualShares(100, 2)).toEqual([50, 50]);
  });

  // The whole reason this does not use round2(total / count): 100/3 is 33.333…
  // and 33.33 x 3 = 99.99, a cent short of the expense.
  it('never loses or invents a cent when the division is inexact', () => {
    const cases: Array<[number, number]> = [
      [100, 3], [10, 3], [1000, 7], [1, 3], [99.99, 7], [123.45, 6], [5, 4],
    ];
    for (const [total, count] of cases) {
      const shares = calculateEqualShares(total, count);
      expect(shares).toHaveLength(count);
      expect(sum(shares)).toBe(round2(total));
    }
  });

  it('is deterministic, so re-opening an expense never reshuffles the cent', () => {
    expect(calculateEqualShares(100, 3)).toEqual(calculateEqualShares(100, 3));
    expect(calculateEqualShares(100, 3)).toEqual([33.34, 33.33, 33.33]);
  });

  it('handles a single participant', () => {
    expect(calculateEqualShares(42.42, 1)).toEqual([42.42]);
  });

  it('gives the leftover cents to the earliest participants', () => {
    // 0.02 across 3 people: two get a cent, the third gets nothing.
    expect(calculateEqualShares(0.02, 3)).toEqual([0.01, 0.01, 0]);
  });

  it('returns nothing for a non-positive count rather than dividing by zero', () => {
    expect(calculateEqualShares(100, 0)).toEqual([]);
    expect(calculateEqualShares(100, -3)).toEqual([]);
  });

  it('returns nothing for a non-finite total', () => {
    expect(calculateEqualShares(NaN, 3)).toEqual([]);
    expect(calculateEqualShares(Infinity, 3)).toEqual([]);
  });

  it('handles zero', () => {
    expect(calculateEqualShares(0, 3)).toEqual([0, 0, 0]);
  });
});

describe('buildEqualSplit', () => {
  const members = [
    { userId: 'u1', userName: 'Asha' },
    { userId: 'u2', userName: 'Bikash' },
    { userId: 'u3', userName: 'Chandra' },
  ];

  it('creates one participant per member and records the payer', () => {
    const split = buildEqualSplit(300, members, 'u1')!;
    expect(split.splitType).toBe('equal');
    expect(split.paidBy).toBe('u1');
    expect(split.participants).toHaveLength(3);
    expect(split.settlements).toEqual([]);
  });

  it('produces a split that passes its own sum check', () => {
    expect(isSplitSumValid(buildEqualSplit(1000, members, 'u1')!, 1000)).toBe(true);
  });

  it('returns null with nobody to split between', () => {
    expect(buildEqualSplit(100, [], 'u1')).toBeNull();
  });
});

describe('rebalanceEqualSplit', () => {
  const members = [
    { userId: 'u1', userName: 'Asha' },
    { userId: 'u2', userName: 'Bikash' },
    { userId: 'u3', userName: 'Chandra' },
  ];

  it('redistributes when the amount changes, keeping names and payer', () => {
    const before = buildEqualSplit(300, members, 'u1')!;
    const after = rebalanceEqualSplit(before, 1000);
    expect(after.paidBy).toBe('u1');
    expect(after.participants.map(p => p.userName)).toEqual(['Asha', 'Bikash', 'Chandra']);
    expect(sum(after.participants.map(p => p.amount))).toBe(1000);
  });

  it('redistributes when a participant is added, and still sums to the total', () => {
    const before = buildEqualSplit(100, members.slice(0, 2), 'u1')!;
    const withThird: Split = {
      ...before,
      participants: [
        ...before.participants,
        { userId: 'u3', userName: 'Chandra', amount: 0 } as SplitParticipant,
      ],
    };
    const after = rebalanceEqualSplit(withThird, 100);
    expect(after.participants).toHaveLength(3);
    expect(sum(after.participants.map(p => p.amount))).toBe(100);
  });

  // Editing a settled expense must not lose the settlement record, or the debt
  // silently reappears as unpaid.
  it('preserves settlement history across a rebalance', () => {
    const before = buildEqualSplit(100, members, 'u1')!;
    const settled: Split = {
      ...before,
      settlements: [{ fromUserId: 'u2', toUserId: 'u1', amount: 33.33, settledAt: 1, settledBy: 'u1' }],
    };
    expect(rebalanceEqualSplit(settled, 200).settlements).toEqual(settled.settlements);
  });
});

describe('isSplitSumValid', () => {
  const p = (amount: number): SplitParticipant => ({ userId: 'u', userName: 'U', amount });

  it('accepts an exact sum', () => {
    expect(isSplitSumValid({ splitType: 'equal', participants: [p(50), p(50)], paidBy: 'u' }, 100)).toBe(true);
  });

  it('accepts a sum within a cent of float drift', () => {
    const split = { splitType: 'equal' as const, participants: [p(33.33), p(33.33), p(33.33)], paidBy: 'u' };
    expect(isSplitSumValid(split, 100)).toBe(true);
  });

  it('rejects a sum that is genuinely short', () => {
    const split = { splitType: 'equal' as const, participants: [p(33.33), p(33.33), p(33.33)], paidBy: 'u' };
    expect(isSplitSumValid(split, 200)).toBe(false);
  });

  it('treats a missing participant list as zero', () => {
    expect(isSplitSumValid(undefined, 0)).toBe(true);
    expect(isSplitSumValid(undefined, 100)).toBe(false);
  });
});

describe('splitParticipantIds', () => {
  it('reads back who is on a split, for pre-selecting members', () => {
    const split = buildEqualSplit(100, [{ userId: 'u1', userName: 'A' }, { userId: 'u2', userName: 'B' }], 'u1')!;
    expect(splitParticipantIds(split)).toEqual(['u1', 'u2']);
  });

  it('is empty for an unsplit expense', () => {
    expect(splitParticipantIds(undefined)).toEqual([]);
  });
});
