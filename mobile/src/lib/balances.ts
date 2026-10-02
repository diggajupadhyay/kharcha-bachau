import { Wallet, Expense } from './types';
import { round2 } from './split';

/** Any balance smaller than this is treated as settled, to absorb float drift. */
const EPSILON = 0.005;

export interface DebtTransfer {
  fromUserId: string;
  toUserId: string;
  amount: number;
}

/**
 * Compute net balances per wallet member from expenses.
 *
 * For each split expense:
 *  - the payer is credited the full amount
 *  - each participant owes their share, UNLESS that debt has been settled
 *    (a settlement from the participant to the payer), in which case the
 *    payer's balance is reduced by the settled amount instead.
 *
 * Balances are seeded from the wallet's members *and* from everyone named on a
 * split. Seeding only from members was wrong: when someone leaves a wallet their
 * debt stopped being debited while the payer kept the full credit, so the books
 * silently stopped summing to zero and the remaining members saw a phantom
 * balance owed to them by nobody. A debt does not evaporate because the debtor
 * clicked "leave", so a departed member still shows up as owing.
 *
 * Results are rounded to 2 decimal places to avoid floating-point drift
 * when summing many currency values.
 */
export function calculateMemberBalances(
  wallet: Wallet | null,
  expenses: Expense[]
): Record<string, number> {
  const balances: Record<string, number> = {};

  const ensure = (userId: string): void => {
    if (typeof userId === 'string' && balances[userId] === undefined) {
      balances[userId] = 0;
    }
  };

  if (wallet) {
    wallet.members.forEach(ensure);
  }

  for (const expense of expenses) {
    if (!expense.splitDetails) continue;

    const { paidBy, participants, settlements = [] } = expense.splitDetails;
    if (typeof paidBy !== 'string' || !Array.isArray(participants) || participants.length === 0) {
      continue;
    }

    ensure(paidBy);
    participants.forEach(p => ensure(p.userId));

    balances[paidBy] += expense.amount;

    for (const participant of participants) {
      const owed = Number(participant.amount) || 0;
      if (owed === 0) continue;

      const settled = settlements.some(
        s => s.fromUserId === participant.userId && s.toUserId === paidBy
      );

      if (!settled) {
        balances[participant.userId] -= owed;
      } else {
        // Cancel the payer's credit by the *current* share, not by the amount
        // recorded on the settlement. Editing an expense after it was settled left
        // the two different, and the books then never returned to zero: the
        // difference stayed on the payer's balance permanently.
        balances[paidBy] -= owed;
      }
    }
  }

  for (const key of Object.keys(balances)) {
    balances[key] = round2(balances[key]);
  }

  return balances;
}

/**
 * The minimum number of payments that clears every debt.
 *
 * Greedy largest-first pairing: repeatedly settle the biggest debtor against the
 * biggest creditor. This never produces more than (debtors + creditors - 1)
 * transfers, where a naive "each person pays each other directly" view can
 * produce debtors x creditors. For a household that is the difference between
 * three payments and nine.
 *
 * Zero balances are excluded, and amounts are matched in integer minor units so
 * the transfers always add up to the exact total owed — the greedy loop in
 * floating point can otherwise strand a fraction of a cent and fail to converge.
 */
export function simplifyDebts(balances: Record<string, number>): DebtTransfer[] {
  const debtors: Array<{ id: string; minor: number }> = [];
  const creditors: Array<{ id: string; minor: number }> = [];

  for (const [id, value] of Object.entries(balances)) {
    const minor = Math.round((value + Number.EPSILON) * 100);
    if (minor < 0) debtors.push({ id, minor: -minor });
    else if (minor > 0) creditors.push({ id, minor });
  }

  // Biggest first: pairing the largest debtor with the largest creditor is what
  // collapses the transfer count.
  debtors.sort((a, b) => b.minor - a.minor);
  creditors.sort((a, b) => b.minor - a.minor);

  const transfers: DebtTransfer[] = [];
  let i = 0;
  let j = 0;

  while (i < debtors.length && j < creditors.length) {
    const amount = Math.min(debtors[i].minor, creditors[j].minor);
    if (amount > 0) {
      transfers.push({
        fromUserId: debtors[i].id,
        toUserId: creditors[j].id,
        amount: amount / 100,
      });
    }
    debtors[i].minor -= amount;
    creditors[j].minor -= amount;
    if (debtors[i].minor === 0) i++;
    if (creditors[j].minor === 0) j++;
  }

  return transfers;
}

/** True when everyone is square — no transfers needed. */
export const isFullySettled = (balances: Record<string, number>): boolean =>
  Object.values(balances).every(v => Math.abs(v) < EPSILON);
