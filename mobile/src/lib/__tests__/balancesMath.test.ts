import { describe, it, expect } from 'vitest';
import { calculateMemberBalances, simplifyDebts, isFullySettled } from '../balances';
import { buildEqualSplit } from '../split';
import type { Expense, Wallet } from '../types';

const wallet = (...members: string[]): Wallet => ({
  id: 'w1', name: 'Trip', ownerId: 'a', members, currency: 'Rs.', createdAt: 1,
});

const splitExpense = (
  amount: number,
  memberIds: string[],
  paidBy: string,
  settlements: NonNullable<Expense['splitDetails']>['settlements'] = []
): Expense => ({
  id: `e-${amount}-${memberIds.join('')}`,
  categoryId: 'food', categoryName: 'Food', categoryEmoji: '🍔',
  amount, note: '', date: '2026-01-01', walletId: 'w1',
  createdBy: { uid: paidBy, name: 'Payer' }, createdAt: 1,
  splitDetails: buildEqualSplit(amount, memberIds.map(id => ({ userId: id, userName: id })), paidBy)
    ? { ...buildEqualSplit(amount, memberIds.map(id => ({ userId: id, userName: id })), paidBy)!, settlements }
    : undefined,
});

describe('calculateMemberBalances', () => {
  it('gives everyone zero with no split expenses', () => {
    expect(calculateMemberBalances(wallet('a', 'b'), [])).toEqual({ a: 0, b: 0 });
  });

  it('ignores unsplit expenses entirely', () => {
    const plain: Expense = { ...splitExpense(100, ['a'], 'a')!, splitDetails: undefined };
    expect(calculateMemberBalances(wallet('a', 'b'), [plain])).toEqual({ a: 0, b: 0 });
  });

  it('charges the payer the full amount and debits only the others', () => {
    // a pays 300, split 3 ways: a owes 100 of their own money.
    const b = calculateMemberBalances(wallet('a', 'b', 'c'), [splitExpense(300, ['a', 'b', 'c'], 'a')]);
    expect(b).toEqual({ a: 200, b: -100, c: -100 });
  });

  it('always sums to zero', () => {
    const balances = calculateMemberBalances(wallet('a', 'b', 'c'), [
      splitExpense(300, ['a', 'b', 'c'], 'a'),
      splitExpense(1000, ['b', 'c'], 'b'),
      splitExpense(7.77, ['a', 'b', 'c'], 'c'),
    ]);
    const total = Object.values(balances).reduce((s, v) => s + v, 0);
    expect(Math.abs(total)).toBeLessThan(0.01);
  });

  it('excludes the payer from the debited participants when they are not in the split', () => {
    // b pays for a and c but is not counted as a participant — b is owed nothing
    // back and is out 200 for the group.
    const b = calculateMemberBalances(wallet('a', 'b', 'c'), [splitExpense(200, ['a', 'c'], 'b')]);
    expect(b).toEqual({ a: -100, b: 200, c: -100 });
  });

  it('drops the payer credit once every participant has settled', () => {
    const settled = [
      { fromUserId: 'b', toUserId: 'a', amount: 100, settledAt: 1, settledBy: 'a' },
      { fromUserId: 'c', toUserId: 'a', amount: 100, settledAt: 1, settledBy: 'a' },
    ];
    // a is also a participant owing their own 100 share, which they will never
    // recover — they ate it. So once b and c repay, every balance is zero.
    const b = calculateMemberBalances(wallet('a', 'b', 'c'), [splitExpense(300, ['a', 'b', 'c'], 'a', settled)]);
    expect(b).toEqual({ a: 0, b: 0, c: 0 });
  });

  it('still credits the payer for their own uncovered share', () => {
    // b and c have paid up, but a owes 100 of their own share. Before settlement
    // a was credited 200 (what b and c owed); the settled shares cancel exactly
    // that, leaving nothing — and b's -100 is what a advanced on b's behalf.
    const partial = [{ fromUserId: 'b', toUserId: 'a', amount: 100, settledAt: 1, settledBy: 'a' }];
    const b = calculateMemberBalances(wallet('a', 'b', 'c'), [splitExpense(300, ['a', 'b', 'c'], 'a', partial)]);
    expect(b).toEqual({ a: 100, b: 0, c: -100 });
  });

  // Keys the cancellation off the CURRENT share, not the amount recorded on the
  // settlement. Reading the stale figure would leave 900 - 450 - 100 = 350
  // stranded on a's balance, which no UI would ever explain.
  it('re-derives a settled share from the current amount, not the recorded one', () => {
    const settled = [{ fromUserId: 'b', toUserId: 'a', amount: 100, settledAt: 1, settledBy: 'a' }];
    const b = calculateMemberBalances(wallet('a', 'b'), [splitExpense(900, ['a', 'b'], 'a', settled)]);
    expect(b).toEqual({ a: 0, b: 0 });
  });

  // The bug this function shipped with: a departed member's debt vanished while
  // the payer kept the full credit, so the books stopped summing to zero and the
  // remaining members saw money owed to them by nobody.
  it('keeps a departed member on the books instead of losing their debt', () => {
    const b = calculateMemberBalances(wallet('a'), [splitExpense(200, ['a', 'b'], 'a')]);
    expect(b.b).toBe(-100);
    expect(Object.values(b).reduce((s, v) => s + v, 0)).toBeCloseTo(0, 2);
  });

  it('survives a split naming people who are in neither members nor the wallet', () => {
    const b = calculateMemberBalances(null, [splitExpense(100, ['x', 'y'], 'x')]);
    expect(b).toEqual({ x: 50, y: -50 });
  });

  it('ignores a malformed split instead of throwing', () => {
    const bad = {
      ...splitExpense(100, ['a'], 'a'),
      splitDetails: { splitType: 'equal', participants: [], paidBy: 'a' },
    } as Expense;
    expect(calculateMemberBalances(wallet('a'), [bad])).toEqual({ a: 0 });
  });

  it('rounds to 2dp', () => {
    const b = calculateMemberBalances(wallet('a', 'b', 'c'), [splitExpense(0.01, ['a', 'b', 'c'], 'a')]);
    Object.values(b).forEach(v => expect(v).toBe(round2Check(v)));
  });
});

const round2Check = (v: number) => Math.round(v * 100) / 100;

describe('simplifyDebts', () => {
  it('is empty when everyone is square', () => {
    expect(simplifyDebts({ a: 0, b: 0 })).toEqual([]);
  });

  it('produces one payment for one debt', () => {
    expect(simplifyDebts({ a: 100, b: -100 })).toEqual([
      { fromUserId: 'b', toUserId: 'a', amount: 100 },
    ]);
  });

  it('nets a chain down to a single payment instead of two', () => {
    // a is owed 100 by b and owes 100 to c. Direct settlement is 2 transfers;
    // netting is 1.
    const t = simplifyDebts({ a: 0, b: -100, c: 100 });
    expect(t).toEqual([{ fromUserId: 'b', toUserId: 'c', amount: 100 }]);
  });

  it('never asks anyone to pay more than they owe', () => {
    const balances: Record<string, number> = { a: -30, b: -20, c: 50 };
    const transfers = simplifyDebts(balances);
    const paid: Record<string, number> = {};
    const owed: Record<string, number> = {};
    for (const t of transfers) {
      paid[t.fromUserId] = (paid[t.fromUserId] ?? 0) + t.amount;
      owed[t.toUserId] = (owed[t.toUserId] ?? 0) + t.amount;
    }
    for (const [id, amount] of Object.entries(paid)) {
      expect(round2Check(amount)).toBeLessThanOrEqual(-balances[id] + 0.01);
    }
    for (const [id, amount] of Object.entries(owed)) {
      expect(round2Check(amount)).toBeLessThanOrEqual(balances[id] + 0.01);
    }
  });

  it('clears every debt exactly, with no fraction of a cent stranded', () => {
    // Sums to exactly zero. A fixture that did not would be asking simplifyDebts
    // to conjure money out of nothing.
    const balances = { a: -33.33, b: -33.33, c: 66.66, d: 10.1, e: -10.1 };
    expect(round2Check(Object.values(balances).reduce((s, v) => s + v, 0))).toBe(0);

    const transfers = simplifyDebts(balances);
    const net: Record<string, number> = {};
    // Net cash flow: a debtor pays out, a creditor receives. This must land on
    // the balance — negative means still owed, positive means still owed to you.
    for (const t of transfers) {
      net[t.fromUserId] = (net[t.fromUserId] ?? 0) - t.amount;
      net[t.toUserId] = (net[t.toUserId] ?? 0) + t.amount;
    }
    for (const [id, balance] of Object.entries(balances)) {
      expect(round2Check(net[id] ?? 0)).toBeCloseTo(balance, 2);
    }
  });

  it('converges on an input with no clean halves', () => {
    const balances = { a: -0.01, b: -0.01, c: 0.01, d: 0.01 };
    const transfers = simplifyDebts(balances);
    const net: Record<string, number> = {};
    // Net cash flow: a debtor pays out, a creditor receives. This must land on
    // the balance — negative means still owed, positive means still owed to you.
    for (const t of transfers) {
      net[t.fromUserId] = (net[t.fromUserId] ?? 0) - t.amount;
      net[t.toUserId] = (net[t.toUserId] ?? 0) + t.amount;
    }
    for (const [id, balance] of Object.entries(balances)) {
      expect(round2Check(net[id] ?? 0)).toBeCloseTo(balance, 2);
    }
  });

  it('stays within debtors + creditors - 1 transfers', () => {
    const balances: Record<string, number> = { a: -10, b: -20, c: -30, d: 15, e: 20, f: 25 };
    const transfers = simplifyDebts(balances);
    const debtors = Object.values(balances).filter(v => v < 0).length;
    const creditors = Object.values(balances).filter(v => v > 0).length;
    expect(transfers.length).toBeLessThanOrEqual(debtors + creditors - 1);
  });

  it('ignores sub-cent residue', () => {
    expect(simplifyDebts({ a: 0.001, b: -0.001 })).toEqual([]);
  });

  it('handles a single member who owes nobody', () => {
    expect(simplifyDebts({ a: 50 })).toEqual([]);
  });
});

describe('isFullySettled', () => {
  it('is true only when nothing is owed', () => {
    expect(isFullySettled({ a: 0, b: 0 })).toBe(true);
    expect(isFullySettled({ a: 0, b: -0.001 })).toBe(true);
    expect(isFullySettled({ a: 0, b: -100 })).toBe(false);
  });
});
