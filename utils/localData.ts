/**
 * Local storage keys and cleanup, deliberately free of any Firebase import.
 *
 * The ErrorBoundary needs to be able to wipe local data to recover from a crash
 * loop, and it must not depend on `services/firebase.ts` to do so — that module
 * throws when configuration is missing, which would break the very screen meant to
 * catch failures.
 */

export const GUEST_DATA_KEY = 'daily_expenses_guest_v1';
// Legacy: one budget shared by every wallet. Still read as a migration fallback.
export const MONTHLY_BUDGET_KEY = 'daily_expenses_budget_monthly';
export const GUEST_CATEGORIES_KEY = 'kharcha_bachau_custom_categories_guest';

export const DEFAULT_BUDGET = 20000;

// Budgets are per wallet. The old code took a walletId but wrote every wallet's
// budget to one key, so switching wallets showed the same number for all of them.
export const budgetKey = (walletId: string | undefined): string =>
  walletId ? `${MONTHLY_BUDGET_KEY}_${walletId}` : MONTHLY_BUDGET_KEY;

// Every localStorage key the app owns. Listed explicitly rather than clearing the
// whole origin so unrelated data on the same domain is left alone.
const LOCAL_DATA_KEYS = [
  GUEST_DATA_KEY,
  GUEST_CATEGORIES_KEY,
  MONTHLY_BUDGET_KEY,
  'kharcha_bachau_guest_v1',
  'kharcha_bachau_active_wallet_id',
  'kharcha_bachau_wallets_cache',
  'kharcha_bachau_read_notifications',
  'kharcha_bachau_dismissed_notifications',
  'kharcha_bachau_notification_preferences',
  'kharcha_bachau_coach_seen',
];

export const clearLocalData = () => {
  try {
    LOCAL_DATA_KEYS.forEach(key => localStorage.removeItem(key));
    // Per-wallet budgets are keyed by wallet id, so they cannot be listed above.
    Object.keys(localStorage)
      .filter(key => key.startsWith(`${MONTHLY_BUDGET_KEY}_`))
      .forEach(key => localStorage.removeItem(key));
  } catch {
    // Storage disabled or full — nothing further to do.
  }
};
