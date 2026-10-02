import { Expense, SettlementRecord } from './types';

/**
 * Decides which expenses a "settle up" should mark as paid.
 *
 * Settlements live on individual expenses, but the balance screen asks in the
 * aggregate — "Ram owes me 700, that's done". So the pair's outstanding shares are
 * walked oldest-first and marked until the recorded debt is covered.
 *
 * Pure, and shared by the local and cloud paths on purpose. They were separate
 * loops once, and they disagreed: the local one walked the oldest-first ordering
 * while the cloud one walked the raw list order. The same debt could therefore be
 * settled against different expenses depending on which mode the user was in.
 *
 * A share larger than the amount still owed is skipped rather than split, because a
 * settlement marks an expense's share as fully paid — there is no partial state.
 * That can leave a remainder, which `unsettled` reports so the UI can be honest
 * rather than claiming a debt was cleared when it was not.
 */
export interface SettlementPlan {
  /** Expenses to mark settled, in the order they should be written. */
  updates: Array<{ expense: Expense; share: number }>;
  /** Debt still outstanding after applying every update above. */
  unsettled: number;
}

const isOutstanding = (
  expense: Expense, fromUserId: string, toUserId: string
): boolean => {
  const split = expense.splitDetails;
  if (!split || split.paidBy !== toUserId) return false;
  if (!(split.participants ?? []).some(p => p.userId === fromUserId)) return false;
  return !(split.settlements ?? []).some(
    s => s.fromUserId === fromUserId && s.toUserId === toUserId
  );
};

const shareOf = (expense: Expense, userId: string): number =>
  expense.splitDetails?.participants.find(p => p.userId === userId)?.amount ?? 0;

/** Oldest first, ties broken by insertion time so the order is stable. */
const byAgeFirst = (a: Expense, b: Expense): number => {
  if (a.date !== b.date) return a.date < b.date ? -1 : 1;
  return (a.createdAt ?? 0) - (b.createdAt ?? 0);
};

export function planSettlement(
  expenses: Expense[],
  fromUserId: string,
  toUserId: string,
  amountDue: number
): SettlementPlan {
  const updates: SettlementPlan['updates'] = [];
  if (!(amountDue > 0)) return { updates, unsettled: 0 };

  const candidates = expenses
    .filter(e => isOutstanding(e, fromUserId, toUserId))
    .sort(byAgeFirst);

  let remaining = amountDue;
  for (const expense of candidates) {
    if (remaining <= 0) break;
    const share = shareOf(expense, fromUserId);
    if (share <= 0 || share > remaining) continue;
    remaining = round2(remaining - share);
    updates.push({ expense, share });
  }

  return { updates, unsettled: round2(remaining) };
}

/** The settlement record to append for a planned update. */
export const settlementFor = (
  fromUserId: string,
  toUserId: string,
  share: number,
  settledBy: string,
  at: number
): SettlementRecord => ({ fromUserId, toUserId, amount: share, settledAt: at, settledBy });

const round2 = (v: number): number => {
  const r = Math.round((v + Number.EPSILON) * 100) / 100;
  return r === 0 ? 0 : r;
};
