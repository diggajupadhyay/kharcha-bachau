import { describe, it, expect } from 'vitest';
import { calculateMemberBalances } from '../utils/balances';
import type { Wallet, Expense, SplitDetails } from '../types';

const wallet: Wallet = {
  id: 'w1',
  name: 'Wallet',
  ownerId: 'u1',
  members: ['u1', 'u2', 'u3'],
  currency: 'Rs.',
  createdAt: 1,
  isPersonal: false
};

const split = (paidBy: string, participants: Array<{ userId: string; amount: number }>, settlements: Array<{ fromUserId: string; toUserId: string; amount: number }> = []): SplitDetails => ({
  splitType: 'equal',
  paidBy,
  participants,
  settlements
});

const expense = (id: string, amount: number, splitDetails?: SplitDetails): Expense => ({
  id,
  walletId: 'w1',
  categoryId: 'food',
  categoryName: 'Food',
  categoryEmoji: '🍔',
  amount,
  note: '',
  date: '2024-01-01',
  createdBy: { uid: 'u1', name: 'U1' },
  createdAt: 1,
  ...(splitDetails ? { splitDetails } : {})
});

describe('calculateMemberBalances', () => {
  it('returns zeros for all members when there are no split expenses', () => {
    const balances = calculateMemberBalances(wallet, [expense('1', 100)]);
    expect(balances).toEqual({ u1: 0, u2: 0, u3: 0 });
  });

  it('credits the payer and debits each participant', () => {
    // u1 pays 100, split equally between u1, u2, u3 (33.34 each).
    // u1's net = paid 100 - own share 33.34 = what u2+u3 owe them (66.66).
    const balances = calculateMemberBalances(wallet, [
      expense('1', 100, split('u1', [
        { userId: 'u1', amount: 33.34 },
        { userId: 'u2', amount: 33.33 },
        { userId: 'u3', amount: 33.33 }
      ]))
    ]);
    expect(balances.u1).toBeCloseTo(100 - 33.34, 5);
    expect(balances.u2).toBeCloseTo(-33.33, 5);
    expect(balances.u3).toBeCloseTo(-33.33, 5);
  });

  it('a settled debt reduces the payer instead of debiting the participant', () => {
    const balances = calculateMemberBalances(wallet, [
      expense('1', 100, split('u1', [
        { userId: 'u1', amount: 50 },
        { userId: 'u2', amount: 50 }
      ], [
        { fromUserId: 'u2', toUserId: 'u1', amount: 50, settledAt: 1, settledBy: 'u2' }
      ]))
    ]);
    // u1 paid 100, less own share 50, less settlement received 50 -> 0. u2 settled -> 0.
    expect(balances.u1).toBe(0);
    expect(balances.u2).toBe(0);
  });

  it('ignores members not in the wallet', () => {
    const balances = calculateMemberBalances(wallet, [
      expense('1', 100, split('u1', [
        { userId: 'u1', amount: 50 },
        { userId: 'ghost', amount: 50 }
      ]))
    ]);
    expect(balances.u1).toBeCloseTo(50, 5);
    expect(balances).not.toHaveProperty('ghost');
  });

  it('returns empty object when wallet is null', () => {
    expect(calculateMemberBalances(null, [expense('1', 100, split('u1', [{ userId: 'u1', amount: 100 }]))])).toEqual({});
  });

  it('rounds floating-point drift to 2 decimals', () => {
    const balances = calculateMemberBalances(wallet, [
      expense('1', 0.1, split('u1', [{ userId: 'u2', amount: 0.1 }])),
      expense('2', 0.2, split('u1', [{ userId: 'u2', amount: 0.2 }]))
    ]);
    // u2 = -(0.1 + 0.2) = -0.3 exactly after rounding
    expect(balances.u2).toBe(-0.3);
  });
});
