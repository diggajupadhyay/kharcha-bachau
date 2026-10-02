import { describe, it, expect } from 'vitest';
import { planSettlement, settlementFor } from '../settlement';
import { buildEqualSplit } from '../split';
import type { Expense } from '../types';

const split = (
  id: string,
  amount: number,
  payer: string,
  people: string[],
  opts: { date?: string; createdAt?: number; settled?: boolean } = {}
): Expense => {
  const details = buildEqualSplit(
    amount,
    people.map(p => ({ userId: p, userName: p })),
    payer
  )!;
  return {
    id,
    categoryId: 'food', categoryName: 'Food', categoryEmoji: '🍔',
    amount, note: '', date: opts.date ?? '2026-01-01',
    walletId: 'w1', createdBy: { uid: payer, name: payer },
    createdAt: opts.createdAt ?? 0,
    splitDetails: {
      ...details,
      settlements: opts.settled ? [settlementFor('b', payer, amount / people.length, payer, 1)] : [],
    },
  };
};

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

describe('planSettlement', () => {
  it('does nothing when nobody owes anything', () => {
    const plan = planSettlement([split('e1', 100, 'a', ['a', 'b'])], 'b', 'a', 0);
    expect(plan.updates).toEqual([]);
    expect(plan.unsettled).toBe(0);
  });

  it('marks the single expense behind the debt', () => {
    const plan = planSettlement([split('e1', 100, 'a', ['a', 'b'])], 'b', 'a', 50);
    expect(plan.updates).toHaveLength(1);
    expect(plan.updates[0].expense.id).toBe('e1');
    expect(plan.updates[0].share).toBe(50);
    expect(plan.unsettled).toBe(0);
  });

  // The bug this replaced: the local path walked oldest-first while the cloud path
  // walked raw list order, so the same debt settled against different expenses.
  it('settles the oldest debts first, regardless of list order', () => {
    const expenses = [
      split('new', 100, 'a', ['a', 'b'], { date: '2026-03-01', createdAt: 3 }),
      split('old', 100, 'a', ['a', 'b'], { date: '2026-01-01', createdAt: 1 }),
      split('mid', 100, 'a', ['a', 'b'], { date: '2026-02-01', createdAt: 2 }),
    ];
    // Each share is 50 (100 split two ways), so 50 due settles only the oldest.
    const plan = planSettlement(expenses, 'b', 'a', 50);
    expect(plan.updates.map(u => u.expense.id)).toEqual(['old']);
  });

  it('breaks date ties by insertion order, so the plan is stable', () => {
    const expenses = [
      split('b2', 100, 'a', ['a', 'b'], { date: '2026-01-01', createdAt: 2 }),
      split('b1', 100, 'a', ['a', 'b'], { date: '2026-01-01', createdAt: 1 }),
    ];
    expect(planSettlement(expenses, 'b', 'a', 50).updates[0].expense.id).toBe('b1');
  });

  it('covers a debt spanning several expenses', () => {
    const expenses = [
      split('e1', 100, 'a', ['a', 'b'], { date: '2026-01-01' }),
      split('e2', 200, 'a', ['a', 'b'], { date: '2026-02-01' }),
    ];
    // 50 + 100 = 150 owed
    const plan = planSettlement(expenses, 'b', 'a', 150);
    expect(plan.updates.map(u => u.expense.id)).toEqual(['e1', 'e2']);
    expect(plan.unsettled).toBe(0);
  });

  it('ignores expenses this person is not part of', () => {
    const expenses = [split('e1', 100, 'a', ['a', 'c'])];
    expect(planSettlement(expenses, 'b', 'a', 50).updates).toEqual([]);
  });

  it('ignores expenses paid by someone else', () => {
    const expenses = [split('e1', 100, 'c', ['a', 'b'])];
    expect(planSettlement(expenses, 'b', 'a', 50).updates).toEqual([]);
  });

  it('skips a share that is already settled', () => {
    const expenses = [
      split('done', 100, 'a', ['a', 'b'], { settled: true }),
      split('open', 100, 'a', ['a', 'b'], { date: '2026-02-01' }),
    ];
    const plan = planSettlement(expenses, 'b', 'a', 50);
    expect(plan.updates.map(u => u.expense.id)).toEqual(['open']);
  });

  it('leaves a remainder rather than over-settling', () => {
    // 100 split three ways: b owes 33.33. Offer only 20, which cannot cover a whole
    // share, and nothing may be marked paid.
    const e = split('e1', 100, 'a', ['a', 'b', 'c']);
    const bShare = e.splitDetails!.participants.find(p => p.userId === 'b')!.amount;
    const plan = planSettlement([e], 'b', 'a', 20);
    expect(plan.updates).toEqual([]);
    expect(plan.unsettled).toBe(20);
    expect(bShare).toBeGreaterThan(20);
  });

  it('reports the remainder when the debt spans more than the shares available', () => {
    const expenses = [split('e1', 100, 'a', ['a', 'b'])];
    const plan = planSettlement(expenses, 'b', 'a', 200);
    expect(plan.updates).toHaveLength(1);
    expect(plan.unsettled).toBe(150);
  });

  it('never settles more than is owed', () => {
    const expenses = [
      split('e1', 100, 'a', ['a', 'b'], { date: '2026-01-01' }),
      split('e2', 100, 'a', ['a', 'b'], { date: '2026-02-01' }),
    ];
    const plan = planSettlement(expenses, 'b', 'a', 50);
    expect(sum(plan.updates.map(u => u.share))).toBeLessThanOrEqual(50);
  });

  it('handles three-way splits with an inexact share', () => {
    // 100 across 3 people is 33.34/33.33/33.33 — the shares must still sum right.
    const e = split('e1', 100, 'a', ['a', 'b', 'c']);
    expect(sum(e.splitDetails!.participants.map(p => p.amount))).toBe(100);
    const plan = planSettlement([e], 'b', 'a', e.splitDetails!.participants[1].amount);
    expect(plan.updates).toHaveLength(1);
    expect(plan.unsettled).toBe(0);
  });

  it('is deterministic for the same input', () => {
    const expenses = [
      split('e1', 100, 'a', ['a', 'b'], { date: '2026-01-01', createdAt: 1 }),
      split('e2', 100, 'a', ['a', 'b'], { date: '2026-02-01', createdAt: 2 }),
    ];
    const a = planSettlement(expenses, 'b', 'a', 100).updates.map(u => u.expense.id);
    const b = planSettlement([...expenses].reverse(), 'b', 'a', 100).updates.map(u => u.expense.id);
    expect(a).toEqual(b);
  });
});

describe('settlementFor', () => {
  it('builds the record the Firestore rules expect', () => {
    const s = settlementFor('b', 'a', 50, 'a', 1234);
    expect(s).toEqual({
      fromUserId: 'b', toUserId: 'a', amount: 50, settledAt: 1234, settledBy: 'a',
    });
  });
});
