import { describe, it, expect, beforeEach, vi } from 'vitest';

// AsyncStorage is a native module, so it is replaced with an in-memory Map that
// mirrors its API surface (including getAllKeys, used by the clear-all sweep).
const store = new Map<string, string>();
vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: async (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: async (k: string, v: string) => { store.set(k, v); },
    removeItem: async (k: string) => { store.delete(k); },
    multiRemove: async (keys: string[]) => { keys.forEach(k => store.delete(k)); },
    getAllKeys: async () => [...store.keys()],
  },
}));

import {
  DEFAULT_WALLET_ID, WALLETS_KEY, MONTHLY_BUDGET_KEY, GUEST_DATA_KEY,
  createGuestWallet, getStoredWallets, saveWallets, getActiveWalletId, saveActiveWalletId,
  getStoredBudget, saveStoredBudget, assignOrphanedExpenses, mutateGuestExpenses,
  getGuestExpenses, clearLocalData, isValidInviteCode, normaliseInviteCode, generateInviteCode,
} from '../storage';
import type { Expense } from '../types';

const expense = (over: Partial<Expense> = {}): Expense => ({
  id: 'e1', categoryId: 'food', categoryName: 'Food', categoryEmoji: '🍔',
  amount: 100, note: '', date: '2026-01-01', walletId: DEFAULT_WALLET_ID,
  createdBy: { uid: 'guest', name: 'Guest' }, createdAt: 1,
  ...over,
});

beforeEach(() => { store.clear(); });

describe('wallet list', () => {
  it('seeds a single personal wallet on a fresh install', async () => {
    const wallets = await getStoredWallets();
    expect(wallets).toHaveLength(1);
    expect(wallets[0].id).toBe(DEFAULT_WALLET_ID);
    expect(wallets[0].isPersonal).toBe(true);
  });

  it('round-trips a wallet list', async () => {
    const wallets = [createGuestWallet(), { ...createGuestWallet(), id: 'w_2', name: 'Trip', isPersonal: false }];
    await saveWallets(wallets);
    expect(await getStoredWallets()).toEqual(wallets);
  });

  it('repairs a corrupt value rather than returning nothing', async () => {
    store.set(WALLETS_KEY, 'not json');
    expect(await getStoredWallets()).toHaveLength(1);
  });

  it('drops entries with no id or name, which would be unselectable', async () => {
    store.set(WALLETS_KEY, JSON.stringify([
      createGuestWallet(), { name: 'No id' }, { id: 'w_3' }, null,
    ]));
    const wallets = await getStoredWallets();
    expect(wallets.map(w => w.id)).toEqual([DEFAULT_WALLET_ID]);
  });

  it('replaces an empty list with the default wallet', async () => {
    store.set(WALLETS_KEY, JSON.stringify([]));
    expect((await getStoredWallets())[0].id).toBe(DEFAULT_WALLET_ID);
  });

  it('fills in missing members and currency', async () => {
    store.set(WALLETS_KEY, JSON.stringify([{ id: 'w_9', name: 'Old' }]));
    const [wallet] = await getStoredWallets();
    expect(wallet.members).toEqual([]);
    expect(wallet.currency).toBe('Rs.');
    expect(typeof wallet.createdAt).toBe('number');
  });
});

describe('active wallet', () => {
  it('round-trips the active wallet id', async () => {
    expect(await getActiveWalletId()).toBeNull();
    await saveActiveWalletId('w_2');
    expect(await getActiveWalletId()).toBe('w_2');
  });
});

describe('budgets are scoped per wallet', () => {
  it('keeps separate numbers for separate wallets', async () => {
    await saveStoredBudget('w_1', 5000);
    await saveStoredBudget('w_2', 9000);
    expect(await getStoredBudget('w_1')).toBe(5000);
    expect(await getStoredBudget('w_2')).toBe(9000);
  });

  it('carries a pre-multi-wallet budget onto the default wallet', async () => {
    store.set(MONTHLY_BUDGET_KEY, '3333');
    expect(await getStoredBudget(DEFAULT_WALLET_ID)).toBe(3333);
  });

  it('falls back to the default for a non-numeric value', async () => {
    await saveStoredBudget('w_1', 1234);
    store.set(`${MONTHLY_BUDGET_KEY}_w_1`, 'garbage');
    expect(await getStoredBudget('w_1')).toBe(20000);
  });
});

describe('assignOrphanedExpenses', () => {
  it('claims expenses whose wallet no longer exists', async () => {
    await mutateGuestExpenses(() => [expense({ id: 'a', walletId: 'deleted_wallet' }), expense({ id: 'b' })]);
    await assignOrphanedExpenses(DEFAULT_WALLET_ID, new Set([DEFAULT_WALLET_ID, 'w_2']));
    const rows = await getGuestExpenses();
    expect(rows.every(e => e.walletId === DEFAULT_WALLET_ID)).toBe(true);
  });

  it('claims expenses written before wallets existed, which have no walletId', async () => {
    await mutateGuestExpenses(() => [expense({ id: 'a', walletId: undefined as unknown as string })]);
    await assignOrphanedExpenses(DEFAULT_WALLET_ID, new Set([DEFAULT_WALLET_ID]));
    expect((await getGuestExpenses())[0].walletId).toBe(DEFAULT_WALLET_ID);
  });

  it('leaves other wallets alone', async () => {
    await mutateGuestExpenses(() => [expense({ id: 'a', walletId: 'w_2' })]);
    await assignOrphanedExpenses(DEFAULT_WALLET_ID, new Set([DEFAULT_WALLET_ID, 'w_2']));
    expect((await getGuestExpenses())[0].walletId).toBe('w_2');
  });

  it('does not rewrite when nothing is orphaned', async () => {
    await mutateGuestExpenses(() => [expense()]);
    await assignOrphanedExpenses(DEFAULT_WALLET_ID, new Set([DEFAULT_WALLET_ID]));
    expect(await getGuestExpenses()).toHaveLength(1);
  });
});

describe('clearLocalData', () => {
  it('removes wallets, active id, expenses, categories and every per-wallet budget', async () => {
    await saveWallets([createGuestWallet()]);
    await saveActiveWalletId(DEFAULT_WALLET_ID);
    await saveStoredBudget('w_1', 100);
    await saveStoredBudget('w_2', 200);
    await mutateGuestExpenses(() => [expense()]);
    store.set('kharcha_bachau_custom_categories_guest', '[]');
    store.set('unrelated_key', 'keep me');

    await clearLocalData();

    expect(await getStoredWallets()).toHaveLength(1);
    expect(await getGuestExpenses()).toEqual([]);
    expect(store.has(`${MONTHLY_BUDGET_KEY}_w_1`)).toBe(false);
    expect(store.has(`${MONTHLY_BUDGET_KEY}_w_2`)).toBe(false);
    expect(store.has(GUEST_DATA_KEY)).toBe(false);
    expect(store.get('unrelated_key')).toBe('keep me');
  });
});

describe('invite codes', () => {
  it('normalises what a user types', () => {
    expect(normaliseInviteCode(' ab-cd12 ')).toBe('ABCD12');
    expect(normaliseInviteCode('abc123')).toBe('ABC123');
  });

  it('accepts only six alphanumeric characters', () => {
    expect(isValidInviteCode('ABC123')).toBe(true);
    expect(isValidInviteCode('abc123')).toBe(true);
    expect(isValidInviteCode('ABC12')).toBe(false);
    expect(isValidInviteCode('ABC1234')).toBe(false);
    expect(isValidInviteCode('ABC12!')).toBe(false);
    expect(isValidInviteCode('')).toBe(false);
  });

  it('generates codes from the unambiguous alphabet', () => {
    for (let i = 0; i < 200; i++) {
      const code = generateInviteCode();
      expect(code).toHaveLength(6);
      expect(code).toMatch(/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/);
      // The whole point of the alphabet: no characters that read as other ones.
      expect(code).not.toMatch(/[O0I1]/);
    }
  });
});
