import { Wallet, Expense } from '../types';

/**
 * Compute net balances per wallet member from expenses.
 *
 * For each split expense:
 *  - the payer is credited the full amount
 *  - each participant owes their share, UNLESS that debt has been settled
 *    (a settlement from the participant to the payer), in which case the
 *    payer's balance is reduced by the settled amount instead.
 *
 * Results are rounded to 2 decimal places to avoid floating-point drift
 * when summing many currency values.
 */
export function calculateMemberBalances(
  wallet: Wallet | null,
  expenses: Expense[]
): Record<string, number> {
  const balances: Record<string, number> = {};

  if (wallet) {
    wallet.members.forEach((memberId) => {
      balances[memberId] = 0;
    });
  }

  for (const expense of expenses) {
    if (!expense.splitDetails) continue;

    const { paidBy, participants, settlements = [] } = expense.splitDetails;
    if (balances[paidBy] === undefined) continue;

    balances[paidBy] += expense.amount;

    for (const participant of participants) {
      if (balances[participant.userId] === undefined) continue;

      const settlement = settlements.find(
        (s) => s.fromUserId === participant.userId && s.toUserId === paidBy
      );

      if (!settlement) {
        balances[participant.userId] -= participant.amount;
      } else {
        balances[paidBy] -= settlement.amount;
      }
    }
  }

  for (const key of Object.keys(balances)) {
    balances[key] = Math.round(balances[key] * 100) / 100;
  }

  return balances;
}
