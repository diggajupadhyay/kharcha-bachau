import { Split, SplitDetails, SplitParticipant } from './types';

/** Currency has two decimal places; all share maths is done in these minor units. */
export const MINOR_UNITS = 100;

/** Rounds to 2dp, and normalises -0 to 0 so a settled balance never reads "-0". */
export const round2 = (value: number): number => {
  const rounded = Math.round((value + Number.EPSILON) * MINOR_UNITS) / MINOR_UNITS;
  return rounded === 0 ? 0 : rounded;
};

/**
 * Returns true when the sum of participant shares matches the expense total
 * to within one minor unit (1 paisa). Used to guard split expenses both on the
 * client and as documentation for server-side validation.
 *
 * Compared in integer minor units rather than as floats: 33.33 x 3 is 99.99,
 * and in binary floating point `Math.abs(100 - 99.99)` evaluates to
 * 0.010000000000005116 — just over the tolerance, so a float comparison rejects
 * precisely the rounding this check is meant to forgive.
 */
export function isSplitSumValid(split: SplitDetails, total: number): boolean {
  const splitTotal = (split?.participants || []).reduce(
    (sum, p) => sum + (p.amount || 0),
    0
  );
  if (!Number.isFinite(splitTotal) || !Number.isFinite(total)) return false;

  const splitMinor = Math.round(splitTotal * MINOR_UNITS);
  const totalMinor = Math.round(total * MINOR_UNITS);
  return Math.abs(splitMinor - totalMinor) <= 1;
}

/**
 * Splits `total` into `count` shares that sum to *exactly* `total`.
 *
 * Naive `round2(total / count)` loses or gains a cent whenever the division is
 * not exact — 100 across 3 people gives 33.33 x 3 = 99.99, so the books stop
 * balancing to zero and nobody can tell who is short. The remainder is instead
 * computed in integer minor units and handed out one unit at a time, which makes
 * the result exact and deterministic: the same total and count always produce
 * the same shares, so re-opening an expense never reshuffles who owes the cent.
 *
 * The leftover cents go to the earliest participants. That is arbitrary but it
 * is stable, which is what matters for an audit trail.
 */
export function calculateEqualShares(total: number, count: number): number[] {
  if (!Number.isFinite(total) || count <= 0) return [];

  const minorTotal = Math.round(total * MINOR_UNITS);
  const base = Math.floor(minorTotal / count);
  let remainder = minorTotal - base * count;

  const shares: number[] = [];
  for (let i = 0; i < count; i++) {
    const extra = remainder > 0 ? 1 : 0;
    if (remainder > 0) remainder -= 1;
    shares.push((base + extra) / MINOR_UNITS);
  }
  return shares;
}

/**
 * Builds equal splitDetails for an expense, one participant per supplied member.
 * Returns null when the participant list is empty — a split nobody is part of is
 * not a split, and the caller should fall back to an unsplit expense.
 */
export function buildEqualSplit(
  total: number,
  members: Array<{ userId: string; userName: string }>,
  paidBy: string
): Split | null {
  if (members.length === 0) return null;

  const shares = calculateEqualShares(total, members.length);
  const participants: SplitParticipant[] = members.map((member, i) => ({
    userId: member.userId,
    userName: member.userName,
    amount: shares[i],
  }));

  return { splitType: 'equal', participants, paidBy, settlements: [] };
}

/**
 * Recomputes an equal split's shares after the participant list or total changed,
 * preserving the settlement history. The payer and participant names come from
 * the existing details; only the amounts are recomputed.
 */
export function rebalanceEqualSplit(split: Split, total: number): Split {
  const shares = calculateEqualShares(total, split.participants.length);
  return {
    ...split,
    participants: split.participants.map((p, i) => ({ ...p, amount: shares[i] })),
  };
}

/**
 * Participants carried by a split, in display order. Used to seed a selection UI
 * with exactly the people already on the expense.
 */
export const splitParticipantIds = (split: Split | undefined): string[] =>
  split?.participants?.map(p => p.userId) ?? [];
