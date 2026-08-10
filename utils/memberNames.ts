import { Wallet, Expense } from '../types';

/**
 * Resolves wallet member ids to display names.
 *
 * Three sources, in order of reliability:
 *  1. `wallet.memberProfiles` — written by each member for themselves on join.
 *  2. `createdBy.name` on any expense they logged — covers members who joined before
 *     profiles existed.
 *  3. A short id stub, e.g. "Member 8f3a".
 *
 * Source 2 alone used to be the whole implementation, which meant anyone who had
 * joined but not yet added an expense was unnameable — you would be asked to split a
 * bill with "Member 8f3a".
 */
export function buildMemberNameMap(
  wallet: Wallet | null,
  expenses: Expense[],
  currentUserId?: string,
  currentUserName?: string
): Record<string, string> {
  const names: Record<string, string> = {};

  // Weakest source first so stronger ones overwrite it.
  expenses.forEach(e => {
    if (e.createdBy?.uid && e.createdBy.name) {
      names[e.createdBy.uid] = e.createdBy.name;
    }
  });

  if (wallet?.memberProfiles) {
    Object.entries(wallet.memberProfiles).forEach(([uid, name]) => {
      if (typeof name === 'string' && name.length > 0) names[uid] = name;
    });
  }

  // The current user's own name is always known locally.
  if (currentUserId && currentUserName) {
    names[currentUserId] = currentUserName;
  }

  return names;
}

export function memberNameFrom(
  names: Record<string, string>,
  userId: string
): string {
  return names[userId] || `Member ${userId.substring(0, 4)}`;
}
