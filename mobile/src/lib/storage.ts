import AsyncStorage from '@react-native-async-storage/async-storage';
import { Expense, Category, Wallet } from './types';

// Local storage keys — deliberately free of any Firebase import so the app's data
// layer never depends on cloud configuration being present.
export const GUEST_DATA_KEY = 'daily_expenses_guest_v1';
export const MONTHLY_BUDGET_KEY = 'daily_expenses_budget_monthly';
export const GUEST_CATEGORIES_KEY = 'kharcha_bachau_custom_categories_guest';
export const ACTIVE_WALLET_KEY = 'kharcha_bachau_active_wallet_id';

export const DEFAULT_BUDGET = 20000;

// Budgets are per wallet. Keyed by wallet id so switching wallets never shows
// another wallet's number.
export const budgetKey = (walletId: string | undefined): string =>
  walletId ? `${MONTHLY_BUDGET_KEY}_${walletId}` : MONTHLY_BUDGET_KEY;

export const createGuestWallet = (): Wallet => ({
  id: 'guest_wallet',
  name: 'Personal Wallet',
  ownerId: 'guest',
  members: ['guest'],
  currency: 'Rs.',
  createdAt: Date.now(),
  isPersonal: true,
});

export const getGuestExpenses = async (): Promise<Expense[]> => {
  try {
    const data = await AsyncStorage.getItem(GUEST_DATA_KEY);
    if (!data) return [];
    const parsed = JSON.parse(data);
    // A truncated or hand-mangled value must never reach the UI as a non-array.
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

export const saveGuestExpenses = async (data: Expense[]): Promise<void> => {
  try {
    await AsyncStorage.setItem(GUEST_DATA_KEY, JSON.stringify(data));
  } catch {
    throw new Error('This device is out of storage space. Free up space and try again.');
  }
};

// Guest writes replace the whole array, so a read-await-write loses whatever landed
// in between — two quick taps would persist only the second one. Mutations are
// serialized through a promise chain instead: each one reads fresh state, applies,
// and writes before the next runs.
let writeQueue: Promise<unknown> = Promise.resolve();
const enqueue = <T>(task: () => Promise<T>): Promise<T> => {
  const run = writeQueue.then(task);
  writeQueue = run.catch(() => undefined);
  return run;
};

export const mutateGuestExpenses = (
  mutate: (current: Expense[]) => Expense[]
): Promise<Expense[]> =>
  enqueue(async () => {
    const current = await getGuestExpenses();
    const next = mutate(current);
    await saveGuestExpenses(next);
    return next;
  });

export const getGuestCategories = async (): Promise<Category[]> => {
  try {
    const saved = await AsyncStorage.getItem(GUEST_CATEGORIES_KEY);
    const parsed = saved ? JSON.parse(saved) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

export const saveGuestCategories = (categories: Category[]): Promise<void> =>
  enqueue(() => AsyncStorage.setItem(GUEST_CATEGORIES_KEY, JSON.stringify(categories)));

// Scoped key first so an existing budget carries over instead of silently
// resetting to the default.
export const getStoredBudget = async (walletId: string | undefined): Promise<number> => {
  try {
    const scoped = await AsyncStorage.getItem(budgetKey(walletId));
    const raw = scoped !== null ? scoped : await AsyncStorage.getItem(MONTHLY_BUDGET_KEY);
    const parsed = raw ? parseFloat(raw) : NaN;
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : DEFAULT_BUDGET;
  } catch {
    return DEFAULT_BUDGET;
  }
};

export const saveStoredBudget = async (walletId: string | undefined, amount: number): Promise<void> => {
  try {
    await AsyncStorage.setItem(budgetKey(walletId), amount.toString());
  } catch {
    throw new Error('This device is out of storage space. Free up space and try again.');
  }
};

// Every AsyncStorage key the app owns. AsyncStorage can list keys (unlike
// localStorage), so per-wallet budgets are swept by prefix rather than enumerated.
export const clearLocalData = async (): Promise<void> => {
  try {
    const keys = await AsyncStorage.getAllKeys();
    const owned = new Set([
      GUEST_DATA_KEY,
      GUEST_CATEGORIES_KEY,
      MONTHLY_BUDGET_KEY,
      ACTIVE_WALLET_KEY,
    ]);
    const toRemove = keys.filter(key => owned.has(key) || key.startsWith(`${MONTHLY_BUDGET_KEY}_`));
    if (toRemove.length > 0) await AsyncStorage.multiRemove(toRemove);
  } catch {
    // Storage unavailable — nothing further to do.
  }
};
