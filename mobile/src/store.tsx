import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  Expense, Category, Wallet, Notification, NotificationType, MonthlyStats, Split, BackupData,
} from './lib/types';
import {
  buildRestorePlan, remapExpenses, countOrphanedExpenses, dedupeCategories, matchExistingWallets,
  RestoreSummary,
} from './lib/restore';
import { sanitizeBackupExpenses } from './lib/backup';
import {
  createGuestWallet, getGuestExpenses, saveGuestExpenses, mutateGuestExpenses,
  getStoredWallets, saveWallets,
  getActiveWalletId, saveActiveWalletId, assignOrphanedExpenses, DEFAULT_WALLET_ID,
  getGuestCategories, saveGuestCategories,
  getStoredBudget, saveStoredBudget, clearLocalData, DEFAULT_BUDGET,
  MAX_WALLET_NAME_LENGTH, MAX_WALLET_MEMBERS,
} from './lib/storage';
import { EXPENSE_CATEGORIES } from './lib/constants';
import { isSplitSumValid } from './lib/split';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth, getCloud, cloudAvailable } from './AuthContext';
import { calculateMemberBalances, simplifyDebts, DebtTransfer } from './lib/balances';
import { planSettlement, settlementFor } from './lib/settlement';
import { todayISO } from './lib/date';
import * as Haptics from 'expo-haptics';

const StoreContext = createContext<StoreContextValue | undefined>(undefined);

export const useStore = (): StoreContextValue => {
  const context = useContext(StoreContext);
  if (!context) throw new Error('useStore must be used within a StoreProvider');
  return context;
};

interface StoreContextValue {
  activeWallet: Wallet;
  wallets: Wallet[];
  expenses: Expense[];
  /** This month's spend keyed by wallet id, for the wallet switcher. */
  monthSpendByWallet: Record<string, number>;
  /** All-time spend per wallet id, so an older-only wallet is not shown as empty. */
  totalSpendByWallet: Record<string, number>;
  budget: number;
  monthlyStats: MonthlyStats;
  isLoaded: boolean;

  /**
   * Wallets whose full history could not be loaded, keyed by wallet id. Home shows
   * this in place of the usual list so a partial load never masquerades as an
   * empty wallet.
   */
  historyLoadError: Record<string, string>;
  /** Clears the error for a wallet so Home can offer a retry. */
  setHistoryLoadError: (walletId: string, message: string | null) => void;
  /** Re-runs the paged history load for a wallet. Used by Home's retry button. */
  retryHistory: (walletId: string) => void;

  addExpense: (
    amount: number, category: Category, note: string,
    date?: Date, split?: Split,
  ) => Promise<void>;
  updateExpense: (id: string, amount: number, note: string) => Promise<void>;
  deleteExpense: (id: string) => Promise<void>;
  restoreExpense: (expense: Expense) => Promise<void>;
  replaceExpenses: (expenses: Expense[]) => Promise<void>;

  /**
   * Rebuilds wallets, expenses, budgets and categories from a backup file.
   *
   * Separate from `replaceExpenses`, which folds a flat list into whichever wallet
   * happens to be open. A backup carrying its own wallets needs the structure
   * recreated too, or rows end up pointing at wallet ids that no longer exist.
   */
  restoreFromBackup: (backup: BackupData) => Promise<RestoreSummary>;

  setBudget: (amount: number) => Promise<void>;

  setActiveWallet: (walletId: string) => Promise<void>;
  createWallet: (name: string, isPersonal?: boolean) => Promise<string>;
  renameWallet: (walletId: string, name: string) => Promise<void>;
  deleteWallet: (walletId: string) => Promise<void>;

  addMember: (walletId: string, name: string) => Promise<string>;
  removeMember: (walletId: string, userId: string) => Promise<void>;
  memberName: (wallet: Wallet, userId: string) => string;

  balances: Record<string, number>;
  transfers: DebtTransfer[];

  // Shared wallets (signed-in only — joining needs an account to attach to).
  getInviteCode: (walletId: string) => Promise<{ code: string; name: string }>;
  joinWallet: (code: string) => Promise<{ walletId: string; name: string; alreadyMember: boolean }>;
  leaveWallet: (walletId: string) => Promise<void>;
  settleUp: (
    fromUserId: string, toUserId: string
  ) => Promise<{ settled: number; unsettled: number }>;
  undoSettleUp: (fromUserId: string, toUserId: string) => Promise<number>;

  customCategories: Category[];
  addCustomCategory: (category: Category) => Promise<void>;
  deleteCustomCategory: (categoryId: string) => Promise<void>;
  getAllCategories: () => Category[];

  // Data management
  clearAllData: () => Promise<void>;

  // UI
  notifications: Notification[];
  showNotification: (type: NotificationType, message: string) => void;
  dismissNotification: (id: string) => void;
  triggerHaptic: () => void;
}

// Hermes has no built-in crypto.randomUUID; expense ids need uniqueness, not
// cryptography, so the standard Math.random RFC-4122 shape is sufficient.
const uuid = (): string => {
  let out = '';
  for (let i = 0; i < 32; i++) {
    if (i === 12) { out += '4'; continue; }
    if (i === 16) { out += '8'; continue; }
    if (i === 8 || i === 20) { out += '-'; continue; }
    out += Math.floor(Math.random() * 16).toString(16);
  }
  return out;
};

// Cloud writes are bounded by the security rules; local writes are not, so the
// same limits are applied here.
const validateAmount = (amount: number) => {
  if (!Number.isFinite(amount) || amount <= 0) throw new Error('Enter an amount greater than 0');
  if (amount > 1000000000) throw new Error('That amount is too large');
};

const validateNote = (note: string) => {
  if (note && note.length > 500) throw new Error('Note too long (max 500 characters)');
};

const isoMonthBounds = (): { start: string; end: string } => {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  const start = `${y}-${String(m + 1).padStart(2, '0')}-01`;
  const lastDay = new Date(y, m + 1, 0).getDate();
  const end = `${y}-${String(m + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
  return { start, end };
};

// Live migrations keyed by account, so concurrent calls share one run. See
// migrateGuestData for why the local done-flag alone is not sufficient.
const migrationsInFlight = new Map<string, Promise<void>>();

export const StoreProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user: session } = useAuth();
  const isCloud = session.type === 'cloud';

  const [wallets, setWallets] = useState<Wallet[]>([]);
  const [activeWalletId, setActiveWalletId] = useState<string>('');
  const [allExpenses, setAllExpenses] = useState<Expense[]>([]);
  const [budget, setBudgetState] = useState<number>(DEFAULT_BUDGET);
  const [customCategories, setCustomCategories] = useState<Category[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  /**
   * Wallet id whose full history failed to load, and why.
   *
   * Distinct from a toast because a toast disappears in four seconds while the
   * misleading state persists: the recent-expense subscription keeps merging, so
   * the list looks complete and simply has no older entries. Home reads this to say
   * so in place instead of rendering a wallet that looks empty.
   */
  const [historyLoadError, setHistoryLoadErrorState] = useState<Record<string, string>>({});

  const setHistoryLoadError = useCallback((walletId: string, message: string | null) => {
    setHistoryLoadErrorState(current => {
      if (message === null) {
        if (!(walletId in current)) return current;
        const { [walletId]: _cleared, ...rest } = current;
        return rest;
      }
      if (current[walletId] === message) return current;
      return { ...current, [walletId]: message };
    });
  }, []);
  const [isLoaded, setIsLoaded] = useState(false);
  // False until Firestore has actually delivered this account's wallets. The
  // follow-wallet effect must not run before then: the wallet list still holds the
  // local guest wallet, whose id means nothing in Firestore, and subscribing to it
  // logs a permission-denied on every sign-in.
  const [cloudWalletsReady, setCloudWalletsReady] = useState(false);

  // Never null: every screen reads this unconditionally, and a null here would
  // force an isLoaded guard onto every one of them.
  const activeWallet = useMemo<Wallet>(
    () => wallets.find(w => w.id === activeWalletId) ?? wallets[0] ?? createGuestWallet(),
    [wallets, activeWalletId]
  );

  // ---- UI ---------------------------------------------------------------

  const showNotification = useCallback((type: NotificationType, message: string) => {
    const id = uuid();
    setNotifications(prev => [...prev, { id, type, message }]);
    // Auto-dismiss after 4s, matching the web toast.
    setTimeout(() => setNotifications(prev => prev.filter(n => n.id !== id)), 4000);
  }, []);

  const dismissNotification = useCallback((id: string) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
  }, []);

  const triggerHaptic = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
  }, []);

  // Single source of truth. `expenses` is derived rather than stored, so a screen
  // physically cannot forget to scope by wallet and leak one wallet's money into
  // another's total.
  const expenses = useMemo<Expense[]>(
    () => allExpenses.filter(e => e.walletId === activeWallet.id),
    [allExpenses, activeWallet.id]
  );

  // Budgets are per wallet, so switching wallets has to re-read them. Expenses do
  // not — they are already in memory.
  const loadBudget = useCallback(async (walletId: string) => {
    setBudgetState(await getStoredBudget(walletId));
  }, []);

  /**
   * Guest data moves to the cloud on the first sign-in, once and only once.
   *
   * Two independent guards, because either alone is not enough:
   *
   *  - An in-flight guard. The subscribing effect below can run more than once for
   *    one sign-in — React re-runs effects on mount in development, and the effect
   *    depends on the `session` object, which is a fresh literal each render. Every
   *    concurrent pass saw "not migrated yet" and each minted its own copy of the
   *    guest wallet. That shipped four duplicate "Personal Wallet" entries before it
   *    was caught.
   *
   *  - A cloud-side check, not just the local flag. The flag lives in AsyncStorage,
   *    so clearing app data or reinstalling wipes it. Without checking the cloud
   *    first, signing back in would migrate the freshly-seeded empty guest wallet
   *    and add a fifth duplicate. If any wallet already exists for this account, the
   *    migration is a no-op.
   *
   * Losing a guest's expense history to a sign-in they did not ask for would be the
   * worst thing this app could do, so the done-flag is written only after the upload
   * succeeds and local data is cleared strictly after that.
   */
  const migrateGuestData = useCallback(async (uid: string, displayName: string): Promise<void> => {
    const inFlight = migrationsInFlight.get(uid);
    if (inFlight) return inFlight;

    const run = (async () => {
      const doneKey = `kb_migrated_${uid}`;
      if (await AsyncStorage.getItem(doneKey) === '1') return;

      const cloud = getCloud();
      const cloudUser = { uid, displayName, email: '' };

      // Idempotence lives here, not only in the local flag: anything already in the
      // cloud for this account means a previous migration got there first.
      const existing = await cloud.getWallets(uid);
      if (existing.length > 0) {
        await AsyncStorage.setItem(doneKey, '1');
        return;
      }

      const [localWallets, localExpenses, localCategories] = await Promise.all([
        getStoredWallets(), getGuestExpenses(), getGuestCategories(),
      ]);

      for (const wallet of localWallets) {
        const cloudId = await cloud.createCloudWallet(cloudUser, wallet.name, wallet.isPersonal !== false);
        await cloud.setCloudBudget(cloudId, await getStoredBudget(wallet.id));
        await cloud.writeCloudExpenses(
          localExpenses
            .filter(e => e.walletId === wallet.id)
            .map(e => ({ ...e, walletId: cloudId, createdBy: { uid, name: displayName } }))
        );
      }

      if (localCategories.length > 0) await cloud.setCustomCategories(uid, localCategories);

      await AsyncStorage.setItem(doneKey, '1');
      await clearLocalData();
    })();

    migrationsInFlight.set(uid, run);
    try {
      await run;
    } finally {
      migrationsInFlight.delete(uid);
    }
  }, []);

  // Expenses are per wallet, so the Firestore subscription follows the active one.
  const unwatchExpenses = useRef<(() => void) | null>(null);

  // Full history, paged, so nothing is silently dropped.
  //
  // A failed history load is surfaced, not just toasted: the recent subscription
  // merges whatever it receives, so without this the screen fills with the newest
  // slice and looks like a complete wallet that happens to have no September.
  const loadFullHistory = useCallback(async (walletId: string) => {
    if (!cloudAvailable()) return;
    setHistoryLoadError(walletId, null);
    try {
      const { expenses, truncated } = await getCloud().fetchAllExpenses(walletId);
      setAllExpenses(current => {
        const byId = new Map<string, Expense>();
        for (const e of current) if (e.walletId === walletId) byId.set(e.id, e);
        for (const e of expenses) byId.set(e.id, e);
        return [...current.filter(e => e.walletId !== walletId), ...byId.values()];
      });
      if (truncated) {
        showNotification(
          'error',
          `This wallet has more than ${expenses.length} expenses — older ones are not shown.`
        );
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Could not load this wallet';
      setHistoryLoadError(walletId, message);
      showNotification('error', message);
    }
  }, [showNotification]);

  const watchExpenses = useCallback((walletId: string) => {
    if (!cloudAvailable()) return;
    unwatchExpenses.current?.();
    setAllExpenses(current => current.filter(e => e.walletId !== walletId));

    const merge = (rows: Expense[]) => setAllExpenses(current => {
      const byId = new Map<string, Expense>();
      for (const e of current) if (e.walletId === walletId) byId.set(e.id, e);
      for (const r of rows) byId.set(r.id, r);
      return [...current.filter(e => e.walletId !== walletId), ...byId.values()];
    });

    void loadFullHistory(walletId);
    unwatchExpenses.current = getCloud().subscribeToRecentExpenses(walletId, merge);
  }, [loadFullHistory]);

  // Guest: read from AsyncStorage.
  useEffect(() => {
    if (isCloud) return;
    setCloudWalletsReady(false);
    let cancelled = false;

    // Expenses written before multi-wallet support have no walletId, or one naming
    // a wallet that no longer exists. Left alone they are invisible — every read
    // filters by the active wallet — so they are re-homed onto the default wallet.
    const repairOrphans = async (known: ReadonlySet<string>): Promise<Expense[]> => {
      if (!known.has(DEFAULT_WALLET_ID)) return await getGuestExpenses();
      await assignOrphanedExpenses(DEFAULT_WALLET_ID, known);
      return await getGuestExpenses();
    };

    (async () => {
      try {
        const [storedWallets, storedActiveId, categories, expenses] = await Promise.all([
          getStoredWallets(),
          getActiveWalletId(),
          getGuestCategories(),
          getGuestExpenses(),
        ]);
        if (cancelled) return;

        const known = new Set(storedWallets.map(w => w.id));
        const repaired = await repairOrphans(known);

        // A stored id that no longer resolves would leave the app with no wallet
        // selected at all, so fall back to the first one.
        const nextActiveId = storedActiveId && known.has(storedActiveId)
          ? storedActiveId
          : (storedWallets[0]?.id ?? DEFAULT_WALLET_ID);

        const nextBudget = await getStoredBudget(nextActiveId);
        if (cancelled) return;
        setWallets(storedWallets);
        setActiveWalletId(nextActiveId);
        setCustomCategories(categories);
        setAllExpenses(repaired.length ? repaired : expenses);
        setBudgetState(nextBudget);
      } finally {
        if (!cancelled) setIsLoaded(true);
      }
    })();
    return () => { cancelled = true; };
  }, [isCloud]);

  // Cloud: migrate on the way in, then subscribe.
  useEffect(() => {
    if (!isCloud || session.type !== 'cloud' || !cloudAvailable()) return;
    let cancelled = false;
    let unwatchWallets: (() => void) | null = null;

    (async () => {
      try {
        await migrateGuestData(session.uid, session.displayName);
        if (cancelled) return;

        const cloud = getCloud();
        const categories = await cloud.getCustomCategories(session.uid);
        if (cancelled) return;
        setCustomCategories(categories);
        // Drop the local wallet list before subscribing. Its ids are local-only and
        // mean nothing in Firestore; leaving them selected meant the expense
        // subscription targeted documents that do not exist.
        setWallets([]);
        setActiveWalletId('');
        setAllExpenses([]);

        unwatchWallets = cloud.subscribeToWallets(session.uid, list => {
          if (cancelled || list.length === 0) return;
          setWallets(list);
          setCloudWalletsReady(true);
          // Pure: the budget read and the expense subscription are side effects, and
          // doing them in here means React re-running this updater (StrictMode does)
          // re-subscribes and re-reads. They live in their own effect below.
          setActiveWalletId(current => (list.some(w => w.id === current) ? current : list[0].id));
        });
      } catch (e: any) {
        showNotification('error', e?.message || 'Could not reach your cloud data');
      } finally {
        if (!cancelled) setIsLoaded(true);
      }
    })();

    return () => {
      cancelled = true;
      unwatchWallets?.();
      unwatchExpenses.current?.();
      unwatchExpenses.current = null;
      setAllExpenses([]);
    };
  }, [isCloud, session, migrateGuestData, showNotification]);

  // Following the active wallet: its budget comes off the wallet document, and its
  // expenses get their own subscription. Separate from the effect above so a
  // re-render never re-subscribes.
  useEffect(() => {
    if (!isCloud || !cloudWalletsReady) return;
    // Gated on the wallet existing in the current list too, so a wallet removed by
    // another device cannot leave a subscription pointed at a dead document.
    const wallet = wallets.find(w => w.id === activeWalletId);
    if (!wallet) return;

    setBudgetState(wallet.budget ?? 0);
    watchExpenses(wallet.id);
    return () => {
      unwatchExpenses.current?.();
      unwatchExpenses.current = null;
    };
  }, [isCloud, cloudWalletsReady, activeWalletId, wallets, watchExpenses]);

  // Who owes whom, netted across every split expense in this wallet. Derived, so it
  // can never drift from the expense list it summarises.
  const balances = useMemo<Record<string, number>>(
    () => calculateMemberBalances(activeWallet, expenses),
    [activeWallet, expenses]
  );
  const transfers = useMemo<DebtTransfer[]>(() => simplifyDebts(balances), [balances]);

  const monthSpendByWallet = useMemo<Record<string, number>>(() => {
    const { start, end } = isoMonthBounds();
    const totals: Record<string, number> = {};
    for (const e of allExpenses) {
      if (e.date < start || e.date > end) continue;
      totals[e.walletId] = (totals[e.walletId] ?? 0) + e.amount;
    }
    return totals;
  }, [allExpenses]);

  /**
   * All-time spend per wallet, so a wallet list can say "Rs. X in total" instead of
   * "Nothing this month" when the only expenses are older. That wording is true but
   * reads as an empty wallet, and it is what made two different wallets with 37 and 2
   * expenses look identical in the picker.
   */
  const totalSpendByWallet = useMemo<Record<string, number>>(() => {
    const totals: Record<string, number> = {};
    for (const e of allExpenses) totals[e.walletId] = (totals[e.walletId] ?? 0) + e.amount;
    return totals;
  }, [allExpenses]);

  const monthlyStats = useMemo<MonthlyStats>(() => {
    const { start, end } = isoMonthBounds();
    const currentMonthSpending = expenses
      .filter(e => e.date >= start && e.date <= end)
      .reduce((s, e) => s + e.amount, 0);
    return { currentMonthSpending };
  }, [expenses]);

  // ---- Expenses ----------------------------------------------------------

  // Applies a change to one wallet's expenses only. Other wallets' rows are
  // carried through untouched, so an edit or delete can never reach across the
  // boundary even if a stale id is passed in.
  const mutateWalletExpenses = useCallback(async (
    walletId: string,
    mutate: (rows: Expense[]) => Expense[],
  ): Promise<void> => {
    if (isCloud) {
      // Firestore is the source of truth when signed in: the subscription owns the
      // list, so a local write would only be overwritten on the next snapshot.
      throw new Error('Use the cloud expense actions while signed in');
    }
    const next = await mutateGuestExpenses(current => [
      ...current.filter(e => e.walletId !== walletId),
      ...mutate(current.filter(e => e.walletId === walletId)),
    ]);
    setAllExpenses(next);
  }, [isCloud]);

  /**
   * Applies a change to the active wallet's expenses, whichever side owns them.
   * Every write funnels through here so no caller has to branch on the session and
   * accidentally take the local path while signed in.
   */
  const commitExpenses = useCallback(async (
    walletId: string,
    mutate: (rows: Expense[]) => Expense[],
    persist: (row: Expense) => Promise<void>,
  ): Promise<void> => {
    if (!isCloud) {
      await mutateWalletExpenses(walletId, mutate);
      return;
    }
    const mine = allExpenses.filter(e => e.walletId === walletId);
    const updated = mutate(mine);
    const next = [...allExpenses.filter(e => e.walletId !== walletId), ...updated];
    setAllExpenses(next);
    // The Firestore snapshot will confirm shortly; this keeps the UI instant.
    const byId = new Map(mine.map(e => [e.id, e]));
    for (const row of updated) {
      await persist(row);
      byId.delete(row.id);
    }
    for (const removed of byId.values()) {
      await getCloud().deleteCloudExpense(walletId, removed.id);
    }
  }, [isCloud, allExpenses, mutateWalletExpenses]);

  const addExpense = useCallback(async (
    amount: number, category: Category, note: string, date?: Date, split?: Split
  ): Promise<void> => {
    validateAmount(amount);
    validateNote(note);

    // A split that does not add up to the total would leave the books permanently
    // unbalanced, so it is rejected at the write rather than trusted from the UI.
    if (split && !isSplitSumValid(split, amount)) {
      throw new Error('The split does not add up to the total');
    }
    if (split && (!Array.isArray(split.participants) || split.participants.length < 2)) {
      throw new Error('Pick at least two people to split between');
    }

    const walletId = activeWallet.id;
    const newExpense: Expense = {
      id: uuid(),
      categoryId: category.id,
      categoryName: category.name,
      categoryEmoji: category.emoji,
      amount,
      note: note.trim(),
      date: date ? `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}` : todayISO(),
      walletId,
      // The Firestore rules require createdBy.uid to equal the signed-in user, so a
      // hardcoded 'guest' here denies every write once someone signs in.
      createdBy: isCloud && session.type === 'cloud'
        ? { uid: session.uid, name: session.displayName }
        : { uid: 'guest', name: 'Guest' },
      createdAt: Date.now(),
      ...(split ? { splitDetails: split } : {}),
    };

    // mutateGuestExpenses serializes through a write queue, so two rapid saves both
    // land. An early-return guard here would silently drop the second one instead.
    await commitExpenses(
      walletId,
      rows => [...rows, newExpense],
      row => (isCloud
        ? getCloud().addCloudExpense(row)
        : Promise.resolve()),
    );
    showNotification('success', 'Expense added');
  }, [activeWallet, commitExpenses, isCloud, session, showNotification]);

  const updateExpense = useCallback(async (id: string, amount: number, note: string): Promise<void> => {
    validateAmount(amount);
    validateNote(note);
    await commitExpenses(
      activeWallet.id,
      rows => rows.map(p => (p.id === id ? { ...p, amount, note: note.trim() } : p)),
      row => (isCloud ? getCloud().updateCloudExpense(row) : Promise.resolve()),
    );
    showNotification('success', 'Expense updated');
  }, [activeWallet.id, commitExpenses, isCloud, showNotification]);

  const deleteExpense = useCallback(async (id: string): Promise<void> => {
    // commitExpenses already deletes whatever the mutation dropped; calling
    // deleteCloudExpense here as well would just be a second round-trip.
    await commitExpenses(
      activeWallet.id,
      rows => rows.filter(p => p.id !== id),
      () => Promise.resolve(),
    );
  }, [activeWallet.id, commitExpenses]);

  const restoreExpense = useCallback(async (expense: Expense): Promise<void> => {
    await commitExpenses(
      activeWallet.id,
      rows => (rows.some(p => p.id === expense.id) ? rows : [...rows, expense]),
      row => (isCloud ? getCloud().addCloudExpense(row) : Promise.resolve()),
    );
  }, [activeWallet.id, commitExpenses, isCloud]);

  // A restore is scoped to the wallet the user is looking at: the backup's rows are
  // re-homed onto the active wallet so restoring an old file cannot silently write
  // another wallet's expenses into this one.
  const replaceExpenses = useCallback(async (next: Expense[]): Promise<void> => {
    if (isCloud) {
      // A restore is scoped to the wallet being viewed, so re-home the rows onto it.
      for (const row of next) {
        await getCloud().addCloudExpense({ ...row, walletId: activeWallet.id });
      }
      watchExpenses(activeWallet.id);
      return;
    }
    const saved = await mutateGuestExpenses(current => [
      ...current.filter(e => e.walletId !== activeWallet.id),
      ...next.map(e => ({ ...e, walletId: activeWallet.id })),
    ]);
    setAllExpenses(saved);
  }, [activeWallet.id, isCloud, watchExpenses]);

  // ---- Wallets -------------------------------------------------------------

  const validateWalletName = (raw: string): string => {
    const name = raw.trim();
    if (!name) throw new Error('Give the wallet a name');
    if (name.length > MAX_WALLET_NAME_LENGTH) {
      throw new Error(`Wallet name too long (max ${MAX_WALLET_NAME_LENGTH} characters)`);
    }
    return name;
  };

  const setActiveWallet = useCallback(async (walletId: string): Promise<void> => {
    if (!wallets.some(w => w.id === walletId)) throw new Error('That wallet no longer exists');
    setActiveWalletId(walletId);
    // While signed in the budget and expense subscription follow activeWalletId in
    // their own effect; re-doing it here would race that one.
    if (!isCloud) await Promise.all([saveActiveWalletId(walletId), loadBudget(walletId)]);
  }, [wallets, loadBudget, isCloud]);

  const createWallet = useCallback(async (rawName: string, isPersonal = true): Promise<string> => {
    const name = validateWalletName(rawName);
    const wallet: Wallet = {
      id: `w_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
      name,
      ownerId: 'guest',
      members: ['guest'],
      currency: 'Rs.',
      createdAt: Date.now(),
      isPersonal,
    };
    if (isCloud && session.type === 'cloud') {
      const cloudUser = { uid: session.uid, displayName: session.displayName, email: session.email };
      const cloudId = await getCloud().createCloudWallet(cloudUser, name, isPersonal);
      showNotification('success', `Created ${name}`);
      return cloudId;   // the wallets subscription selects and loads it
    }

    const next = [...wallets, wallet];
    await saveWallets(next);
    setWallets(next);

    // Switch inline instead of going through setActiveWallet. That helper guards
    // against unknown ids using the wallet list captured when *it* was created,
    // which by definition does not contain the wallet just added — so every new
    // wallet was rejected as "That wallet no longer exists" and the user was never
    // moved onto the wallet they had just made.
    setActiveWalletId(wallet.id);
    await Promise.all([saveActiveWalletId(wallet.id), loadBudget(wallet.id)]);

    showNotification('success', `Switched to ${name}`);
    return wallet.id;
  }, [wallets, loadBudget, isCloud, session, showNotification]);

  const renameWallet = useCallback(async (walletId: string, rawName: string): Promise<void> => {
    const name = validateWalletName(rawName);
    if (!wallets.some(w => w.id === walletId)) throw new Error('That wallet no longer exists');
    if (isCloud) {
      await getCloud().renameCloudWallet(walletId, name);
      return;
    }
    const next = wallets.map(w => (w.id === walletId ? { ...w, name } : w));
    await saveWallets(next);
    setWallets(next);
  }, [wallets, isCloud]);

  const deleteWallet = useCallback(async (walletId: string): Promise<void> => {
    if (wallets.length <= 1) throw new Error('You need at least one wallet');
    const target = wallets.find(w => w.id === walletId);
    if (!target) throw new Error('That wallet no longer exists');

    if (isCloud) {
      await getCloud().deleteCloudWallet(walletId);
      showNotification('success', `Deleted ${target.name}`);
      return;   // the wallets subscription drops it and reselects
    }

    const nextWallets = wallets.filter(w => w.id !== walletId);
    const nextExpenses = await mutateGuestExpenses(current => current.filter(e => e.walletId !== walletId));
    await saveWallets(nextWallets);
    setWallets(nextWallets);
    setAllExpenses(nextExpenses);

    if (walletId === activeWalletId) {
      const fallback = nextWallets[0];
      setActiveWalletId(fallback.id);
      await Promise.all([saveActiveWalletId(fallback.id), loadBudget(fallback.id)]);
    }
    showNotification('success', `Deleted ${target.name}`);
  }, [wallets, activeWalletId, loadBudget, showNotification]);

  // ---- Members -------------------------------------------------------------

  // Members are keyed by an opaque id and carry their own display name, so the
  // same shape covers both a local guest adding people by name and a shared
  // wallet whose members arrive through an invite code.
  const ownerIdOf = useCallback((walletId: string): string | null => {
    const wallet = wallets.find(w => w.id === walletId);
    return wallet ? wallet.ownerId : null;
  }, [wallets]);

  const addMember = useCallback(async (walletId: string, name: string): Promise<string> => {
    const displayName = name.trim();
    if (!displayName) throw new Error('Give the person a name');
    if (displayName.length > 40) throw new Error('Name too long (max 40 characters)');

    const wallet = wallets.find(w => w.id === walletId);
    if (!wallet) throw new Error('That wallet no longer exists');

    const members = Array.isArray(wallet.members) ? wallet.members : [];
    if (members.length >= MAX_WALLET_MEMBERS) {
      throw new Error(`A wallet can hold at most ${MAX_WALLET_MEMBERS} people`);
    }
    const profiles = wallet.memberProfiles ?? {};
    if (Object.values(profiles).some(p => p.toLowerCase() === displayName.toLowerCase())) {
      throw new Error(`${displayName} is already in this wallet`);
    }

    const userId = `m_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    if (isCloud) {
      // Firestore only lets an account add *itself* to a wallet's member list, and
      // only in a write that touches nothing but `members`. So a name added here
      // could never become a member of a cloud wallet, and attempting it fails
      // silently at the rules layer. Adding people to a cloud wallet is what invite
      // codes are for; this path is guest-only by design.
      throw new Error(
        'Signed-in wallets get their people from invite codes. '
        + 'Share this wallet with a code to split with someone.'
      );
    }

    const nextWallets = wallets.map(w => (w.id === walletId
      ? {
          ...w,
          members: [...members, userId],
          memberProfiles: { ...profiles, [userId]: displayName },
        }
      : w));

    await saveWallets(nextWallets);
    setWallets(nextWallets);
    return userId;
  }, [wallets, isCloud]);

  const removeMember = useCallback(async (walletId: string, userId: string): Promise<void> => {
    const wallet = wallets.find(w => w.id === walletId);
    if (!wallet) throw new Error('That wallet no longer exists');
    if (wallet.ownerId === userId) throw new Error('The wallet owner cannot be removed');

    const profiles = { ...(wallet.memberProfiles ?? {}) };
    delete profiles[userId];
    if (isCloud) {
      await getCloud().updateWalletMembers(
        walletId, (wallet.members ?? []).filter(id => id !== userId), profiles
      );
      return;
    }

    const nextWallets = wallets.map(w => (w.id === walletId
      ? { ...w, members: (w.members ?? []).filter(id => id !== userId), memberProfiles: profiles }
      : w));

    await saveWallets(nextWallets);
    setWallets(nextWallets);
  }, [wallets, isCloud]);

  const memberName = useCallback((wallet: Wallet, userId: string): string => {
    const profile = wallet.memberProfiles?.[userId];
    if (typeof profile === 'string' && profile.trim()) return profile;
    return userId === wallet.ownerId ? 'You' : 'Someone';
  }, []);

  // ---- Shared wallets -------------------------------------------------------

  const getInviteCode = useCallback(async (walletId: string) => {
    if (!isCloud || session.type !== 'cloud') {
      throw new Error('Sign in to share a wallet with an invite code');
    }
    // The wallet name comes back with the code so callers can label the invite
    // without a second lookup.
    const code = await getCloud().getOrCreateInviteCode(walletId);
    const wallet = wallets.find(w => w.id === walletId);
    return { code, name: wallet?.name ?? 'this wallet' };
  }, [isCloud, session, wallets]);

  const joinWallet = useCallback(async (code: string) => {
    if (!isCloud || session.type !== 'cloud') {
      throw new Error('Sign in to join a shared wallet');
    }
    const cloudUser = { uid: session.uid, displayName: session.displayName, email: session.email };
    return getCloud().joinWalletByCode(cloudUser, code);
  }, [isCloud, session]);

  const leaveWallet = useCallback(async (walletId: string): Promise<void> => {
    if (!isCloud || session.type !== 'cloud') {
      throw new Error('Sign in to leave a shared wallet');
    }
    const wallet = wallets.find(w => w.id === walletId);
    if (wallet?.ownerId === session.uid) {
      throw new Error('You own this wallet — delete it instead of leaving');
    }
    await getCloud().leaveCloudWallet(session.uid, walletId);
    showNotification('success', `Left ${wallet?.name ?? 'the wallet'}`);
  }, [isCloud, session, wallets, showNotification]);

// ---- Settlements -------------------------------------------------------

  /**
   * Marks debt settled from `fromUserId` to `toUserId`.
   *
   * Settlements live on individual expenses, but "settle" is asked for in the
   * aggregate — "Ram owes me 700, that's done". So the pair's outstanding shares
   * are walked oldest-first and marked until the recorded amount covers the debt
   * the balance screen showed. That keeps the books exact instead of inventing a
   * wallet-level settlement that no expense can vouch for.
   *
   * Reversible: `undoSettleUp` removes exactly what this wrote.
   */
  const settleUp = useCallback(async (
    fromUserId: string, toUserId: string
  ): Promise<{ settled: number; unsettled: number }> => {
    const due = -(balances[fromUserId] ?? 0);
    if (due <= 0) return { settled: 0, unsettled: 0 };

    // One planner for both storage modes. The two implementations used to be
    // separate loops and disagreed about ordering, so the same debt could be
    // settled against different expenses depending on whether the user was a guest.
    const now = Date.now();
    const settledBy = session.type === 'cloud' ? session.uid : activeWallet.ownerId;
    const { updates, unsettled } = planSettlement(expenses, fromUserId, toUserId, due);

    if (updates.length === 0) {
      showNotification('error', 'Could not find the expenses behind that balance');
      return { settled: 0, unsettled };
    }

    if (isCloud) {
      for (const { expense, share } of updates) {
        await getCloud().recordSettlement(
          expense, settlementFor(fromUserId, toUserId, share, settledBy, now)
        );
      }
    } else {
      const targets = new Map(updates.map(u => [u.expense.id, u.share]));
      await mutateWalletExpenses(activeWallet.id, rows => rows.map(row => {
        const share = targets.get(row.id);
        if (share === undefined || !row.splitDetails) return row;
        return {
          ...row,
          splitDetails: {
            ...row.splitDetails,
            settlements: [
              ...(row.splitDetails.settlements ?? []),
              settlementFor(fromUserId, toUserId, share, settledBy, now),
            ],
          },
        };
      }));
    }

    return { settled: updates.length, unsettled };
  }, [activeWallet, balances, expenses, isCloud, session, mutateWalletExpenses, showNotification]);

  const undoSettleUp = useCallback(async (fromUserId: string, toUserId: string): Promise<number> => {
    let touched = 0;
    await mutateWalletExpenses(activeWallet.id, rows => rows.map(row => {
      const split = row.splitDetails;
      if (!split || split.paidBy !== toUserId) return row;
      const settlements = split.settlements ?? [];
      if (!settlements.some(s => s.fromUserId === fromUserId && s.toUserId === toUserId)) return row;

      touched += 1;
      return {
        ...row,
        splitDetails: {
          ...split,
          settlements: settlements.filter(s => !(s.fromUserId === fromUserId && s.toUserId === toUserId)),
        },
      };
    }));
    return touched;
  }, [activeWallet.id, mutateWalletExpenses]);

  // ---- Budget ------------------------------------------------------------

  const setBudget = useCallback(async (amount: number): Promise<void> => {
    if (!Number.isFinite(amount) || amount < 0) throw new Error('Enter a valid budget');
    if (isCloud) {
      await getCloud().setCloudBudget(activeWallet.id, amount);
    } else {
      await saveStoredBudget(activeWallet.id, amount);
    }
    setBudgetState(amount);
  }, [activeWallet, isCloud]);

  // ---- Categories ----------------------------------------------------------

  const getAllCategories = useCallback((): Category[] => {
    // "Other" sorts last, matching the web picker.
    const all = [...EXPENSE_CATEGORIES, ...customCategories];
    return [...all].sort((a, b) => {
      const aOther = a.name.toLowerCase() === 'other';
      const bOther = b.name.toLowerCase() === 'other';
      if (aOther && !bOther) return 1;
      if (!aOther && bOther) return -1;
      return a.name.localeCompare(b.name);
    });
  }, [customCategories]);

  const addCustomCategory = useCallback(async (category: Category): Promise<void> => {
    // Restores replay a file's categories through here, and a file that contains a
    // category the account already has would otherwise append a second copy under
    // the same id — two rows, the same key, and React throwing on duplicate keys
    // before the list ever renders.
    if (customCategories.some(c => c.id === category.id)) return;
    if (customCategories.some(c => c.name.toLowerCase() === category.name.toLowerCase())) return;

    const next = [...customCategories, category];
    if (isCloud && session.type === 'cloud') {
      await getCloud().setCustomCategories(session.uid, next);
    } else {
      await saveGuestCategories(next);
    }
    setCustomCategories(next);
  }, [customCategories, isCloud, session]);

  const deleteCustomCategory = useCallback(async (categoryId: string): Promise<void> => {
    const next = customCategories.filter(c => c.id !== categoryId);
    if (isCloud && session.type === 'cloud') {
      await getCloud().setCustomCategories(session.uid, next);
    } else {
      await saveGuestCategories(next);
    }
    setCustomCategories(next);
  }, [customCategories, isCloud, session]);

  /**
   * Restores a whole backup: its wallets, then the expenses belonging to each, the
   * per-wallet budget, and any custom categories.
   *
   * Runs wallets before expenses because every expense write needs a real wallet id
   * to target, and categories last so a picker never sees a half-restored list.
   */
  const restoreFromBackup = useCallback(async (backup: BackupData): Promise<RestoreSummary> => {
    const uid = session.type === 'cloud' ? session.uid : 'guest';
    const name = session.type === 'cloud' ? session.displayName : 'You';

    const { valid, rejected } = sanitizeBackupExpenses(backup.data.expenses);
    if (valid.length === 0) {
      throw new Error('That backup has no expenses we can read');
    }

    const restorePlan = buildRestorePlan(backup, valid, uid, name);
    const orphaned = countOrphanedExpenses(restorePlan);

    const created = new Map<string, string>();
    const budgets = new Map<string, number>();

    const reused = matchExistingWallets(restorePlan, wallets);

    for (const { sourceId, wallet } of restorePlan.wallets) {
      const existingId = reused.get(sourceId);
      if (existingId) {
        created.set(sourceId, existingId);
      } else if (isCloud && session.type === 'cloud') {
        const cloudId = await getCloud().createCloudWallet(
          { uid, displayName: name, email: session.email },
          wallet.name,
          wallet.isPersonal !== false,
        );
        created.set(sourceId, cloudId);
      } else {
        const localId = await createWallet(wallet.name, wallet.isPersonal !== false);
        created.set(sourceId, localId);
      }
      const budget = (backup.data.wallets ?? []).find(w => w.id === sourceId)?.budget;
      const newId = created.get(sourceId)!;
      if (typeof budget === 'number' && budget > 0) budgets.set(newId, budget);
    }

    const rows = remapExpenses(restorePlan, created);

    if (isCloud) {
      // One bulk write per wallet: the rules count each write against the caller,
      // and per-row writes are a round trip each.
      const byWallet = new Map<string, Expense[]>();
      for (const row of rows) {
        const bucket = byWallet.get(row.walletId);
        if (bucket) bucket.push(row);
        else byWallet.set(row.walletId, [row]);
      }
      for (const [walletId, list] of byWallet) {
        await getCloud().writeCloudExpenses(list);
      }
      for (const [walletId, amount] of budgets) await getCloud().setCloudBudget(walletId, amount);
    } else {
      await saveGuestExpenses(rows);
      for (const [walletId, amount] of budgets) await saveStoredBudget(walletId, amount);
    }

    // One write for the whole batch, not a loop over addCustomCategory. That function
    // assigns rather than appends functionally, and every call in the loop closed over
    // the same pre-restore list, so a backup carrying two categories this account did
    // not have wrote [existing, B] and silently dropped A — the second write overwrote
    // the first. Batching also keeps the restore a single round trip and makes a
    // repeated import a no-op rather than a chance to append the same id twice.
    const newCategories = dedupeCategories(customCategories, restorePlan.categories);
    if (newCategories.length > 0) {
      const next = [...customCategories, ...newCategories];
      if (isCloud && session.type === 'cloud') {
        await getCloud().setCustomCategories(uid, next);
      } else {
        await saveGuestCategories(next);
      }
      setCustomCategories(next);
    }

    // Cloud categories live on the user document; local ones in AsyncStorage. Either
    // way the stored list is re-read so the picker cannot show a half-restored set.
    if (!isCloud) {
      try { setCustomCategories(await getGuestCategories()); } catch { /* keep what we have */ }
    }

    // The restored budget landed on the new wallet document, but the in-memory value
    // still describes the wallet that was open when the restore started, so Settings
    // would keep showing the old limit until the next switch.
    if (budgets.size > 0) {
      try {
        const current = budgets.get(activeWallet.id) ?? await getStoredBudget(activeWallet.id);
        setBudgetState(current);
      } catch { /* the wallet view will refresh on switch */ }
    }

    return {
      wallets: restorePlan.wallets.length,
      expenses: rows.length,
      categories: restorePlan.categories.length,
      rejected,
      orphaned,
    };
  }, [isCloud, session, createWallet, customCategories]);


  // ---- Data management -----------------------------------------------------

  const clearAllData = useCallback(async (): Promise<void> => {
    if (isCloud) {
      throw new Error('Your data is in the cloud. Use "Delete my account" to remove it.');
    }
    await clearLocalData();
    const fresh = createGuestWallet();
    await saveWallets([fresh]);
    await saveActiveWalletId(fresh.id);
    setWallets([fresh]);
    setActiveWalletId(fresh.id);
    setAllExpenses([]);
    setBudgetState(DEFAULT_BUDGET);
    setCustomCategories([]);
  }, [isCloud]);

  // Memoised deliberately. Left as a plain object literal, this value had a new
  // identity on every render of the provider, so every consumer of useStore()
  // re-rendered whenever any piece of store state moved — including the toast
  // timer, a budget keystroke, or each Firestore snapshot. Home re-renders the whole
  // expense list for those, which is where the app's sluggishness came from.
  //
  // Every function here is a useCallback and every derived collection a useMemo, so
  // this only changes identity when the data it exposes actually changes.
  const value: StoreContextValue = useMemo(() => ({
    activeWallet,
    wallets,
    expenses,
    monthSpendByWallet,
    totalSpendByWallet,
    budget,
    monthlyStats,
    isLoaded,
    historyLoadError,
    setHistoryLoadError,
    retryHistory: loadFullHistory,
    addExpense,
    updateExpense,
    deleteExpense,
    restoreExpense,
    replaceExpenses,
    restoreFromBackup,
    setBudget,
    setActiveWallet,
    createWallet,
    renameWallet,
    deleteWallet,
    addMember,
    removeMember,
    memberName,
    balances,
    transfers,
    getInviteCode,
    joinWallet,
    leaveWallet,
    settleUp,
    undoSettleUp,
    customCategories,
    addCustomCategory,
    deleteCustomCategory,
    getAllCategories,
    clearAllData,
    notifications,
    showNotification,
    dismissNotification,
    triggerHaptic,
  }), [
    activeWallet, wallets, expenses, monthSpendByWallet, totalSpendByWallet, budget,
    monthlyStats, isLoaded,
    historyLoadError, customCategories, notifications,
    setHistoryLoadError, loadFullHistory, addExpense, updateExpense, deleteExpense,
    restoreExpense, replaceExpenses, restoreFromBackup, setBudget, setActiveWallet,
    createWallet, renameWallet, deleteWallet, addMember, removeMember, memberName,
    getInviteCode, joinWallet, leaveWallet, settleUp, undoSettleUp, addCustomCategory,
    deleteCustomCategory, getAllCategories, clearAllData, showNotification,
    dismissNotification, triggerHaptic, balances, transfers,
  ]);

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
};
