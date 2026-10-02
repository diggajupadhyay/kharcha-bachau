import AsyncStorage from '@react-native-async-storage/async-storage';
import { Expense, Category, Wallet } from './types';

// Local storage keys — deliberately free of any Firebase import so the app's data
// layer never depends on cloud configuration being present.
export const GUEST_DATA_KEY = 'daily_expenses_guest_v1';
export const MONTHLY_BUDGET_KEY = 'daily_expenses_budget_monthly';
export const GUEST_CATEGORIES_KEY = 'kharcha_bachau_custom_categories_guest';
export const ACTIVE_WALLET_KEY = 'kharcha_bachau_active_wallet_id';
export const WALLETS_KEY = 'kharcha_bachau_wallets_v1';

export const DEFAULT_BUDGET = 20000;

// Wallets are capped at the same ceiling the Firestore join rule enforces, so a
// wallet created on device can never exceed what the backend will allow.
export const MAX_WALLET_NAME_LENGTH = 50;
export const MAX_WALLET_MEMBERS = 50;

// Excludes characters that are easy to misread when a code is read off someone
// else's screen (0/O, 1/I). Matches the web app's alphabet so codes stay familiar.
const INVITE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/**
 * A 6-character invite code. Hermes has no crypto.getRandomValues, so this draws
 * from Math.random: an invite code only has to be unguessable enough that nobody
 * stumbles into a stranger's wallet, and the server rejects a duplicate anyway.
 */
export const generateInviteCode = (): string => {
  let out = '';
  for (let i = 0; i < 6; i++) {
    out += INVITE_ALPHABET[Math.floor(Math.random() * INVITE_ALPHABET.length)];
  }
  return out;
};

export const normaliseInviteCode = (code: string): string =>
  code.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');

export const isValidInviteCode = (code: string): boolean =>
  /^[A-Z0-9]{6}$/.test(normaliseInviteCode(code));

// Budgets are per wallet. Keyed by wallet id so switching wallets never shows
// another wallet's number.
export const budgetKey = (walletId: string | undefined): string =>
  walletId ? `${MONTHLY_BUDGET_KEY}_${walletId}` : MONTHLY_BUDGET_KEY;

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
      WALLETS_KEY,
      ONBOARDING_KEY,
    ]);
    const toRemove = keys.filter(key => owned.has(key) || key.startsWith(`${MONTHLY_BUDGET_KEY}_`));
    if (toRemove.length > 0) await AsyncStorage.multiRemove(toRemove);
  } catch {
    // Storage unavailable — nothing further to do.
  }
};

// ---- Wallets ---------------------------------------------------------------

// The id of the wallet seeded on first run. It is deliberately a fixed string and
// not a generated one: expenses written before multi-wallet support carry
// walletId 'guest_wallet', and minting a new id here would orphan all of them.
export const DEFAULT_WALLET_ID = 'guest_wallet';

export const createGuestWallet = (): Wallet => ({
  id: DEFAULT_WALLET_ID,
  name: 'Personal Wallet',
  ownerId: 'guest',
  members: ['guest'],
  currency: 'Rs.',
  createdAt: Date.now(),
  isPersonal: true,
  // Display names live alongside the member ids so the balance summary and the
  // split picker can name people without a server round-trip.
  memberProfiles: { guest: 'You' },
});

export const getStoredWallets = async (): Promise<Wallet[]> => {
  try {
    const data = await AsyncStorage.getItem(WALLETS_KEY);
    if (!data) return [createGuestWallet()];
    const parsed = JSON.parse(data);
    if (!Array.isArray(parsed) || parsed.length === 0) return [createGuestWallet()];
    // Repair rather than trust: a wallet with no id or no name would be
    // unselectable and unrenderable, and there is no server copy to fall back to.
    return parsed.filter((w): w is Wallet => !!w && typeof w.id === 'string' && typeof w.name === 'string')
      .map(w => ({
        ...w,
        members: Array.isArray(w.members) ? w.members : [],
        memberProfiles: (w.memberProfiles && typeof w.memberProfiles === 'object')
          ? w.memberProfiles as Record<string, string>
          : {},
        currency: typeof w.currency === 'string' ? w.currency : 'Rs.',
        createdAt: typeof w.createdAt === 'number' ? w.createdAt : Date.now(),
      }));
  } catch {
    return [createGuestWallet()];
  }
};

export const saveWallets = (wallets: Wallet[]): Promise<void> =>
  enqueue(() => AsyncStorage.setItem(WALLETS_KEY, JSON.stringify(wallets)));

export const getActiveWalletId = async (): Promise<string | null> => {
  try {
    return await AsyncStorage.getItem(ACTIVE_WALLET_KEY);
  } catch {
    return null;
  }
};

export const saveActiveWalletId = (id: string): Promise<void> =>
  enqueue(() => AsyncStorage.setItem(ACTIVE_WALLET_KEY, id));

/**
 * Re-homes expenses whose `walletId` does not resolve — either missing entirely
 * (written before multi-wallet support) or naming a wallet that no longer exists.
 * Left alone they are invisible: every read filters by the active wallet, so a
 * stale id means those expenses can never be seen, edited, exported or deleted.
 */
export const assignOrphanedExpenses = async (
  walletId: string,
  knownWalletIds: ReadonlySet<string>,
): Promise<void> => {
  const expenses = await getGuestExpenses();
  const isOrphan = (e: Expense) =>
    typeof e.walletId !== 'string' || !knownWalletIds.has(e.walletId);
  if (!expenses.some(isOrphan)) return;
  await mutateGuestExpenses(current =>
    current.map(e => (isOrphan(e) ? { ...e, walletId } : e))
  );
};

// ---- Onboarding -----------------------------------------------------------

/**
 * Set once the intro has been seen. Deliberately device-local rather than per
 * account: it is a tour of the interface, not a property of a wallet, and someone
 * signing in on a device that has already shown it should not be shown it again.
 */
const ONBOARDING_KEY = 'kharcha_bachau_onboarding_v1';

export const hasSeenOnboarding = async (): Promise<boolean> =>
  (await AsyncStorage.getItem(ONBOARDING_KEY)) === '1';

export const markOnboardingSeen = (): Promise<void> =>
  AsyncStorage.setItem(ONBOARDING_KEY, '1');

/**
 * Cleared with the rest of the local data so "clear all data" genuinely returns
 * the app to a first-run state.
 */
export const clearOnboardingFlag = (): Promise<void> =>
  AsyncStorage.removeItem(ONBOARDING_KEY);
