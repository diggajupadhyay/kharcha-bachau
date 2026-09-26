import { SplitDetails } from './types';

/**
 * Returns true when the sum of participant shares matches the expense total
 * within a small floating-point tolerance. Used to guard split expenses
 * both on the client and as documentation for server-side validation.
 */
export function isSplitSumValid(split: SplitDetails, total: number): boolean {
  const totalSplit = (split?.participants || []).reduce(
    (sum, p) => sum + (p.amount || 0),
    0
  );
  return Math.abs(totalSplit - total) <= 0.01;
}
